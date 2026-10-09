"""Additive migration for the 10-category extension (SQLite + MySQL).

Creates new tables and adds new columns if missing. Safe to run repeatedly.
"""
from __future__ import annotations
from datetime import datetime
from sqlalchemy import inspect, text

from .deps import engine
from .models import Base


def _cols(insp, table: str) -> set[str]:
    try:
        return {c["name"] for c in insp.get_columns(table)}
    except Exception:
        return set()


def _backfill_codes(conn, table: str, date_expr: str) -> None:
    """Hand every row that has no code yet its REP-<year>-NNNN, oldest first,
       so the yearly run reads in the same order as the record dates."""
    have = conn.execute(text(
        f"SELECT COUNT(*) FROM {table} WHERE COALESCE(code, '') <> ''")).scalar() or 0
    empty = conn.execute(text(
        f"SELECT COUNT(*) FROM {table} WHERE COALESCE(code, '') = ''")).scalar() or 0
    if not empty:
        return
    top: dict[str, int] = {}
    for (c,) in conn.execute(text(
            f"SELECT code FROM {table} WHERE COALESCE(code, '') <> ''")).fetchall():
        head, _, tail = str(c).rpartition("-")
        if head.startswith("REP-"):
            try:
                top[head[4:]] = max(top.get(head[4:], 0), int(tail))
            except ValueError:
                pass
    rows = conn.execute(text(
        f"SELECT id, {date_expr} AS d FROM {table} WHERE COALESCE(code, '') = '' "
        f"ORDER BY d IS NULL, d, id")).fetchall()
    this_year = str(datetime.now().year)
    for rid, d in rows:
        year = str(d)[:4] if d else this_year
        top[year] = top.get(year, 0) + 1
        conn.execute(text(f"UPDATE {table} SET code = :c WHERE id = :i"),
                     {"c": f"REP-{year}-{top[year]:04d}", "i": rid})
    print(f"backfilled {len(rows)} codes in {table} ({have} already had one)")


