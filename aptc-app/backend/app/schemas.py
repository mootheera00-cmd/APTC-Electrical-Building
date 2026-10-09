"""Pydantic schemas (request/response)."""
from __future__ import annotations
import datetime as dt
from pydantic import BaseModel, Field


class UserOut(BaseModel):
    id: int; username: str; name: str; role: str; active: bool
    model_config = {"from_attributes": True}

class UserIn(BaseModel):
    username: str; name: str; role: str = "reporter"

class LoginIn(BaseModel):
    username: str


class BuildingIn(BaseModel):
    name_en: str; name_th: str = ""; description: str = ""

class BuildingOut(BuildingIn):
    id: int
    model_config = {"from_attributes": True}


class FloorIn(BaseModel):
    building_id: int; name_en: str; level: int = 1; plan_image: str = ""; is_active: bool = True

class FloorOut(FloorIn):
    id: int
    model_config = {"from_attributes": True}


class RoomIn(BaseModel):
    floor_id: int; code: str; name_en: str; name_th: str = ""; room_type: str = ""; is_active: bool = True
    width_m: float | None = None; length_m: float | None = None
    height_m: float | None = None; floor_area_m2: float | None = None

class RoomOut(RoomIn):
    id: int
    model_config = {"from_attributes": True}


class CategoryIn(BaseModel):
    code: str; name_en: str; name_th: str = ""; icon: str = "plug"; color: str = "#4f5d75"
    work_type: str = ""  # electrical|building|other — ใช้กรองหมวดในฟอร์มจุดใหม่

class CategoryOut(CategoryIn):
    id: int
    model_config = {"from_attributes": True}


class PointIn(BaseModel):
    code: str; room_id: int; category_id: int; name_en: str = ""
    x_pct: float = 50.0; y_pct: float = 50.0
    installed_at: dt.datetime | None = None; notes: str = ""; is_active: bool = True
    spec: dict = {}

class PointMove(BaseModel):
    x_pct: float = Field(ge=0, le=100); y_pct: float = Field(ge=0, le=100)


class PointUpdate(BaseModel):
    """Partial update — only the fields sent are changed.

    Everything is optional so editing a point's name never risks wiping its
    position or its per-category `spec`.
    """
    code: str | None = None; room_id: int | None = None; category_id: int | None = None
    name_en: str | None = None; x_pct: float | None = None; y_pct: float | None = None
    installed_at: dt.datetime | None = None; notes: str | None = None
    is_active: bool | None = None; spec: dict | None = None

class PointLogIn(BaseModel):
    """One hand-written timeline entry for a point."""
    kind: str = "update"          # install|repair|replace|update
    happened_at: dt.datetime | None = None
    detail: str = ""
    recorded_by: str = ""


class PointLogUpdate(BaseModel):
    kind: str | None = None
    happened_at: dt.datetime | None = None
    detail: str | None = None
    recorded_by: str | None = None


class PointOut(BaseModel):
    id: int; code: str; room_id: int; category_id: int; name_en: str
    x_pct: float; y_pct: float; installed_at: dt.datetime | None; notes: str; is_active: bool
    room_code: str = ""; room_name: str = ""; category_code: str = ""; category_name: str = ""
    summary: dict = {}
    model_config = {"from_attributes": True}


class EquipmentIn(BaseModel):
    install_point_id: int; serial_no: str = ""; brand_model: str = ""
    installed_at: dt.datetime | None = None; notes: str = ""

class EquipmentOut(BaseModel):
    id: int; install_point_id: int; serial_no: str; brand_model: str
    installed_at: dt.datetime | None; removed_at: dt.datetime | None; status: str; notes: str
    model_config = {"from_attributes": True}

class ReplaceIn(BaseModel):
    serial_no: str = ""; brand_model: str = ""; installed_at: dt.datetime | None = None; notes: str = ""


class ReportIn(BaseModel):
    install_point_id: int; symptom: str; reporter_id: int | None = None
    reported_at: dt.datetime | None = None; note: str = ""
    work_type: str = ""  # electrical|building|other

class ReportOut(BaseModel):
    id: int; install_point_id: int; equipment_id: int | None; symptom: str; photo: str
    reporter_id: int | None; reported_at: dt.datetime | None; status: str; note: str
    work_type: str = ""
    code: str = ""
    quotation_attachment: str = ""
    point_code: str = ""; reporter_name: str = ""
    model_config = {"from_attributes": True}

class ReportStatusIn(BaseModel):
    status: str  # reported|waiting|repairing|done


class RepairIn(BaseModel):
    report_id: int; technician_id: int | None = None; action: str = ""
    cost: float = 0.0; repaired_at: dt.datetime | None = None; started_at: dt.datetime | None = None
    completed_at: dt.datetime | None = None; note: str = ""; po_no: str | None = None
    po_date: dt.datetime | None = None
    quotation_attachment: str | None = None; po_attachment: str | None = None
    supplier_id: int | None = None


