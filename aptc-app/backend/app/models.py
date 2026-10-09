"""APTC-Electrical and Building — SQLAlchemy models (MySQL / SQLite)."""
from __future__ import annotations
import datetime as dt
from sqlalchemy import (Boolean, DateTime, Float, ForeignKey, Integer, JSON, String,
                        Text, UniqueConstraint, func)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(16), default="reporter")  # admin|reporter|technician
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Building(Base):
    __tablename__ = "buildings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_en: Mapped[str] = mapped_column(String(128))
    name_th: Mapped[str] = mapped_column(String(128), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    floors: Mapped[list["Floor"]] = relationship(back_populates="building", cascade="all, delete-orphan")


class Floor(Base):
    __tablename__ = "floors"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id", ondelete="CASCADE"))
    name_en: Mapped[str] = mapped_column(String(64))  # e.g. 1F
    level: Mapped[int] = mapped_column(Integer, default=1)
    plan_image: Mapped[str] = mapped_column(String(256), default="")  # /uploads/plan/xxx.png
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    building: Mapped["Building"] = relationship(back_populates="floors")
    rooms: Mapped[list["Room"]] = relationship(back_populates="floor", cascade="all, delete-orphan")


class Room(Base):
    __tablename__ = "rooms"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    floor_id: Mapped[int] = mapped_column(ForeignKey("floors.id", ondelete="CASCADE"))
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name_en: Mapped[str] = mapped_column(String(128))
    name_th: Mapped[str] = mapped_column(String(128), default="")
    room_type: Mapped[str] = mapped_column(String(64), default="")
    width_m: Mapped[float | None] = mapped_column(Float, nullable=True)   # กว้าง
    length_m: Mapped[float | None] = mapped_column(Float, nullable=True)  # ยาว
    height_m: Mapped[float | None] = mapped_column(Float, nullable=True)  # สูง
    floor_area_m2: Mapped[float | None] = mapped_column(Float, nullable=True)  # พื้นที่พื้น
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    floor: Mapped["Floor"] = relationship(back_populates="rooms")
    points: Mapped[list["InstallPoint"]] = relationship(back_populates="room")


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True, index=True)  # L|P|AC...
    name_en: Mapped[str] = mapped_column(String(64))
    name_th: Mapped[str] = mapped_column(String(64), default="")
    icon: Mapped[str] = mapped_column(String(32), default="plug")  # lucide name
    color: Mapped[str] = mapped_column(String(16), default="#4f5d75")
    work_type: Mapped[str] = mapped_column(String(32), default="")  # electrical|building|other


class InstallPoint(Base):
    """Aggregate root: a fixed mounting location on the plan. History hangs off it."""
    __tablename__ = "install_points"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)  # e.g. L-005
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id"))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    name_en: Mapped[str] = mapped_column(String(128), default="")
    x_pct: Mapped[float] = mapped_column(Float, default=50.0)  # 0-100 on plan image
    y_pct: Mapped[float] = mapped_column(Float, default=50.0)
    installed_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # --- per-category spec (JSON, keys depend on category.code) ---
    # P:   {socket_type, panel_id, breaker_no}
    # SW:  {gang_count, controls:[point_ids], panel_id, breaker_no}
    # L:   {lamp_type, wattage, switch_point_id, panel_id, breaker_no}
    # MDB: {panel_code, main_amps, location_note}
    # W:   {fixture_type, valve_location, parent_point_id}
    # AC:  {brand, model, btu, indoor_note, outdoor_location, panel_id, breaker_no}
    # SEN: {sensor_type, model, zone, panel_id}
    # FAN: {model, size_inch, wattage, switch_point_id, panel_id, breaker_no}
    spec: Mapped[dict] = mapped_column(JSON, default=dict)
    room: Mapped["Room"] = relationship(back_populates="points")
    category: Mapped["Category"] = relationship()
    equipments: Mapped[list["Equipment"]] = relationship(back_populates="point", cascade="all, delete-orphan")
    reports: Mapped[list["Report"]] = relationship(back_populates="point", cascade="all, delete-orphan")
    sub_units: Mapped[list["SubUnit"]] = relationship(back_populates="point", cascade="all, delete-orphan")
    maintenances: Mapped[list["Maintenance"]] = relationship(back_populates="point", cascade="all, delete-orphan")
    logs: Mapped[list["PointLog"]] = relationship(
        back_populates="point", cascade="all, delete-orphan", order_by="PointLog.happened_at")


class Equipment(Base):
    """One physical unit mounted at a point. Replacing = retire old + add new."""
    __tablename__ = "equipments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    install_point_id: Mapped[int] = mapped_column(ForeignKey("install_points.id", ondelete="CASCADE"))
    serial_no: Mapped[str] = mapped_column(String(64), default="")
    brand_model: Mapped[str] = mapped_column(String(128), default="")
    installed_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    removed_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active|retired
    notes: Mapped[str] = mapped_column(Text, default="")
    point: Mapped["InstallPoint"] = relationship(back_populates="equipments")