def main() -> None:
    Base.metadata.create_all(bind=engine)  # creates new tables
    with engine.begin() as conn:
        insp = inspect(conn)
        if "rooms" in insp.get_table_names():
            have = _cols(insp, "rooms")
            for col, ddl in [
                ("width_m", "FLOAT"), ("length_m", "FLOAT"),
                ("height_m", "FLOAT"), ("floor_area_m2", "FLOAT"),
            ]:
                if col not in have:
                    conn.execute(text(f"ALTER TABLE rooms ADD COLUMN {col} {ddl}"))
                    print("added rooms." + col)
        if "install_points" in insp.get_table_names():
            have = _cols(insp, "install_points")
            if "spec" not in have:
                ddl = "JSON" if conn.dialect.name == "mysql" else "TEXT"
                conn.execute(text(f"ALTER TABLE install_points ADD COLUMN spec {ddl}"))
                print("added install_points.spec")
        # หมวดเพิ่มเติม: ถังดับเพลิง · ไฟฉุกเฉิน · ป้ายทางออกฉุกเฉิน · อื่น ๆ
        if "categories" in insp.get_table_names():
            if "work_type" not in _cols(insp, "categories"):
                conn.execute(text("ALTER TABLE categories ADD COLUMN work_type VARCHAR(32) DEFAULT ''"))
                print("added categories.work_type")
            # ประเภทงานของแต่ละหมวด — ตัวตั้งต้นที่หน้า “จุดใหม่” และใบแจ้งเสียใช้ร่วมกัน
            CAT_WORK = {
                "L": "electrical", "P": "electrical", "SW": "electrical", "MDB": "electrical",
                "SEN": "electrical", "FAN": "electrical", "EL": "electrical", "EX": "electrical",
                "AC": "building", "W": "building", "FE": "building",
                "OT": "other",
            }
            for cat_code, wt in CAT_WORK.items():
                conn.execute(text("UPDATE categories SET work_type = :w "
                                  "WHERE code = :c AND COALESCE(work_type, '') = ''"),
                             {"w": wt, "c": cat_code})
            have_cats = {c for (c,) in conn.execute(text("SELECT code FROM categories")).fetchall()}
            for code, en, th, icon, color, wt in [
                ("FE", "Fire Extinguisher", "ถังดับเพลิง", "fire-extinguisher", "#b03a2e", "building"),
                ("EL", "Emergency Light", "ไฟฉุกเฉิน", "flashlight", "#d68910", "electrical"),
                ("EX", "Emergency Exit Sign", "ป้ายทางออกฉุกเฉิน", "door-open", "#1f7a5c", "electrical"),
                ("OT", "Other", "อื่นๆ", "circle-help", "#6b7280", "other"),
            ]:
                if code not in have_cats:
                    conn.execute(text(
                        "INSERT INTO categories (code, name_en, name_th, icon, color, work_type) "
                        "VALUES (:c, :en, :th, :i, :col, :wt)"),
                        {"c": code, "en": en, "th": th, "i": icon, "col": color, "wt": wt})
                    print(f"added category {code} · {en}")
        if "reports" in insp.get_table_names():
            have = _cols(insp, "reports")
            if "work_type" not in have:
                conn.execute(text("ALTER TABLE reports ADD COLUMN work_type VARCHAR(32) DEFAULT ''"))
                print("added reports.work_type")
            if "code" not in have:
                conn.execute(text("ALTER TABLE reports ADD COLUMN code VARCHAR(32) DEFAULT ''"))
                print("added reports.code")
            if "quotation_attachment" not in have:
                conn.execute(text("ALTER TABLE reports ADD COLUMN quotation_attachment VARCHAR(256) DEFAULT ''"))
                print("added reports.quotation_attachment")
            _backfill_codes(conn, "reports", "reported_at")
            # ใบแจ้งเก่ายังไม่มีประเภทงาน — ใช้ประเภทงานของหมวดจุดติดตั้ง (แก้ทีหลังได้)
            try:
                rows = conn.execute(text(
                    "SELECT r.id, COALESCE(c.work_type, '') FROM reports r "
                    "JOIN install_points p ON p.id = r.install_point_id "
                    "LEFT JOIN categories c ON c.id = p.category_id "
                    "WHERE COALESCE(r.work_type, '') = ''")).fetchall()
                for rid, wt in rows:
                    conn.execute(text("UPDATE reports SET work_type = :w WHERE id = :i"),
                                 {"w": wt or "other", "i": rid})
                if rows:
                    print(f"backfilled work_type on {len(rows)} reports")
            except Exception as e:  # never let a backfill stop the migration
                print("work_type backfill skipped:", e)
        if "repairs" in insp.get_table_names():
            have = _cols(insp, "repairs")
            if "supplier_id" not in have:
                conn.execute(text("ALTER TABLE repairs ADD COLUMN supplier_id INTEGER"))
                print("added repairs.supplier_id")
            if "po_no" not in have:
                conn.execute(text("ALTER TABLE repairs ADD COLUMN po_no VARCHAR(32) DEFAULT ''"))
                print("added repairs.po_no")
            for col, ddl in [
                ("started_at", "DATETIME"),
                ("completed_at", "DATETIME"),
                ("po_date", "DATETIME"),
                ("quotation_attachment", "VARCHAR(256)"),
                ("po_attachment", "VARCHAR(256)"),
            ]:
                if col not in have:
                    conn.execute(text(f"ALTER TABLE repairs ADD COLUMN {col} {ddl} DEFAULT ''" if col.endswith("attachment") else f"ALTER TABLE repairs ADD COLUMN {col} {ddl}"))
                    print(f"added repairs.{col}")
            if "code" not in have:
                conn.execute(text("ALTER TABLE repairs ADD COLUMN code VARCHAR(32) DEFAULT ''"))
                print("added repairs.code")
            _backfill_codes(conn, "repairs",
                            "COALESCE(po_date, completed_at, started_at, repaired_at)")
        # Multi-trade suppliers: lift the legacy single `work_type` into the
        # join table so a supplier's trades survive as a real list.
        if "suppliers" in insp.get_table_names() and "supplier_work_types" in insp.get_table_names():
            rows = conn.execute(text(
                "SELECT id, work_type FROM suppliers WHERE COALESCE(work_type,'') <> ''")).fetchall()
            for sid, wt in rows:
                already = conn.execute(text(
                    "SELECT COUNT(*) FROM supplier_work_types WHERE supplier_id = :s"),
                    {"s": sid}).scalar() or 0
                if already:
                    continue
                seen: set[str] = set()
                parts = [p.strip() for p in str(wt).split("/") if p.strip()]
                for i, name in enumerate(p for p in parts if p.lower() not in seen):
                    seen.add(name.lower())
                    conn.execute(text(
                        "INSERT INTO supplier_work_types (supplier_id, name, sort_order) "
                        "VALUES (:s, :n, :o)"), {"s": sid, "n": name[:128], "o": i})
                print(f"backfilled supplier {sid} work types: {parts}")
        # Breaker specs + panel main spec (หมวด 4)
        if "panels" in insp.get_table_names():
            have = _cols(insp, "panels")
            for col in ("main_breaker", "phase", "notes"):
                if col not in have:
                    ddl = "TEXT" if col == "notes" else "VARCHAR(128)"
                    conn.execute(text(f"ALTER TABLE panels ADD COLUMN {col} {ddl}"))
                    print("added panels." + col)
        if "breakers" in insp.get_table_names():
            have = _cols(insp, "breakers")
            for col, ddl in [
                ("poles", "VARCHAR(8)"), ("breaker_type", "VARCHAR(16)"),
                ("rated_ka", "FLOAT"), ("brand_model", "VARCHAR(128)"),
                ("purpose", "VARCHAR(128)"), ("controls", "VARCHAR(256)"),
            ]:
                if col not in have:
                    conn.execute(text(f"ALTER TABLE breakers ADD COLUMN {col} {ddl}"))
                    print("added breakers." + col)
    print("migrate: ok")


if __name__ == "__main__":
    main()
