"""Demo repair records for testing the Repairs screen — run, look, then purge.

    python -m app.seed_repairs            # write 10 detailed repair records
    python -m app.seed_repairs --purge    # remove exactly what it created

Each record is a report + repair pair on a real plan point, written so every
field on the screen has something in it: technician, supplier, action, cost,
date and a note that says what was actually done and what was found. The costs
deliberately run from ฿0 (warranty, no charge) to ฿3,900, and two of them carry
a small placeholder attachment so the "open" link is testable.

Reports are closed (`done`) so they never show up as open jobs on the dashboard.
What was created is recorded in `backend/.demo_repairs.json`; `--purge` reads
that file, deletes those reports (cascading to their repairs) and removes any
placeholder attachment it wrote — nothing else in the database is touched.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import select

from .deps import UPLOAD_DIR, SessionLocal
from .models import InstallPoint, Repair, Report, Supplier, User

MARKER = Path(__file__).resolve().parent.parent / ".demo_repairs.json"
UPLOAD_SUB = "repair"

# (point, symptom, action, cost, note, technician username, supplier keyword, date, attachment)
RECORDS: list[tuple] = [
    ("L-005", "หลอดกระพริบทั้งแถว เปิดทิ้งไว้ไม่ติด",
     "เปลี่ยนบัลลาสต์อิเล็กทรอนิกส์ 2 ตัว + ตรวจสายไฟย้อนกลับ",
     2400.0, "ใช้บัลลาสต์ Philips EBM-118 ประกัน 1 ปี · วัดแรงดันได้ 228V ปกติ",
     "san", "ไทยพาวเวอร์", "2026-01-12", False),
    ("P-002", "ปลั๊กไฟร้อนผิดปกติเมื่อเสียบโหลด",
     "เปลี่ยนเต้ารับ 2 ช่องแบบมีสายดิน + ขันขั้วต่อใหม่",
     980.0, "วัดโหลดได้ 3.2A ปกติ · ตรวจขั้วต่อเดิมพบว่าหลวมจึงขันแน่นใหม่",
     "san", "ไทยเทค", "2026-02-03", False),
    ("AC-003", "แอร์ไม่เย็น มีน้ำหยดจากคอยล์เย็น",
     "ล้างคอยล์เย็น-ร้อน + เติมน้ำยา R32 300 กรัม",
     3200.0, "แรงดันน้ำยาหลังเติม 120 psi · ล้างท่อน้ำทิ้งให้ระบายคล่อง",
     "san", "บางกอก คูลลิ่ง", "2026-02-20", True),
    ("SEN-001", "เซ็นเซอร์ตรวจจับควันไม่ตอบสนองต่อการทดสอบ",
     "เปลี่ยนหัวตรวจจับ + ทดสอบด้วยควันจำลอง 2 ครั้ง",
     3900.0, "หัวใหม่ยี่ห้อ Hochiki · ทดสอบผ่านทั้ง 2 ครั้ง บันทึกผลลงสมุดตรวจ",
     "san", "เอ็นจิเนียริ่ง โซลูชั่นส์", "2026-03-11", False),
    ("W-001", "วาล์วปิดน้ำใต้ซิงก์รั่วซึม",
     "เปลี่ยนวาล์วลูกบอล 1/2 นิ้ว + พันเทปเกลียวใหม่",
     1250.0, "ตรวจท่อส่งน้ำทั้งไลน์แล้วไม่พบจุดรั่วอื่น · เปิดน้ำทดสอบ 15 นาที แห้งสนิท",
     "san", "พีเอ็น ซัพพลาย", "2026-03-28", False),
    ("FAN-001", "พัดลมดูดอากาศสั่นและมีเสียงดัง",
     "ถ่วงสมดุลใบพัด + เปลี่ยนยางกันสั่น 4 จุด",
     1800.0, "วัดเสียงได้ 62 dB ที่ระยะ 1 เมตร (เดิม 71 dB) · ใบพัดไม่มีรอยแตก",
     "san", "บางกอก คูลลิ่ง", "2026-04-09", False),
    ("L-007", "ฝาครอบโคมไฟแตก หลอดยังติด",
     "เปลี่ยนฝาครอบพร้อมหลอด LED 18W ทั้งชุด",
     640.0, "เปลี่ยนทั้งชุดเพื่อให้อุณหภูมิสีตรงกับโคมข้างเคียง ไม่เปลี่ยนเฉพาะหลอด",
     "san", "ไทยเทค", "2026-05-06", False),
    ("SW-101", "ฝาครอบสวิตช์แตก กดปุ่มแล้วฝืด",
     "เปลี่ยนฝาครอบพร้อมปุ่มกด + ตรวจกลไกสปริง",
     450.0, "ใช้ฝาครอบรุ่นเดียวกับเดิม · ทดสอบกด-ปล่อย 20 ครั้ง ทำงานปกติทุกครั้ง",
     "san", "ไทยเทค", "2026-06-15", True),
    ("AC-005", "คอมเพรสเซอร์ทำงานไม่ตัด ทำความเย็นไม่หยุด",
     "เปลี่ยนคาปาซิเตอร์ + รีเลย์โอเวอร์โหลด",
     2750.0, "กระแสคอมเพรสเซอร์ 6.8A อยู่ในเกณฑ์ · คอมเพรสเซอร์ยังดีไม่ต้องเปลี่ยน",
     "san", "บางกอก คูลลิ่ง", "2026-07-08", False),
    ("P-004", "ปลั๊กไม่มีไฟ เบรกเกอร์ย่อยตัดบ่อย",
     "ขันขั้วต่อหลวม + เปลี่ยนเบรกเกอร์ย่อย 16A",
     0.0, "อยู่ในประกันของตู้ · เปลี่ยนฟรี ไม่คิดค่าแรงและค่าอะไหล่",
     "san", "อีสเทิร์น อิเล็คทริค", "2026-08-19", False),
]

PLACEHOLDER = "ไฟล์ตัวอย่างสำหรับทดสอบระบบแนบไฟล์ — ไม่ใช่เอกสารจริง\n"


def purge() -> None:
    if not MARKER.exists():
        print("purge: no .demo_repairs.json — nothing to remove")
        return
    saved = json.loads(MARKER.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        for rid in saved.get("report_ids", []):
            rep = db.get(Report, rid)
            if rep:
                db.delete(rep)  # cascades to its repairs
        db.commit()
    finally:
        db.close()
    for name in saved.get("files", []):
        try:
            (UPLOAD_DIR / UPLOAD_SUB / name).unlink(missing_ok=True)
            print("purge: removed placeholder file", name)
        except OSError as e:
            print("purge: could not remove", name, e)
    MARKER.unlink()
    print(f"purge: removed {len(saved.get('report_ids', []))} demo repairs")


def build() -> None:
    db = SessionLocal()
    try:
        points = {p.code: p for p in db.scalars(select(InstallPoint)).all()}
        users = {u.username: u for u in db.scalars(select(User)).all()}
        suppliers = db.scalars(select(Supplier)).all()
        if not points:
            print("seed_repairs: no install points — run `python -m app.seed` first")
            return

        prev = json.loads(MARKER.read_text(encoding="utf-8")) if MARKER.exists() else {}
        report_ids: list[int] = list(prev.get("report_ids", []))
        files: list[str] = list(prev.get("files", []))
        made = 0

        for i, (code, symptom, action, cost, note, tech, sup_key, when, with_file) in \
                enumerate(RECORDS, start=1):
            pt = points.get(code)
            if pt is None:
                print(f"  skip {code} — not on the plan")
                continue
            # idempotent: same symptom on the same point means it is already here
            exists = db.scalar(select(Report).where(
                Report.install_point_id == pt.id, Report.symptom == symptom))
            if exists:
                continue

            rep = Report(install_point_id=pt.id, symptom=symptom, status="done",
                         reporter_id=(users.get("gig").id if users.get("gig") else None),
                         reported_at=datetime.fromisoformat(when + "T09:00:00"),
                         note="ปิดงานแล้ว")
            db.add(rep); db.flush()

            attachment = ""
            if with_file:
                name = f"demo-note-{i:02d}.txt"
                (UPLOAD_DIR / UPLOAD_SUB).mkdir(parents=True, exist_ok=True)
                (UPLOAD_DIR / UPLOAD_SUB / name).write_text(PLACEHOLDER, encoding="utf-8")
                attachment = f"/uploads/{UPLOAD_SUB}/{name}"
                if name not in files:
                    files.append(name)

            sup = next((s for s in suppliers if sup_key in s.company), None)
            db.add(Repair(report_id=rep.id,
                          technician_id=users[tech].id if tech in users else None,
                          supplier_id=sup.id if sup else None,
                          action=action, cost=cost,
                          repaired_at=datetime.fromisoformat(when + "T14:00:00"),
                          attachment=attachment, note=note))
            report_ids.append(rep.id)
            made += 1

        db.commit()
        MARKER.write_text(json.dumps(
            {"report_ids": sorted(set(report_ids)), "files": sorted(set(files))},
            indent=2, ensure_ascii=False), encoding="utf-8")
        total = len(set(report_ids))
        print(f"seed_repairs: {made} added, {total} demo repairs on file "
              f"({len(files)} placeholder attachments) — purge with --purge")
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--purge", action="store_true", help="remove everything this script created")
    args = ap.parse_args()
    build() if not args.purge else purge()


if __name__ == "__main__":
    main()