class Report(Base):
    """Fault report. status: reported|waiting|repairing|done."""
    __tablename__ = "reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    install_point_id: Mapped[int] = mapped_column(ForeignKey("install_points.id", ondelete="CASCADE"))
    equipment_id: Mapped[int | None] = mapped_column(ForeignKey("equipments.id"), nullable=True)
    symptom: Mapped[str] = mapped_column(Text)
    photo: Mapped[str] = mapped_column(String(256), default="")  # /uploads/report/xxx
    reporter_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reported_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
    status: Mapped[str] = mapped_column(String(16), default="reported", index=True)
    note: Mapped[str] = mapped_column(Text, default="")
    work_type: Mapped[str] = mapped_column(String(32), default="")  # electrical|building|other
    code: Mapped[str] = mapped_column(String(32), default="")  # REP-YYYY-NNNN, yearly run
    quotation_attachment: Mapped[str] = mapped_column(String(256), default="")  # File (Quotation) and P/R
    point: Mapped["InstallPoint"] = relationship(back_populates="reports")
    reporter: Mapped["User | None"] = relationship()
    repairs: Mapped[list["Repair"]] = relationship(back_populates="report", cascade="all, delete-orphan")


class Repair(Base):
    __tablename__ = "repairs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"))
    technician_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(Text, default="")
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    repaired_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    started_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    completed_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    attachment: Mapped[str] = mapped_column(String(256), default="")  # legacy /uploads/repair/xxx
    quotation_attachment: Mapped[str] = mapped_column(String(256), default="")
    po_attachment: Mapped[str] = mapped_column(String(256), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    po_no: Mapped[str] = mapped_column(String(32), default="")
    po_date: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    code: Mapped[str] = mapped_column(String(32), default="")  # REP-YYYY-NNNN, yearly run
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True)
    report: Mapped["Report"] = relationship(back_populates="repairs")
    technician: Mapped["User | None"] = relationship()
    supplier: Mapped["Supplier | None"] = relationship(back_populates="repairs")


