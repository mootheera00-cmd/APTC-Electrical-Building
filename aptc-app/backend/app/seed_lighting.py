"""Demo Lighting records — 10 points with everything the screen can hold.

    python -m app.seed_lighting            # complete 10 Lighting points
    python -m app.seed_lighting --purge    # remove exactly what it created

Lighting is the category that must carry a full spec (lamp type, brand, model,
wattage, supplier, P/O or the reason there is none, one attachment). The
"ประวัติ Timeline" tab reads the Repair Records of the point, so this seeder also
books real repairs (report + repair pairs — the same shape the Repairs screen
writes) for every one of the ten points, with technician, supplier, cost and a
note saying what was actually done.

Eight of the points already exist on the plan (L-001 … L-008) and are completed
here; L-009 and L-010 are created from scratch so the map has a couple of
freshly recorded points too.

`--purge` puts the eight existing points back exactly as they were (spec,
install date, name, notes), deletes the two it created, removes the reports /
repairs / equipment rows it added and its placeholder attachment files. What it
touched is recorded in `backend/.demo_lighting.json`.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import select

from .deps import UPLOAD_DIR, SessionLocal
from .models import (Category, Equipment, InstallPoint, PointLog, Repair, Report,
                     Room, Supplier, User)

MARKER = Path(__file__).resolve().parent.parent / ".demo_lighting.json"
SPEC_SUB = "spec"
REPAIR_SUB = "repair"

PANEL = "โคมไฟพาแนลไลท์ · LED panel"
DOWN = "โคมดาวน์ไลท์ · Downlight"
TUBE = "หลอดไฟทั่วไป · Tube / bulb"

# code, room, name, x%, y%, installed, lamp type, brand, model, wattage,
#   supplier, po_no, po_reason, units, repairs
# repair: (date, symptom, action, cost, supplier keyword, note, with attachment)
RECORDS: list[dict] = [
    dict(code="L-001", room="COR", name="โคมทางเดินหน้า CAD", x=13.44, y=46.02,
         installed="2023-05-10", lamp=TUBE, brand="Philips", model="T8 LED 18W 1200mm",
         wattage="18", supplier="บริษัท สว่างวัฒนา จำกัด", po="APP-68102", reason="",
         units=[("Philips T8 LED 18W", "2023-05-10")],
         repairs=[("2024-11-02", "ความสว่างทางเดินไม่สม่ำเสมอ",
                   "ตรวจและทำความสะอาดฝาครอบโคมทั้ง 6 ชุด วัดแรงดัน 228V กระแส 0.09A ต่อชุด",
                   900.0, "ไทยพาวเวอร์", "งานตรวจประจำปี ไม่เปลี่ยนอะไหล่ ใช้เวลา 1 ชั่วโมง", False),
                  ("2026-02-14", "หลอดกระพริบเป็นระยะ 2 ตัว",
                   "เปลี่ยนหลอด LED 18W 2 ตัวที่เริ่มเสื่อม วัดค่าความสว่างหลังเปลี่ยนได้ 320 lux",
                   640.0, "ไทยพาวเวอร์", "ใช้หลอดรุ่นเดิม T8 LED 18W 1200mm เทียบสเปกกับของเดิมแล้ว", False)]),
    dict(code="L-002", room="COR", name="โคมทางเดินหน้าห้องน้ำ", x=38.00, y=30.00,
         installed="2023-05-10", lamp=TUBE, brand="Philips", model="T8 LED 18W 1200mm",
         wattage="18", supplier="บริษัท สว่างวัฒนา จำกัด", po="APP-68103", reason="",
         units=[("Philips T8 LED 18W", "2023-05-10"), ("Philips T8 LED 18W (ชุดเก่า)", "2023-05-10", "2025-03-18")],
         repairs=[("2025-03-18", "หลอดกะพริบ 2 ตัว เปิดทิ้งไว้ไม่ติด",
                   "เปลี่ยนหลอด LED 18W 2 ตัว ถอดของเดิมวัดได้ 0V", 640.0, "ไทยพาวเวอร์",
                   "เปลี่ยนแล้วติดปกติทุกชุด ใช้เวลา 40 นาที", False),
                  ("2026-02-14", "ความสว่างลดลงกว่าที่ออกแบบ",
                   "ตรวจวัดความสว่างประจำปีได้ 320 lux อยู่ในเกณฑ์ ไม่ต้องเปลี่ยนอะไหล่",
                   0.0, "NSK", "งานตรวจตามสัญญา ไม่มีค่าใช้จ่าย", False)]),
    dict(code="L-003", room="LAB1", name="โคมเพดานห้องแล็บ 1 (โซนหน้า)", x=57.89, y=24.49,
         installed="2023-06-02", lamp=PANEL, brand="Panasonic", model="NNNC75118",
         wattage="18", supplier="ไทยเทค ซัพพลาย", po="APP-69021", reason="",
         units=[("Panasonic NNNC75118", "2023-06-02")],
         repairs=[("2026-01-20", "โคมมีฝุ่นสะสม ความสว่างลดลง",
                   "ถอดล้างฝาครอบโคมพาแนล 4 ชุด วัดความสว่างใหม่ได้ 420 lux",
                   1200.0, "ไทยเทค", "ล้างพร้อมตรวจขั้วต่อทุกชุด ใช้เวลา 2 ชั่วโมง", True)]),
    dict(code="L-004", room="LAB1", name="โคมเพดานห้องแล็บ 1 (โซนหลัง)", x=10.54, y=32.50,
         installed="2023-06-02", lamp=PANEL, brand="Panasonic", model="NNNC75118",
         wattage="18", supplier="ไทยเทค ซัพพลาย", po="APP-69022", reason="",
         units=[("Panasonic NNNC75118", "2023-06-02")],
         repairs=[("2025-12-11", "โคมสั่นหลังติดตั้งชั้นวางของใหม่",
                   "ตรวจการยึดโคม 4 ชุด ขันสกรูยึดฝ้าใหม่และตรวจการสั่นซ้ำ",
                   450.0, "ไทยเทค", "ไม่พบความเสียหาย ปรับการยึดให้แน่นขึ้นเท่านั้น", False)]),
    dict(code="L-005", room="LAB2", name="ดาวน์ไลท์เพดานห้องแล็บ 2", x=55.00, y=55.00,
         installed="2023-07-15", lamp=DOWN, brand="Philips", model="DN027B G2",
         wattage="12", supplier="บริษัท ไลท์ติ้งโปร จำกัด", po="APP-70115", reason="",
         units=[("Philips DN027B G2", "2023-07-15"), ("Philips DN027B G2 (ชุดเก่า)", "2023-07-15", "2024-09-08")],
         repairs=[("2024-09-08", "โคม 1 ชุดติดแล้วดับ",
                   "เปลี่ยนไดรเวอร์ 1 ชุด วัดไฟขาเข้าปกติ 230V",
                   1850.0, "ไทยพาวเวอร์", "ใช้ไดรเวอร์รุ่นเดิมของ Philips เก็บของเก่าไว้เทียบสเปก", True),
                  ("2026-03-02", "ตรวจกระแสและความร้อนสะสมที่ฝ้า",
                   "ตรวจประจำปี กระแส 0.05A ต่อชุด ไม่พบความร้อนสะสม",
                   0.0, "NSK", "อยู่ในสัญญาตรวจประจำปี", False)]),
    dict(code="L-006", room="OFF", name="ดาวน์ไลท์เพดานออฟฟิศ", x=69.48, y=69.88,
         installed="2023-07-15", lamp=DOWN, brand="Philips", model="DN027B G2",
         wattage="12", supplier="บริษัท ไลท์ติ้งโปร จำกัด", po="APP-70116", reason="",
         units=[("Philips DN027B G2", "2023-07-15")],
         repairs=[("2026-04-05", "โคม 1 ชุดสีเพี้ยน ไม่ตรงกับชุดอื่น",
                   "เปลี่ยนโคมให้ตรงรุ่นเดิม DN027B G2 และเทียบสีกับชุดข้างเคียง",
                   780.0, "ไทยพาวเวอร์", "เลือกโคมที่อุณหภูมิสีตรงกัน ไม่ใช้รุ่นใกล้เคียง", False)]),
    dict(code="L-007", room="MTA", name="โคมเพดานห้องประชุม A", x=82.06, y=40.51,
         installed="2023-08-01", lamp=PANEL, brand="Panasonic", model="NNNC75118",
         wattage="18", supplier="ไทยเทค ซัพพลาย", po="", reason="เบิกจากสต็อกเดิมที่เหลือจากห้องแล็บ 1",
         units=[("Panasonic NNNC75118", "2023-08-01")],
         repairs=[("2025-10-19", "ฝาครอบโคมแตกขณะทำความสะอาด",
                   "เปลี่ยนฝาครอบโคม 1 ชุด โดยใช้อะไหล่สำรองในสต็อก",
                   0.0, "NSK", "ไม่มีค่าใช้จ่าย เบิกอะไหล่จากสต็อกเดิม", False)]),
    dict(code="L-008", room="TRN", name="ดาวน์ไลท์ห้องอบรม", x=27.13, y=60.87,
         installed="2023-09-10", lamp=DOWN, brand="Philips", model="DN027B G2",
         wattage="12", supplier="บริษัท ไลท์ติ้งโปร จำกัด", po="APP-71088", reason="",
         units=[("Philips DN027B G2", "2023-09-10")],
         repairs=[("2026-05-22", "ความสว่างบริเวณหน้าจอฉายภาพไม่พอ",
                   "วัดความสว่างได้ 300 lux ปรับมุมโคม 2 ชุดให้ส่องเข้าหาจอ",
                   600.0, "ไทยพาวเวอร์", "ปรับมุมโคมแทนการเพิ่มชุดใหม่ ค่าใช้จ่ายเป็นค่าแรง", False)]),
    dict(code="L-009", room="SND", name="โคมเพดานห้องเก็บเสียง", x=44.20, y=17.40,
         installed="2024-02-20", lamp=PANEL, brand="Panasonic", model="NNNC75118",
         wattage="18", supplier="ไทยเทค ซัพพลาย", po="APP-72030", reason="",
         units=[("Panasonic NNNC75118", "2024-02-20")],
         repairs=[("2026-06-18", "มีเสียงครางเบา ๆ จากโคม",
                   "ตรวจการสั่นของโครงฝ้าและโคมทั้ง 4 ชุด ขันตัวยึดให้แน่น",
                   900.0, "ไทยเทค", "ไม่เปลี่ยนอะไหล่ ตรวจซ้ำแล้วไม่มีเสียงคราง", False)]),
    dict(code="L-010", room="PRS", name="ดาวน์ไลท์ห้องประธาน", x=78.40, y=70.20,
         installed="2024-03-05", lamp=DOWN, brand="Philips", model="DN027B G2",
         wattage="12", supplier="บริษัท ไลท์ติ้งโปร จำกัด", po="APP-72031", reason="",
         units=[("Philips DN027B G2", "2024-03-05")],
         repairs=[("2026-07-30", "หลอดติด ๆ ดับ ๆ 1 ชุด",
                   "เปลี่ยนไดรเวอร์ 1 ชุด วัดไดรเวอร์เดิมได้ค่าผิดปกติ",
                   1450.0, "ไทยพาวเวอร์", "ใช้ไดรเวอร์รุ่นเดียวกับที่ติดตั้งเดิม", True)]),
]

SPEC_FILE = ("ไฟล์ตัวอย่างสำหรับทดสอบระบบแนบไฟล์ (ใบสั่งซื้อ/รูปถ่ายสเปกโคมไฟ)\n"
             "ไฟล์นี้สร้างโดย seed_lighting — ไม่ใช่เอกสารจริง\n")
REPAIR_FILE = ("ไฟล์ตัวอย่างสำหรับทดสอบระบบแนบไฟล์ (ใบงานซ่อม/รูปถ่ายหน้างาน)\n"
               "ไฟล์นี้สร้างโดย seed_lighting — ไม่ใช่เอกสารจริง\n")


def _iso(value) -> str | None:
    return value.isoformat() if value else None


def purge() -> None:
    if not MARKER.exists():
        print("purge: no .demo_lighting.json — nothing to remove")
        return
    saved = json.loads(MARKER.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        for rid in saved.get("report_ids", []):
            row = db.get(Report, rid)
            if row:
                db.delete(row)  # cascades to its repairs
        for lid in saved.get("log_ids", []):
            row = db.get(PointLog, lid)
            if row:
                db.delete(row)
        for eid in saved.get("equipment_ids", []):
            row = db.get(Equipment, eid)
            if row:
                db.delete(row)
        for pid in saved.get("point_ids", []):
            row = db.get(InstallPoint, pid)
            if row:
                db.delete(row)  # L-009 / L-010 — the ones this seeder created
        for code, old in (saved.get("restore") or {}).items():
            pt = db.scalar(select(InstallPoint).where(InstallPoint.code == code))
            if not pt:
                continue
            pt.spec = old.get("spec") or {}
            pt.name_en = old.get("name_en") or ""
            pt.notes = old.get("notes") or ""
            pt.installed_at = datetime.fromisoformat(old["installed_at"]) if old.get("installed_at") else None
        db.commit()
    finally:
        db.close()
    for name in saved.get("files", []):
        (UPLOAD_DIR / SPEC_SUB / name).unlink(missing_ok=True)
        (UPLOAD_DIR / REPAIR_SUB / name).unlink(missing_ok=True)
    MARKER.unlink()
    print(f"purge: restored {len(saved.get('restore') or {})} points, "
          f"removed {len(saved.get('report_ids', []))} demo repairs, "
          f"{len(saved.get('point_ids', []))} created points and "
          f"{len(saved.get('files', []))} placeholder files")


def build() -> None:
    db = SessionLocal()
    try:
        cat = db.scalar(select(Category).where(Category.code == "L"))
        rooms = {r.code: r for r in db.scalars(select(Room)).all()}
        users = {u.username: u for u in db.scalars(select(User)).all()}
        suppliers = db.scalars(select(Supplier)).all()
        points = {p.code: p for p in db.scalars(select(InstallPoint)).all()}
        if not cat or not rooms:
            print("seed_lighting: no Lighting category / rooms — run `python -m app.seed` first")
            return

        prev = json.loads(MARKER.read_text(encoding="utf-8")) if MARKER.exists() else {}
        point_ids: list[int] = list(prev.get("point_ids", []))
        equipment_ids: list[int] = list(prev.get("equipment_ids", []))
        report_ids: list[int] = list(prev.get("report_ids", []))
        files: list[str] = list(prev.get("files", []))
        restore: dict = dict(prev.get("restore") or {})
        made = 0

        for i, r in enumerate(RECORDS, start=1):
            pt = points.get(r["code"])
            if pt is None:
                pt = InstallPoint(code=r["code"], room_id=rooms[r["room"]].id, category_id=cat.id,
                                  name_en=r["name"], x_pct=r["x"], y_pct=r["y"])
                db.add(pt); db.flush()
                point_ids.append(pt.id)
            elif r["code"] not in restore:
                # remember the untouched original so --purge puts it back verbatim
                restore[r["code"]] = {"spec": pt.spec or {}, "name_en": pt.name_en or "",
                                      "notes": pt.notes or "", "installed_at": _iso(pt.installed_at)}
            if (pt.spec or {}).get("brand") == r["brand"] and pt.reports:
                continue  # already seeded

            name = f"demo-lighting-{i:02d}.txt"
            (UPLOAD_DIR / SPEC_SUB).mkdir(parents=True, exist_ok=True)
            (UPLOAD_DIR / SPEC_SUB / name).write_text(SPEC_FILE, encoding="utf-8")
            if name not in files:
                files.append(name)

            spec = dict(pt.spec or {})
            spec.update({
                "lamp_type": r["lamp"], "brand": r["brand"], "model": r["model"],
                "wattage": r["wattage"], "supplier": r["supplier"],
                "po_no": r["po"], "po_reason": r["reason"],
                "attachment": f"/uploads/{SPEC_SUB}/{name}",
                "attachment_name": f"{r['code']}-spec.txt",
            })
            pt.spec = spec
            pt.name_en = r["name"]
            pt.room_id = rooms[r["room"]].id
            pt.installed_at = datetime.fromisoformat(r["installed"] + "T09:00:00")

            for unit in r["units"]:
                model, when = unit[0], unit[1]
                retired = unit[2] if len(unit) > 2 else None
                eq = Equipment(install_point_id=pt.id, brand_model=model,
                               serial_no=f"{r['code']}-{abs(hash(model)) % 900 + 100}",
                               installed_at=datetime.fromisoformat(when + "T09:00:00"),
                               removed_at=datetime.fromisoformat(retired + "T09:00:00") if retired else None,
                               status="retired" if retired else "active")
                db.add(eq); db.flush()
                equipment_ids.append(eq.id)

            for j, (when, symptom, action, cost, sup_key, note, with_file) in enumerate(r["repairs"], start=1):
                rep = Report(install_point_id=pt.id, symptom=symptom, status="done",
                             reporter_id=(users["gig"].id if "gig" in users else None),
                             reported_at=datetime.fromisoformat(when + "T09:00:00") - timedelta(days=3),
                             note="ปิดงานแล้ว")
                db.add(rep); db.flush()

                attachment = ""
                if with_file:
                    fname = f"demo-lighting-{i:02d}-{j}.txt"
                    (UPLOAD_DIR / REPAIR_SUB).mkdir(parents=True, exist_ok=True)
                    (UPLOAD_DIR / REPAIR_SUB / fname).write_text(REPAIR_FILE, encoding="utf-8")
                    attachment = f"/uploads/{REPAIR_SUB}/{fname}"
                    if fname not in files:
                        files.append(fname)

                sup = next((s for s in suppliers if sup_key in s.company), None)
                db.add(Repair(report_id=rep.id,
                              technician_id=(users["san"].id if "san" in users else None),
                              supplier_id=sup.id if sup else None,
                              action=action, cost=cost,
                              repaired_at=datetime.fromisoformat(when + "T14:00:00"),
                              attachment=attachment, note=note))
                report_ids.append(rep.id)
            made += 1

        db.commit()
        MARKER.write_text(json.dumps(
            {"point_ids": sorted(set(point_ids)), "equipment_ids": sorted(set(equipment_ids)),
             "report_ids": sorted(set(report_ids)), "log_ids": list(prev.get("log_ids", [])),
             "files": sorted(set(files)), "restore": restore}, indent=2, ensure_ascii=False),
            encoding="utf-8")
        print(f"seed_lighting: {made} Lighting points completed "
              f"({len(restore)} existing updated, {len(set(point_ids))} created) with "
              f"{len(set(report_ids))} repair records — purge with --purge")
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--purge", action="store_true", help="remove everything this script created")
    args = ap.parse_args()
    build() if not args.purge else purge()


if __name__ == "__main__":
    main()
