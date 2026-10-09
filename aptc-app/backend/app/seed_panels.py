"""Demo board schedule for testing the Panels screen — run, look, then purge.

    python -m app.seed_panels            # write a 10-way schedule on MDB-1
    python -m app.seed_panels --purge    # put back exactly what was there

A real distribution board has a full row of outgoing ways, so this writes ten
of them with the fields the screen cares about — amps · poles · type · kA ·
brand · what it's for · what it controls · which plan points it feeds — and
covers the awkward cases on purpose: an RCBO feeding outlets, a spare way with
nothing on it, a way with no brand recorded, and one way carrying several
points.

The plan points are linked by writing `panel_id` + `breaker_no` into their spec,
which is what makes the sheet's "which breaker feeds what" resolve. Every value
it overwrites is snapshotted into `backend/.demo_panels.json` first, and
`--purge` restores from that file — nothing else in the database is touched.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from sqlalchemy import select

from .deps import SessionLocal
from .models import Breaker, InstallPoint, Panel, Room

MARKER = Path(__file__).resolve().parent.parent / ".demo_panels.json"

PANEL = {
    "code": "MDB-1",
    "room_code": "LAB1",
    "name_en": "Main panel LAB zone",
    "main_amps": 100.0,
    "main_breaker": "MCCB 100A 3P 25kA",
    "phase": "3P 4W 400V",
    "location_note": "LAB corridor wall",
    "notes": "ตู้เมนหลักของโซนแล็บ — ปิดไฟทั้งโซนก่อนทำงาน",
}

# (position, amps, poles, type, kA, brand/model, purpose, circuit, controls, notes, points)
SCHEDULE: list[tuple] = [
    ("1", 32.0, "3P", "MCB", 10.0, "Schneider iC60N", "แสงสว่าง",
     "Lighting LAB1/LAB2", "โคมไฟ L-003, L-004", "วงจรไฟหลักของแล็บ", ["L-003", "L-004"]),
    ("2", 20.0, "1P+N", "RCBO", 6.0, "Schneider iC60", "ปลั๊กไฟ",
     "Outlets LAB1", "ปลั๊ก P-001 ฝั่งหน้าห้อง", "มีกันไฟรั่ว 30mA", ["P-001"]),
    ("3", 32.0, "3P", "MCB", 10.0, "Schneider iC60N", "เครื่องปรับอากาศ",
     "AC LAB1/LAB2", "แอร์ AC-001, AC-002", "ห้ามปิดตอนมีงานทดลอง", ["AC-001", "AC-002"]),
    ("4", 16.0, "1P+N", "MCB", 6.0, "Schneider iC60N", "แสงสว่าง",
     "Lighting OFF/MEA", "โคมไฟ L-001, L-002", "", ["L-001", "L-002"]),
    ("5", 20.0, "1P+N", "RCBO", 6.0, "ABB DS201", "ปลั๊กไฟ",
     "Outlets OFF/CAD", "ปลั๊ก P-002, P-003", "ปลั๊กโซนออฟฟิศ + ห้อง CAD", ["P-002", "P-003"]),
    ("6", 25.0, "3P", "MCB", 10.0, "Schneider iC60N", "เครื่องปรับอากาศ",
     "AC MEA/TRN", "แอร์ AC-003, AC-004", "แอร์ห้องวัด + ห้องอบรม", ["AC-003", "AC-004"]),
    ("7", 16.0, "1P+N", "MCB", 6.0, "ABB S201", "ปรับอากาศ + ระบายอากาศ",
     "AC SND / Exhaust", "แอร์ AC-005, พัดลม FAN-001", "พัดลมดูดอากาศห้องกันเสียง", ["AC-005", "FAN-001"]),
    ("8", 16.0, "1P+N", "MCB", 6.0, "Schneider iC60N", "แสงสว่าง",
     "Lighting COR/Meeting", "โคมไฟ L-005 – L-008", "ทางเดิน + ห้องประชุม A/B", ["L-005", "L-006", "L-007", "L-008"]),
    ("9", 16.0, "1P+N", "MCB", 6.0, "", "ควบคุม + แจ้งเหตุ",
     "Switch / Sensor", "สวิตช์ SW-101, เซ็นเซอร์ SEN-001, ปลั๊ก P-004",
     "ยังไม่ระบุรุ่น — ของเดิมติดตั้งมานาน", ["SW-101", "SEN-001", "P-004"]),
    ("10", 16.0, "1P+N", "MCB", 6.0, "", "สำรอง",
     "", "", "ยังไม่ใช้งาน — เผื่อขยายวงจร", []),
]


def diff_spec(point: InstallPoint) -> dict:
    """The plan-point keys this script owns, as they were before we touched them."""
    spec = dict(point.spec or {})
    return {k: spec.get(k) for k in ("panel_id", "breaker_no")}


def purge() -> None:
    if not MARKER.exists():
        print("purge: no .demo_panels.json — nothing to restore")
        return
    saved = json.loads(MARKER.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        pid = saved.get("panel_id")
        panel = db.get(Panel, pid) if pid else None
        if panel:
            if saved.get("panel_created"):
                db.delete(panel)  # cascades to its breakers
            else:
                for k, v in (saved.get("panel_fields") or {}).items():
                    setattr(panel, k, v)
                for b in list(panel.breakers):
                    db.delete(b)
        for code, spec in (saved.get("points") or {}).items():
            pt = db.scalar(select(InstallPoint).where(InstallPoint.code == code))
            if not pt:
                continue
            merged = dict(pt.spec or {})
            for k, v in spec.items():
                if v is None:
                    merged.pop(k, None)
                else:
                    merged[k] = v
            pt.spec = merged or None
        db.commit()
        MARKER.unlink()
        print(f"purge: restored panel {saved.get('panel_code')} and "
              f"{len(saved.get('points') or {})} plan points")
    finally:
        db.close()


def build() -> None:
    db = SessionLocal()
    try:
        panel = db.scalar(select(Panel).where(Panel.code == PANEL["code"]))
        created = panel is None
        room = db.scalar(select(Room).where(Room.code == PANEL["room_code"]))

        snapshot = json.loads(MARKER.read_text(encoding="utf-8")) if MARKER.exists() else None
        if snapshot is None:
            snapshot = {
                "panel_code": PANEL["code"],
                "panel_created": created,
                "panel_id": panel.id if panel else None,
                "panel_fields": None if created else {
                    "room_id": panel.room_id, "name_en": panel.name_en,
                    "main_amps": panel.main_amps, "main_breaker": panel.main_breaker,
                    "phase": panel.phase, "location_note": panel.location_note,
                    "notes": panel.notes,
                },
                "points": {},
            }
        elif created:
            snapshot["panel_created"] = True

        if created:
            panel = Panel(code=PANEL["code"])
            db.add(panel); db.flush()
        snapshot["panel_id"] = panel.id

        panel.room_id = room.id if room else panel.room_id
        panel.name_en = PANEL["name_en"]
        panel.main_amps = PANEL["main_amps"]
        panel.main_breaker = PANEL["main_breaker"]
        panel.phase = PANEL["phase"]
        panel.location_note = PANEL["location_note"]
        panel.notes = PANEL["notes"]

        for b in list(panel.breakers):
            db.delete(b)
        db.flush()
        for pos, amps, poles, btype, ka, brand, purpose, circuit, controls, notes, _pts in SCHEDULE:
            db.add(Breaker(panel_id=panel.id, position_no=pos, amps=amps, poles=poles,
                           breaker_type=btype, rated_ka=ka, brand_model=brand,
                           purpose=purpose, circuit_name=circuit, controls=controls,
                           notes=notes))

        # Link plan points to the way that feeds them. The original panel_id /
        # breaker_no of each touched point is kept so --purge can undo it.
        by_code = {p.code: p for p in db.scalars(select(InstallPoint)).all()}
        for pos, *_rest, points in SCHEDULE:
            for code in points:
                pt = by_code.get(code)
                if pt is None:
                    continue
                if code not in snapshot["points"]:
                    snapshot["points"][code] = diff_spec(pt)
                spec = dict(pt.spec or {})
                spec["panel_id"] = panel.id
                spec["breaker_no"] = pos
                pt.spec = spec

        db.commit()
        MARKER.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False), encoding="utf-8")
        linked = sum(len(s[10]) for s in SCHEDULE)
        print(f"seed_panels: {PANEL['code']} now has {len(SCHEDULE)} breakers, "
              f"{linked} plan points linked — purge with --purge")
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--purge", action="store_true", help="restore what this script changed")
    args = ap.parse_args()
    build() if not args.purge else purge()


if __name__ == "__main__":
    main()