class Supplier(Base):
    """หมวด 10: vendor contact + linked repairs/points."""
    __tablename__ = "suppliers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company: Mapped[str] = mapped_column(String(128))
    work_type: Mapped[str] = mapped_column(String(128), default="")  # ประเภทงาน (joined summary)
    contact_name: Mapped[str] = mapped_column(String(128), default="")
    phone: Mapped[str] = mapped_column(String(64), default="")
    line_id: Mapped[str] = mapped_column(String(64), default="")
    email: Mapped[str] = mapped_column(String(128), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    repairs: Mapped[list["Repair"]] = relationship(back_populates="supplier")
    contacts: Mapped[list["SupplierContact"]] = relationship(
        back_populates="supplier", cascade="all, delete-orphan",
        order_by="SupplierContact.id.desc()")
    work_types: Mapped[list["SupplierWorkType"]] = relationship(
        back_populates="supplier", cascade="all, delete-orphan",
        order_by="SupplierWorkType.sort_order, SupplierWorkType.id")


class SupplierWorkType(Base):
    """One trade a vendor covers (หมวด 10).

    Most contractors do more than one thing — an electrical shop that also
    cleans AC and tests fire alarms — so the trade is a list. `Supplier.work_type`
    is kept as the `" / "`-joined summary so older readers keep working; this
    table is the source of truth.
    """
    __tablename__ = "supplier_work_types"
    __table_args__ = (UniqueConstraint("supplier_id", "name", name="uq_supplier_work_type"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    supplier_id: Mapped[int] = mapped_column(
        ForeignKey("suppliers.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    supplier: Mapped["Supplier"] = relationship(back_populates="work_types")


class SupplierContact(Base):
    """One contact-person period at a supplier (หมวด 10).

    Suppliers swap contacts often, so every period is kept: the open row
    (`is_current=True`, `ended_at` NULL) is who to call today, closed rows are
    the history. `started_at` is NULL when the period began before this table
    existed — the UI shows "ไม่ทราบวันเริ่ม" for those instead of guessing.
    """
    __tablename__ = "supplier_contacts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    supplier_id: Mapped[int] = mapped_column(
        ForeignKey("suppliers.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(128), default="")
    phone: Mapped[str] = mapped_column(String(64), default="")
    line_id: Mapped[str] = mapped_column(String(64), default="")
    email: Mapped[str] = mapped_column(String(128), default="")
    note: Mapped[str] = mapped_column(Text, default="")  # why the contact changed
    started_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
    supplier: Mapped["Supplier"] = relationship(back_populates="contacts")


class Panel(Base):
    """หมวด 4: main distribution board / consumer unit on the plan."""
    __tablename__ = "panels"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)  # รหัสตู้ e.g. MDB-1
    room_id: Mapped[int | None] = mapped_column(ForeignKey("rooms.id"), nullable=True)
    name_en: Mapped[str] = mapped_column(String(128), default="")
    main_amps: Mapped[float | None] = mapped_column(Float, nullable=True)
    main_breaker: Mapped[str] = mapped_column(String(128), default="")  # สเปกตัวเมน เช่น MCCB 100A 3P
    phase: Mapped[str] = mapped_column(String(64), default="")  # ระบบไฟ เช่น 3P 4W 400V
    location_note: Mapped[str] = mapped_column(String(256), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    room: Mapped["Room | None"] = relationship()
    breakers: Mapped[list["Breaker"]] = relationship(
        back_populates="panel", cascade="all, delete-orphan",
        order_by="Breaker.position_no")


class Breaker(Base):
    """เบรกเกอร์ย่อยในตู้ — สเปก, หน้าที่, และวงจรที่ควบคุม.

    `position_no` is the number printed on the board. Install points carry
    `spec.panel_id` + `spec.breaker_no`, so the points a breaker feeds are
    resolved by matching that number — no extra join table needed.
    """
    __tablename__ = "breakers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    panel_id: Mapped[int] = mapped_column(ForeignKey("panels.id", ondelete="CASCADE"))
    position_no: Mapped[str] = mapped_column(String(16), default="")  # ลำดับในตู้
    amps: Mapped[float | None] = mapped_column(Float, nullable=True)  # พิกัดกระแส
    poles: Mapped[str] = mapped_column(String(8), default="")  # 1P|2P|3P|4P
    breaker_type: Mapped[str] = mapped_column(String(16), default="")  # MCB|MCCB|RCBO|ELCB|Isolator
    rated_ka: Mapped[float | None] = mapped_column(Float, nullable=True)  # ความสามารถตัดกระแสลัดวงจร
    brand_model: Mapped[str] = mapped_column(String(128), default="")
    purpose: Mapped[str] = mapped_column(String(128), default="")  # ใช้สำหรับอะไร
    circuit_name: Mapped[str] = mapped_column(String(128), default="")  # อุปกรณ์/พื้นที่ที่ควบคุม
    controls: Mapped[str] = mapped_column(String(256), default="")  # สิ่งที่ควบคุม (พิมพ์เอง)
    notes: Mapped[str] = mapped_column(String(256), default="")
    panel: Mapped["Panel"] = relationship(back_populates="breakers")


class SubUnit(Base):
    """อุปกรณ์ย่อยใต้จุดติดตั้ง — หมวด 5 (ก๊อก/อ่างแยกกัน), หมวด 6 (คอยล์ร้อน/เย็น)."""
    __tablename__ = "sub_units"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    install_point_id: Mapped[int] = mapped_column(ForeignKey("install_points.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(32), default="")  # faucet|sink|indoor|outdoor|gang|other
    label: Mapped[str] = mapped_column(String(128), default="")
    detail: Mapped[str] = mapped_column(String(256), default="")
    status: Mapped[str] = mapped_column(String(16), default="active")  # active|retired
    point: Mapped["InstallPoint"] = relationship(back_populates="sub_units")


class Maintenance(Base):
    """ประวัติงานประจำ — หมวด 6 ล้างแอร์, หมวด 7 ทดสอบเซ็นเซอร์ (ไม่ต้องแจ้งเสียก่อน)."""
    __tablename__ = "maintenances"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    install_point_id: Mapped[int] = mapped_column(ForeignKey("install_points.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(32), default="cleaning")  # cleaning|test|inspection
    performed_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
    performer: Mapped[str] = mapped_column(String(128), default="")
    result: Mapped[str] = mapped_column(String(64), default="pass")  # pass|fail|-
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    note: Mapped[str] = mapped_column(Text, default="")
    point: Mapped["InstallPoint"] = relationship(back_populates="maintenances")

class PointLog(Base):
    """ไทม์ไลน์ที่บันทึกด้วยมือ — ติดตั้ง / ซ่อม / เปลี่ยน / อัปเดตข้อมูลประจำจุด.

    Derived history (equipment, reports, repairs, maintenance) stays where it is;
    this table is the human log the technician keeps for each point.
    """
    __tablename__ = "point_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    install_point_id: Mapped[int] = mapped_column(
        ForeignKey("install_points.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16), default="update")  # install|repair|replace|update
    happened_at: Mapped[dt.datetime] = mapped_column(DateTime, default=utcnow)
    detail: Mapped[str] = mapped_column(Text, default="")
    recorded_by: Mapped[str] = mapped_column(String(128), default="")
    point: Mapped["InstallPoint"] = relationship(back_populates="logs")