class RepairUpdate(BaseModel):
    """Partial update — only the fields sent are changed."""
    report_id: int | None = None; technician_id: int | None = None
    action: str | None = None; cost: float | None = None
    repaired_at: dt.datetime | None = None; started_at: dt.datetime | None = None
    completed_at: dt.datetime | None = None; note: str | None = None
    po_no: str | None = None; po_date: dt.datetime | None = None
    quotation_attachment: str | None = None
    po_attachment: str | None = None; supplier_id: int | None = None

class RepairOut(BaseModel):
    id: int; report_id: int; technician_id: int | None; action: str; cost: float
    repaired_at: dt.datetime | None; started_at: dt.datetime | None = None
    completed_at: dt.datetime | None = None; attachment: str = ""; note: str = ""
    quotation_attachment: str = ""; po_attachment: str = ""; po_no: str | None = None
    po_date: dt.datetime | None = None
    code: str = ""
    technician_name: str = ""; supplier_id: int | None = None; supplier_name: str = ""
    model_config = {"from_attributes": True}


# ---------- 10-category extension ----------
class SupplierIn(BaseModel):
    company: str; work_type: str = ""; work_types: list[str] = []
    contact_name: str = ""; phone: str = ""
    line_id: str = ""; email: str = ""; notes: str = ""; is_active: bool = True

class SupplierOut(SupplierIn):
    id: int
    model_config = {"from_attributes": True}


class SupplierUpdate(BaseModel):
    """Partial update — only the fields sent are changed.

    `work_types` replaces the whole list. `work_type` is accepted as a legacy
    single-value alias. `contact_note` is not stored on the supplier; it is
    written onto the history row when the contact person actually changes.
    """
    company: str | None = None
    work_type: str | None = None
    work_types: list[str] | None = None
    notes: str | None = None
    is_active: bool | None = None
    contact_name: str | None = None
    phone: str | None = None
    line_id: str | None = None
    email: str | None = None
    contact_note: str = ""


class SupplierContactIn(BaseModel):
    name: str = ""; phone: str = ""; line_id: str = ""; email: str = ""; note: str = ""


class SupplierContactOut(SupplierContactIn):
    id: int
    started_at: dt.datetime | None = None
    ended_at: dt.datetime | None = None
    is_current: bool = True
    model_config = {"from_attributes": True}


class PanelIn(BaseModel):
    code: str; room_id: int | None = None; name_en: str = ""
    main_amps: float | None = None; main_breaker: str = ""; phase: str = ""
    location_note: str = ""; notes: str = ""; is_active: bool = True

class PanelOut(PanelIn):
    id: int; room_code: str = ""
    model_config = {"from_attributes": True}


class PanelUpdate(BaseModel):
    """Partial update — only the fields sent are changed."""
    code: str | None = None; room_id: int | None = None; name_en: str | None = None
    main_amps: float | None = None; main_breaker: str | None = None
    phase: str | None = None; location_note: str | None = None
    notes: str | None = None; is_active: bool | None = None


class BreakerIn(BaseModel):
    panel_id: int; position_no: str = ""; amps: float | None = None
    poles: str = ""; breaker_type: str = ""; rated_ka: float | None = None
    brand_model: str = ""; purpose: str = ""; circuit_name: str = ""; controls: str = ""
    notes: str = ""

class BreakerOut(BreakerIn):
    id: int; panel_code: str = ""
    model_config = {"from_attributes": True}


class BreakerUpdate(BaseModel):
    """Partial update — only the fields sent are changed."""
    panel_id: int | None = None; position_no: str | None = None
    amps: float | None = None; poles: str | None = None
    breaker_type: str | None = None; rated_ka: float | None = None
    brand_model: str | None = None; purpose: str | None = None
    circuit_name: str | None = None; controls: str | None = None
    notes: str | None = None


class SubUnitIn(BaseModel):
    install_point_id: int; kind: str = "other"; label: str = ""
    detail: str = ""; status: str = "active"

class SubUnitOut(SubUnitIn):
    id: int
    model_config = {"from_attributes": True}


class MaintenanceIn(BaseModel):
    install_point_id: int; kind: str = "cleaning"
    performed_at: dt.datetime | None = None; performer: str = ""
    result: str = "pass"; cost: float = 0.0; note: str = ""


class MaintenanceUpdate(BaseModel):
    """Partial update — only the fields sent are changed."""
    install_point_id: int | None = None; kind: str | None = None
    performed_at: dt.datetime | None = None; performer: str | None = None
    result: str | None = None; cost: float | None = None; note: str | None = None

class MaintenanceOut(BaseModel):
    id: int; install_point_id: int; kind: str; performed_at: dt.datetime | None
    performer: str; result: str; cost: float; note: str; point_code: str = ""
    model_config = {"from_attributes": True}
