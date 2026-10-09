"""Seed: building APTC, 1F floor, rooms from PDF, categories, points incl. L-005 history."""
from __future__ import annotations
import shutil
from datetime import datetime
from pathlib import Path
from sqlalchemy import select

from .deps import SessionLocal, engine
from .models import (Base, Breaker, Building, Category, Equipment, Floor, InstallPoint,
                     Maintenance, Panel, Repair, Report, Room, SubUnit, Supplier,
                     SupplierContact, SupplierWorkType, User)
from .seed_panels import SCHEDULE  # single source of truth for the MDB-1 schedule

BASE = Path(__file__).resolve().parent.parent
SRC_PLAN = BASE / "uploads" / "aptc-layout.png"


def dt(s: str) -> datetime:
    return datetime.fromisoformat(s)


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.scalar(select(User).limit(1)):
            print("seed: already has users — skip")
            return
        admin = User(username="admin", name="Admin (Somchai)", role="admin")
        rep = User(username="gig", name="Gig (Reporter)", role="reporter")
        tech = User(username="san", name="San (Technician)", role="technician")
        db.add_all([admin, rep, tech]); db.flush()

        b = Building(name_en="APTC", name_th="อาคาร APTC",
                     description="APTC main building — electrical & facility management")
        db.add(b); db.flush()
        plan = "/uploads/plan/aptc-layout.png"
        if not (BASE / "uploads" / "plan" / "aptc-layout.png").exists():
            (BASE / "uploads" / "plan").mkdir(parents=True, exist_ok=True)
            if SRC_PLAN.exists():
                shutil.copy(SRC_PLAN, BASE / "uploads" / "plan" / "aptc-layout.png")
        f1 = Floor(building_id=b.id, name_en="1F", level=1, plan_image=plan)
        db.add(f1); db.flush()

        rooms = [
            ("LAB1", "LABORATORY 1", "ห้องแล็บ 1", "lab"),
            ("LAB2", "LABORATORY 2", "ห้องแล็บ 2", "lab"),
            ("SND", "SOUND PROOF ROOM", "ห้องกันเสียง", "lab"),
            ("TRN", "TRAINING RM", "ห้องอบรม", "office"),
            ("MEA", "MEASUREMENT RM", "ห้องวัด", "lab"),
            ("OFF", "OFFICE", "สำนักงาน", "office"),
            ("PRS", "President Room", "ห้องประธาน", "office"),
            ("MTA", "Meeting room A", "ห้องประชุม A", "office"),
            ("MTB", "Meeting room B", "ห้องประชุม B", "office"),
            ("CAD", "CAD Room", "ห้อง CAD", "office"),
            ("COR", "CORRIDOR", "ทางเดิน", "common"),
        ]
        room_map = {}
        for code, en, th, typ in rooms:
            r = Room(floor_id=f1.id, code=code, name_en=en, name_th=th, room_type=typ)
            db.add(r); db.flush(); room_map[code] = r.id

        cats = [("L", "Lighting", "ไฟฟ้าแสงสว่าง", "lightbulb", "#b8915a", "electrical"),
                ("P", "Power Outlet", "ปลั๊กไฟ", "plug", "#2e5aa8", "electrical"),
                ("AC", "Air Conditioner", "แอร์", "air-vent", "#5e7a9b", "building"),
                ("SW", "Light Switch", "สวิตช์ไฟ", "toggle-left", "#7c6aa8", "electrical"),
                ("MDB", "Main Panel", "ตู้เมนไฟฟ้า", "panel-top", "#8a5a2b", "electrical"),
                ("W", "Water / Sanitary", "ก๊อกน้ำและอ่าง", "droplets", "#2b8aa8", "building"),
                ("SEN", "Heat/Smoke Sensor", "เซ็นเซอร์ความร้อนและควัน", "flame", "#c0392b", "electrical"),
                ("FAN", "Exhaust Fan", "พัดลมดูดอากาศ", "fan", "#5a7d5a", "electrical"),
                ("FE", "Fire Extinguisher", "ถังดับเพลิง", "fire-extinguisher", "#b03a2e", "building"),
                ("EL", "Emergency Light", "ไฟฉุกเฉิน", "flashlight", "#d68910", "electrical"),
                ("EX", "Emergency Exit Sign", "ป้ายทางออกฉุกเฉิน", "door-open", "#1f7a5c", "electrical"),
                ("OT", "Other", "อื่นๆ", "circle-help", "#6b7280", "other")]
        cat_map = {}
        for code, en, th, icon, color, work_type in cats:
            c = Category(code=code, name_en=en, name_th=th, icon=icon, color=color, work_type=work_type)
            db.add(c); db.flush(); cat_map[code] = c.id

        pts = [  # code, room, cat, x, y, installed
            ("L-001", "COR", "L", 18, 30, "2023-05-10T09:00:00"),
            ("L-002", "COR", "L", 38, 30, "2023-05-10T09:00:00"),
            ("L-003", "LAB1", "L", 55, 25, "2023-05-11T09:00:00"),
            ("L-004", "LAB1", "L", 68, 25, "2023-05-11T09:00:00"),
            ("L-005", "LAB2", "L", 55, 55, "2023-05-10T09:00:00"),
            ("L-006", "OFF", "L", 75, 60, "2023-06-01T09:00:00"),
            ("L-007", "MTA", "L", 82, 40, "2023-06-01T09:00:00"),
            ("L-008", "TRN", "L", 30, 65, "2023-06-02T09:00:00"),
            ("P-001", "LAB1", "P", 58, 32, "2023-05-12T09:00:00"),
            ("P-002", "LAB2", "P", 58, 62, "2023-05-12T09:00:00"),
            ("P-003", "OFF", "P", 78, 66, "2023-06-01T09:00:00"),
            ("P-004", "MEA", "P", 45, 70, "2023-06-03T09:00:00"),
            ("AC-001", "LAB1", "AC", 62, 20, "2023-04-20T09:00:00"),
            ("AC-002", "LAB2", "AC", 62, 50, "2023-04-20T09:00:00"),
            ("AC-003", "OFF", "AC", 80, 55, "2023-04-21T09:00:00"),
            ("AC-004", "MTA", "AC", 85, 35, "2023-04-21T09:00:00"),
            ("AC-005", "TRN", "AC", 33, 60, "2023-04-22T09:00:00"),
        ]
        pt_map = {}
        for code, room, cat, x, y, inst in pts:
            p = InstallPoint(code=code, room_id=room_map[room], category_id=cat_map[cat],
                             name_en=f"{code} ({room})", x_pct=x, y_pct=y,
                             installed_at=dt(inst), notes="seed data — real survey later")
            db.add(p); db.flush(); pt_map[code] = p
            db.add(Equipment(install_point_id=p.id, serial_no=f"SN-{code}-01",
                             brand_model="Generic model", installed_at=dt(inst), status="active"))

        # L-005 full history: installed 2023-05-10, 2 repairs, 1 replacement, last repair 2024-11-02
        l5 = pt_map["L-005"]
        old_eq = db.scalar(select(Equipment).where(Equipment.install_point_id == l5.id))
        old_eq.status = "retired"; old_eq.removed_at = dt("2024-03-15T10:00:00")
        db.add(Equipment(install_point_id=l5.id, serial_no="SN-L-005-02",
                         brand_model="Philips LED 18W", installed_at=dt("2024-03-15T10:00:00"),
                         status="active", notes="replacement unit"))
        r1 = Report(install_point_id=l5.id, equipment_id=old_eq.id, symptom="Flickering, buzzing sound",
                    reporter_id=rep.id, reported_at=dt("2023-11-20T14:30:00"), status="done",
                    note="seed: first fault")
        db.add(r1); db.flush()
        db.add(Repair(report_id=r1.id, technician_id=tech.id, action="Replaced ballast",
                      cost=850.0, repaired_at=dt("2023-11-21T10:00:00"), note="seed"))
        r2 = Report(install_point_id=l5.id, symptom="Completely dead, no light",
                    reporter_id=rep.id, reported_at=dt("2024-11-01T09:15:00"), status="done",
                    note="seed: second fault")
        db.add(r2); db.flush()
        db.add(Repair(report_id=r2.id, technician_id=tech.id, action="Replaced whole fixture with LED",
                      cost=2400.0, repaired_at=dt("2024-11-02T15:00:00"), note="seed"))
        # one open job elsewhere for dashboard demo
        p7 = pt_map["AC-003"]
        r3 = Report(install_point_id=p7.id, symptom="Weak cooling, water dripping",
                    reporter_id=rep.id, reported_at=dt("2026-10-05T08:00:00"),
                    status="waiting", note="seed: open demo job")
        db.add(r3); db.flush()

        # ---- 10-category extension demo data ----
        # room dimensions (9)
        dims = {"LAB1": (12.0, 8.0, 3.2), "LAB2": (12.0, 8.0, 3.2), "OFF": (10.0, 6.0, 3.0),
                "MTA": (6.0, 5.0, 3.0), "TRN": (9.0, 7.0, 3.2)}
        for code, (w, l, h) in dims.items():
            r = db.scalar(select(Room).where(Room.code == code))
            if r:
                r.width_m, r.length_m, r.height_m = w, l, h
                r.floor_area_m2 = round(w * l, 1)
        # supplier (10)
        sup = Supplier(company="NSK Electrical Service",
                       work_type="Electrical maintenance / ไฟฟ้าแสงสว่าง / ล้างแอร์",
                       contact_name="Mr. Service", phone="02-123-4567",
                       line_id="@nsk-service", email="service@example.com",
                       notes="seed demo supplier")
        db.add(sup); db.flush()
        for i, name in enumerate(["Electrical maintenance", "ไฟฟ้าแสงสว่าง", "ล้างแอร์"]):
            db.add(SupplierWorkType(supplier_id=sup.id, name=name, sort_order=i))
        db.add(SupplierContact(supplier_id=sup.id, name=sup.contact_name, phone=sup.phone,
                               line_id=sup.line_id, email=sup.email,
                               started_at=dt("2025-03-01T09:00:00"), is_current=True))
        # panels + breakers (4)
        lab1 = db.scalar(select(Room).where(Room.code == "LAB1"))
        off = db.scalar(select(Room).where(Room.code == "OFF"))
        mdb1 = Panel(code="MDB-1", room_id=lab1.id if lab1 else None,
                     name_en="Main panel LAB zone", main_amps=100.0,
                     main_breaker="MCCB 100A 3P 25kA", phase="3P 4W 400V",
                     location_note="LAB corridor wall",
                     notes="ตู้เมนหลักของโซนแล็บ — ปิดไฟทั้งโซนก่อนทำงาน")
        db.add(mdb1); db.flush()
        # Full 10-way schedule — same source of truth the demo seeder uses,
        # so a fresh install matches `python -m app.seed_panels`.
        db.add_all([
            Breaker(panel_id=mdb1.id, position_no=pos, amps=amps, poles=poles,
                    breaker_type=btype, rated_ka=ka, brand_model=brand,
                    purpose=purpose, circuit_name=circuit, controls=controls, notes=notes)
            for pos, amps, poles, btype, ka, brand, purpose, circuit, controls, notes, _pts in SCHEDULE
        ])
        db.flush()
        # link existing points to panel/breaker via spec (1, 3, 6, 8)
        for code, spec in [
            ("P-001", {"socket_type": "2P+E 16A", "panel_id": mdb1.id, "breaker_no": "2"}),
            ("L-003", {"lamp_type": "LED panel", "wattage": 36, "panel_id": mdb1.id, "breaker_no": "1"}),
            ("L-004", {"lamp_type": "LED panel", "wattage": 36, "panel_id": mdb1.id, "breaker_no": "1"}),
            ("AC-001", {"brand": "Daikin", "model": "FTKQ35", "btu": 12000,
                        "indoor_note": "wall mounted", "outdoor_location": "rooftop north",
                        "panel_id": mdb1.id, "breaker_no": "3"}),
        ]:
            p = pt_map.get(code)
            if p: p.spec = spec
        # switch SW-101 controlling L-003/L-004 (2)
        sw = InstallPoint(code="SW-101", room_id=room_map["LAB1"], category_id=cat_map["SW"],
                          name_en="Switch LAB1 (2-gang)", x_pct=52, y_pct=28,
                          installed_at=dt("2023-05-11T09:00:00"),
                          spec={"gang_count": 2, "panel_id": mdb1.id, "breaker_no": "1"},
                          notes="seed demo switch")
        db.add(sw); db.flush()
        pt_map["SW-101"] = sw
        db.add(Equipment(install_point_id=sw.id, serial_no="SN-SW-101-01",
                         brand_model="Panasonic 2-gang", installed_at=dt("2023-05-11T09:00:00"),
                         status="active"))
        for code in ("L-003", "L-004"):
            p = pt_map[code]
            s = dict(p.spec or {}); s["switch_point_id"] = sw.id; p.spec = s
        # water point W-001 with faucet+sink sub-units (5)
        mea = db.scalar(select(Room).where(Room.code == "MEA"))
        w1 = InstallPoint(code="W-001", room_id=mea.id if mea else room_map["LAB1"],
                          category_id=cat_map["W"], name_en="Sink set MEA",
                          x_pct=45, y_pct=74, installed_at=dt("2023-06-03T09:00:00"),
                          spec={"fixture_type": "wall sink", "valve_location": "under sink, red handle"},
                          notes="seed demo water")
        db.add(w1); db.flush()
        db.add_all([
            SubUnit(install_point_id=w1.id, kind="faucet", label="Faucet A",
                    detail="single lever mixer"),
            SubUnit(install_point_id=w1.id, kind="sink", label="Basin A",
                    detail="ceramic 550mm"),
        ])
        # AC sub-units indoor/outdoor (6)
        ac1 = pt_map["AC-001"]
        db.add_all([
            SubUnit(install_point_id=ac1.id, kind="indoor", label="FCU-001",
                    detail="wall type, LAB1 north wall"),
            SubUnit(install_point_id=ac1.id, kind="outdoor", label="CDU-001",
                    detail="rooftop north, 12kBTU"),
        ])
        # sensor SEN-001 + test log (7)
        sen = InstallPoint(code="SEN-001", room_id=room_map["COR"],
                           category_id=cat_map["SEN"], name_en="Smoke sensor corridor",
                           x_pct=28, y_pct=30, installed_at=dt("2023-07-01T09:00:00"),
                           spec={"sensor_type": "smoke", "model": "System Sensor 2151",
                                 "zone": "Z-1 corridor"},
                           notes="seed demo sensor")
        db.add(sen); db.flush()
        db.add(Equipment(install_point_id=sen.id, serial_no="SN-SEN-001-01",
                         brand_model="System Sensor 2151", installed_at=dt("2023-07-01T09:00:00"),
                         status="active"))
        db.add(Maintenance(install_point_id=sen.id, kind="test",
                           performed_at=dt("2026-09-15T10:00:00"), performer="San",
                           result="pass", note="smoke spray test OK"))
        # fan FAN-001 (8)
        fan = InstallPoint(code="FAN-001", room_id=room_map["LAB1"],
                           category_id=cat_map["FAN"], name_en="Exhaust fan LAB1",
                           x_pct=66, y_pct=22, installed_at=dt("2023-07-02T09:00:00"),
                           spec={"model": "Mitsubishi EX-25", "size_inch": 10,
                                 "wattage": 45, "panel_id": mdb1.id, "breaker_no": "1"},
                           notes="seed demo fan")
        db.add(fan); db.flush()
        db.add(Equipment(install_point_id=fan.id, serial_no="SN-FAN-001-01",
                         brand_model="Mitsubishi EX-25", installed_at=dt("2023-07-02T09:00:00"),
                         status="active"))
        # AC cleaning log (6)
        db.add(Maintenance(install_point_id=pt_map["AC-001"].id, kind="cleaning",
                           performed_at=dt("2026-08-20T13:00:00"), performer="NSK team",
                           result="pass", cost=1500.0, note="filter + coil wash"))
        # Link plan points to the way that feeds them (schedule is the source of truth).
        for pos, *_rest, codes in SCHEDULE:
            for code in codes:
                p = pt_map.get(code)
                if p is None:
                    continue
                spec = dict(p.spec or {})
                spec["panel_id"] = mdb1.id
                spec["breaker_no"] = pos
                p.spec = spec
        # supplier linked to L-005 second repair
        r2link = db.scalar(select(Repair).where(Repair.report_id == r2.id))
        if r2link: r2link.supplier_id = sup.id
        db.commit()
        print("seed: spec extension ok — MDB-1/3 breakers, SW-101, W-001, SEN-001, FAN-001, supplier, logs")
        db.commit()
        print("seed: ok — users admin/gig/san, 17 points, L-005 history, 1 open job")
    finally:
        db.close()


if __name__ == "__main__":
    main()
