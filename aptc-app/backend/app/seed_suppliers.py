"""Demo suppliers for testing the Suppliers screen — run, look, then purge.

    python -m app.seed_suppliers            # create (or refresh) 10 suppliers
    python -m app.seed_suppliers --purge    # remove exactly what it created

Every company carries 2–3 trades, a full contact card, and most of them a
contact history, so search / filter / sort / edit / history all have something
real to chew on. Job counts and costs come from report+repair pairs written on
existing install points; those reports are closed (`done`) so they never show
up as open jobs on the dashboard.

What was created is recorded in `backend/.demo_suppliers.json`, which is what
`--purge` reads — nothing else in the database is touched.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import select

from .deps import SessionLocal
from .models import (InstallPoint, Repair, Report, Supplier, SupplierContact,
                     SupplierWorkType, User)

MARKER = Path(__file__).resolve().parent.parent / ".demo_suppliers.json"

# น้ำหนักงานที่ใช้ซ้ำกันหลายบริษัท — ทำให้แท็บ filter มีตัวเลขที่ต่างกันจริง
LIGHTING = "ไฟฟ้าแสงสว่าง"
PANEL = "ตู้ไฟ / เบรกเกอร์"
GENERATOR = "เครื่องกำเนิดไฟฟ้า"
AC_CLEAN = "ล้างแอร์"
AC_REPAIR = "ซ่อมแอร์"
COOLING = "ระบบทำความเย็น"
FIRE = "ระบบดับเพลิง"
FIRE_ALARM = "แจ้งเตือนอัคคีภัย"
EXTINGUISHER = "ถังดับเพลิง"
PLUMBING = "ประปา / สุขาภิบาล"
PUMP = "ปั๊มน้ำ"
LIFT = "ลิฟต์"
CCTV = "กล้องวงจรปิด"
ACCESS = "ควบคุมการเข้า-ออก"
TRANSFORMER = "หม้อแปลงไฟฟ้า"
EARTHING = "ระบบสายดิน"
GENERAL = "งานซ่อมทั่วไป"
CLEANING = "ทำความสะอาด"

SUPPLIERS: list[dict] = [
    {
        "company": "ไทยพาวเวอร์ ซิสเต็มส์ จำกัด",
        "work_types": [LIGHTING, PANEL, GENERATOR],
        "contact": {"name": "คุณสมชาย ใจดี", "phone": "081-234-5678",
                    "line_id": "thaipower.somchai", "email": "somchai@thaipower.co.th"},
        "notes": "เข้าพื้นที่ต้องแจ้งล่วงหน้า 1 วัน · มีใบรับรองวิศวกรรมไฟฟ้า",
        "history": [
            {"name": "คุณวีรชัย ทองคำ", "phone": "081-111-2222", "email": "weerachai@thaipower.co.th",
             "from": "2022-06-01", "to": "2024-03-15", "note": "ย้ายไปดูแลเขตภาคเหนือ"},
            {"name": "คุณนภัสสร แสงทอง", "phone": "082-333-4444", "email": "napassorn@thaipower.co.th",
             "from": "2024-03-15", "to": "2025-11-01", "note": "ลาคลอด ย้ายงาน"},
        ],
        "jobs": [
            ("L-005", "หลอดไฟกระพริบทั้งแถว", "เปลี่ยนบัลลาสต์ LED 2 ชุด", 2400.0, "2025-12-08"),
            ("SW-101", "สวิตช์ไฟสำรองกดไม่ติด", "เปลี่ยนสวิตช์ + ตรวจวงจรย่อย", 1800.0, "2026-02-19"),
            ("L-002", "ไฟสำรองไม่ติดตอนไฟดับ", "เปลี่ยนชุดแบตเตอรี่สำรอง", 5600.0, "2026-05-06"),
        ],
    },
    {
        "company": "บางกอก คูลลิ่ง เซอร์วิส",
        "work_types": [AC_CLEAN, AC_REPAIR, COOLING],
        "contact": {"name": "คุณปรีชา รักงาน", "phone": "089-777-1234",
                    "line_id": "bkkcooling", "email": "service@bkkcooling.co.th"},
        "notes": "ล้างแอร์ปีละ 2 ครั้ง (เม.ย. / ต.ค.) · เปลี่ยนผู้ติดต่อบ่อย",
        "history": [
            {"name": "คุณสมพร วงศ์ไทย", "phone": "089-000-1111",
             "from": "2021-02-01", "to": "2023-01-20", "note": "เกษียณ"},
            {"name": "คุณอนันต์ ชัยชนะ", "phone": "089-222-3333", "email": "anan@bkkcooling.co.th",
             "from": "2023-01-20", "to": "2024-08-01", "note": "ย้ายสาขา"},
            {"name": "คุณกมลวรรณ ศรีสุข", "phone": "089-444-5555",
             "from": "2024-08-01", "to": "2026-01-10", "note": "ลาออก"},
        ],
        "jobs": [
            ("AC-001", "แอร์ไม่เย็น มีน้ำหยด", "ล้างคอยล์ + เติมน้ำยา R32", 3200.0, "2026-01-15"),
            ("AC-003", "เสียงดังผิดปกติจากคอยล์ร้อน", "เปลี่ยนลูกปืนพัดลมคอยล์ร้อน", 4500.0, "2026-03-22"),
            ("AC-005", "คอมเพรสเซอร์ไม่ตัด", "เปลี่ยนคาปาซิเตอร์ + รีเลย์", 2750.0, "2026-06-11"),
            ("FAN-001", "พัดลมดูดอากาศสั่น", "ถ่วงสมดุลและเปลี่ยนยางกันสั่น", 1800.0, "2026-07-02"),
        ],
    },
    {
        "company": "เอ็นจิเนียริ่ง โซลูชั่นส์ พลัส",
        "work_types": [FIRE, FIRE_ALARM, LIGHTING],
        "contact": {"name": "คุณธนากร อินทร์แก้ว", "phone": "086-555-7788",
                    "line_id": "esp.fire", "email": "thanakorn@esp.co.th"},
        "notes": "ตรวจรับรองระบบดับเพลิงปีละ 1 ครั้ง (ม.ค.)",
        "history": [
            {"name": "คุณสุรชัย มั่นคง", "phone": "086-111-9999",
             "from": "2020-09-01", "to": "2023-06-30", "note": "บริษัทปรับโครงสร้าง"},
        ],
        "jobs": [
            ("SEN-001", "เซ็นเซอร์ตรวจจับควันไม่ตอบสนอง", "เปลี่ยนหัวตรวจจับ + ทดสอบควันจำลอง", 3900.0, "2025-11-24"),
            ("SEN-001", "สัญญาณเตือนดังโดยไม่มีเหตุ", "ตั้งค่าใหม่และเปลี่ยนแบตเตอรี่สำรอง", 1500.0, "2026-04-08"),
            ("L-004", "โคมไฟทางหนีไฟดับ", "เปลี่ยนหลอด LED ฉุกเฉิน", 1900.0, "2026-06-03"),
        ],
    },
    {
        "company": "สยาม ไฟร์ เซฟตี้",
        "work_types": [FIRE, EXTINGUISHER],
        "contact": {"name": "คุณอารีย์ บุญมา", "phone": "081-909-0808",
                    "line_id": "@siamfire", "email": "sale@siamfire.co.th"},
        "notes": "ส่งถังดับเพลิงตรวจรับรองทุก 12 เดือน",
        "history": [],
        "jobs": [
            ("SEN-001", "หัวฉีดดับเพลิงอุดตัน", "ล้างหัวฉีด + ตรวจแรงดันสายส่ง", 2900.0, "2026-03-05"),
        ],
    },
    {
        "company": "พีเอ็น ซัพพลาย แอนด์ เซอร์วิส",
        "work_types": [PLUMBING, PUMP],
        "contact": {"name": "คุณพงษ์ศักดิ์ ดีเลิศ", "phone": "087-321-6543",
                    "line_id": "pn.supply", "email": "pongsak@pn-supply.co.th"},
        "notes": "สำรองอะไหล่ปั๊มน้ำไว้ที่สโตร์เสมอ",
        "history": [
            {"name": "คุณนิรันดร์ แก้วใส", "phone": "087-000-1234",
             "from": None, "to": "2024-12-01", "note": "โอนกิจการให้ทายาท"},
        ],
        "jobs": [
            ("W-001", "วาล์วปิดน้ำสนิทไม่สนิท", "เปลี่ยนวาล์วลูกบอล 1/2 นิ้ว", 1250.0, "2025-12-19"),
            ("W-001", "ท่อใต้ซิงก์รั่วซึม", "เปลี่ยนข้อต่อและอุดรอยรั่ว", 2200.0, "2026-06-27"),
        ],
    },
    {
        "company": "ไทยเทค เมนเทนแนนซ์",
        "work_types": [GENERAL, LIGHTING, PLUMBING, PANEL],
        "contact": {"name": "คุณวิเชียร คงทน", "phone": "085-456-7890",
                    "line_id": "thaitech.mt", "email": "wichian@thaitech.co.th"},
        "notes": "สัญญารายปี — เรียกใช้ได้ไม่จำกัดจำนวนครั้ง",
        "history": [],
        "jobs": [
            ("P-002", "ปลั๊กไฟหลวม ใช้งานไม่ปลอดภัย", "เปลี่ยนเต้ารับและขันยึดกล่อง", 980.0, "2026-02-02"),
            ("SW-101", "สวิตช์ไฟค้าง กดไม่ลง", "เปลี่ยนสวิตช์ 2 ปุ่ม", 760.0, "2026-05-14"),
            ("L-007", "โคมไฟแตก", "เปลี่ยนฝาครอบโคม", 640.0, "2026-07-21"),
        ],
    },
    {
        "company": "กรุงเทพ ลิฟท์ แอนด์ เอ็นจิเนียริ่ง",
        "work_types": [LIFT],
        "contact": {"name": "คุณเอกชัย พูลสวัสดิ์", "phone": "02-987-6543",
                    "line_id": "@bkklift", "email": "service@bkklift.co.th"},
        "notes": "ตรวจประจำปีตามกฎหมาย + ต้องมีช่างประจำอาคารเปิดทาง",
        "history": [
            {"name": "คุณไพโรจน์ สุขใจ", "phone": "02-987-1111",
             "from": "2019-05-10", "to": "2022-10-31", "note": "ย้ายไปบริษัทในเครือ"},
            {"name": "คุณชาญชัย เรืองศรี", "phone": "02-987-2222",
             "from": "2022-10-31", "to": "2025-07-15", "note": "เกษียณอายุ"},
        ],
        "jobs": [],
    },
    {
        "company": "สมาร์ท เซฟตี้ เทคโนโลยี",
        "work_types": [CCTV, ACCESS, FIRE_ALARM],
        "contact": {"name": "คุณมณีรัตน์ ภักดี", "phone": "092-444-1122",
                    "line_id": "smartsafety", "email": "maneerat@smartsafety.co.th"},
        "notes": "เข้าดูแลระบบผ่าน VPN ได้ ต้องแจ้งฝ่ายไอทีทุกครั้ง",
        "history": [
            {"name": "คุณสมบัติ ชำนาญ", "phone": "092-000-3344",
             "from": "2023-04-01", "to": "2025-09-30", "note": "โอนย้ายแผนกเทคนิค"},
        ],
        "jobs": [
            ("P-003", "กล้องวงจรปิดไม่มีไฟเลี้ยง", "เปลี่ยนอะแดปเตอร์และเดินสายใหม่", 1650.0, "2026-04-16"),
        ],
    },
    {
        "company": "อีสเทิร์น อิเล็คทริค เซอร์วิส",
        "work_types": [TRANSFORMER, PANEL, EARTHING],
        "contact": {"name": "คุณคมสันต์ ตั้งใจ", "phone": "038-111-2222",
                    "line_id": "eastern.elec", "email": "komsan@eastern-elec.co.th"},
        "notes": "งานหม้อแปลงต้องดับไฟทั้งอาคาร — นัดวันอาทิตย์เท่านั้น",
        "history": [],
        "jobs": [
            ("P-004", "ทดสอบค่าความต้านทานสายดินประจำปี", "วัดค่าและออกใบรับรอง", 7500.0, "2025-10-30"),
            ("SW-101", "ตู้เมนมีเสียงครางผิดปกติ", "ขันแน่นบัสบาร์และตรวจเทอร์มัล", 3200.0, "2026-07-09"),
        ],
    },
    {
        "company": "คลีนโปร ฟาซิลิตี้",
        "work_types": [CLEANING, AC_CLEAN],
        "contact": {"name": "คุณสุนีย์ พรหมมา", "phone": "094-777-8899",
                    "line_id": "cleanpro", "email": "sunee@cleanpro.co.th"},
        "notes": "เข้าทำความสะอาดนอกเวลาราชการ 17:00–20:00",
        "history": [
            {"name": "คุณละมัย ใจบุญ", "phone": "094-111-2233",
             "from": "2022-01-05", "to": "2024-05-20", "note": "ย้ายพื้นที่รับผิดชอบ"},
            {"name": "คุณจันทร์เพ็ญ ทองแท้", "phone": "094-555-6677",
             "from": "2024-05-20", "to": "2026-02-28", "note": "ลาออก"},
        ],
        "jobs": [
            ("AC-002", "ล้างคอยล์ประจำปี (รอบ เม.ย.)", "ล้างคอยล์เย็น-ร้อน + ตรวจน้ำยา", 1200.0, "2026-04-25"),
        ],
    },
]


def _dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def purge() -> None:
    if not MARKER.exists():
        print("purge: no .demo_suppliers.json — nothing to remove")
        return
    ids = json.loads(MARKER.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        for rid in ids.get("report_ids", []):
            rep = db.get(Report, rid)
            if rep:
                db.delete(rep)  # cascades to its repairs
        for sid in ids.get("supplier_ids", []):
            sup = db.get(Supplier, sid)
            if sup:
                db.delete(sup)  # cascades to contacts + work types
        db.commit()
        MARKER.unlink()
        print(f"purge: removed {len(ids.get('supplier_ids', []))} suppliers, "
              f"{len(ids.get('report_ids', []))} reports")
    finally:
        db.close()


def build() -> None:
    db = SessionLocal()
    try:
        points = {p.code: p.id for p in db.scalars(select(InstallPoint)).all()}
        tech = db.scalar(select(User).where(User.role == "technician"))
        reporter_u = db.scalar(select(User).where(User.role == "reporter"))
        if not points:
            print("seed_suppliers: no install points — run `python -m app.seed` first")
            return

        supplier_ids: list[int] = []
        report_ids: list[int] = []
        created = updated = 0

        for spec in SUPPLIERS:
            sup = db.scalar(select(Supplier).where(Supplier.company == spec["company"]))
            if sup is None:
                sup = Supplier(company=spec["company"])
                db.add(sup); db.flush()
                created += 1
            else:
                updated += 1

            c = spec["contact"]
            sup.work_type = " / ".join(spec["work_types"])
            sup.contact_name, sup.phone = c["name"], c["phone"]
            sup.line_id, sup.email = c.get("line_id", ""), c.get("email", "")
            sup.notes, sup.is_active = spec["notes"], True

            # trades
            for row in list(sup.work_types):
                db.delete(row)
            db.flush()
            for i, name in enumerate(spec["work_types"]):
                db.add(SupplierWorkType(supplier_id=sup.id, name=name, sort_order=i))

            # contact periods: closed history first, then the open one
            for row in list(sup.contacts):
                db.delete(row)
            db.flush()
            for h in spec["history"]:
                db.add(SupplierContact(
                    supplier_id=sup.id, name=h["name"], phone=h.get("phone", ""),
                    line_id=h.get("line_id", ""), email=h.get("email", ""),
                    note=h.get("note", ""), started_at=_dt(h.get("from")),
                    ended_at=_dt(h.get("to")), is_current=False))
            last_end = spec["history"][-1]["to"] if spec["history"] else "2024-01-01"
            db.add(SupplierContact(
                supplier_id=sup.id, name=c["name"], phone=c["phone"],
                line_id=c.get("line_id", ""), email=c.get("email", ""),
                started_at=_dt(last_end), is_current=True))

            # jobs — only on a fresh supplier, so re-running never duplicates them
            if not sup.repairs:
                for code, symptom, action, cost, when in spec["jobs"]:
                    pid = points.get(code)
                    if pid is None:
                        continue
                    rep = Report(install_point_id=pid, symptom=symptom, status="done",
                                 reporter_id=reporter_u.id if reporter_u else None,
                                 reported_at=_dt(when), note="ปิดงานแล้ว")
                    db.add(rep); db.flush()
                    db.add(Repair(report_id=rep.id, technician_id=tech.id if tech else None,
                                  supplier_id=sup.id, action=action, cost=cost,
                                  repaired_at=_dt(when), note="demo job"))
                    report_ids.append(rep.id)

            db.flush()
            supplier_ids.append(sup.id)

        db.commit()
        # Merge with any earlier run so a refresh never loses track of the
        # reports it created before (that would strand them on --purge).
        prev = json.loads(MARKER.read_text(encoding="utf-8")) if MARKER.exists() else {}
        MARKER.write_text(json.dumps({
            "supplier_ids": sorted(set(prev.get("supplier_ids", [])) | set(supplier_ids)),
            "report_ids": sorted(set(prev.get("report_ids", [])) | set(report_ids)),
        }, indent=2), encoding="utf-8")
        print(f"seed_suppliers: {created} created, {updated} refreshed, "
              f"{len(report_ids)} demo jobs — purge with --purge")
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--purge", action="store_true", help="remove everything this script created")
    args = ap.parse_args()
    build() if not args.purge else purge()


if __name__ == "__main__":
    main()
