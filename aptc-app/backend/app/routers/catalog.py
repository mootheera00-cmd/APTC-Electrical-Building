"""CRUD routers: catalog (buildings/floors/rooms/categories/users) + points/equipments."""
from __future__ import annotations
import datetime as dt
import time
from pathlib import Path
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import UPLOAD_DIR, get_db, missing_fields, point_summary, point_timeline

router = APIRouter()

ALLOWED_UPLOADS = {".png", ".jpg", ".jpeg", ".webp", ".pdf"}
MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB per attachment


def _role(x_user_role: str | None) -> str:
    return (x_user_role or "reporter").lower()


def _need(x_user_role: str | None, *allowed: str):
    if _role(x_user_role) not in allowed:
        raise HTTPException(403, "Forbidden for role: " + _role(x_user_role))


# ---------- users ----------
@router.get("/users", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.scalars(select(models.User).order_by(models.User.id)).all()


@router.post("/users", response_model=schemas.UserOut)
def create_user(body: schemas.UserIn, db: Session = Depends(get_db),
                x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin")
    if db.scalar(select(models.User).where(models.User.username == body.username)):
        raise HTTPException(409, "username taken")
    u = models.User(username=body.username, name=body.name, role=body.role)
    db.add(u); db.commit(); db.refresh(u)
    return u


@router.post("/login", response_model=schemas.UserOut)
def login(body: schemas.LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(models.User).where(models.User.username == body.username))
    if not u or not u.active:
        raise HTTPException(404, "unknown user")
    return u


# ---------- buildings ----------
@router.get("/buildings", response_model=list[schemas.BuildingOut])
def list_buildings(db: Session = Depends(get_db)):
    return db.scalars(select(models.Building)).all()


@router.post("/buildings", response_model=schemas.BuildingOut)
def create_building(body: schemas.BuildingIn, db: Session = Depends(get_db),
                    x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin")
    b = models.Building(**body.model_dump()); db.add(b); db.commit(); db.refresh(b)
    return b


@router.put("/buildings/{bid}", response_model=schemas.BuildingOut)
def update_building(bid: int, body: schemas.BuildingIn, db: Session = Depends(get_db),
                    x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin")
    b = db.get(models.Building, bid)
    if not b: raise HTTPException(404, "not found")
    for k, v in body.model_dump().items(): setattr(b, k, v)
    db.commit(); db.refresh(b); return b


@router.delete("/buildings/{bid}")
def delete_building(bid: int, db: Session = Depends(get_db),
                    x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin")
    b = db.get(models.Building, bid)
    if not b: raise HTTPException(404, "not found")
    db.delete(b); db.commit(); return {"ok": True}


# ---------- floors ----------
@router.get("/floors", response_model=list[schemas.FloorOut])
def list_floors(building_id: int | None = None, db: Session = Depends(get_db)):
    q = select(models.Floor).order_by(models.Floor.level)
    if building_id: q = q.where(models.Floor.building_id == building_id)
    return db.scalars(q).all()


@router.post("/floors", response_model=schemas.FloorOut)
def create_floor(body: schemas.FloorIn, db: Session = Depends(get_db),
                 x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin")
    f = models.Floor(**body.model_dump()); db.add(f); db.commit(); db.refresh(f)
    return f


# ---------- rooms ----------
@router.get("/rooms", response_model=list[schemas.RoomOut])
def list_rooms(floor_id: int | None = None, db: Session = Depends(get_db)):
    q = select(models.Room).order_by(models.Room.code)
    if floor_id: q = q.where(models.Room.floor_id == floor_id)
    return db.scalars(q).all()


@router.post("/rooms", response_model=schemas.RoomOut)
def create_room(body: schemas.RoomIn, db: Session = Depends(get_db),
                x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin")
    if db.scalar(select(models.Room).where(models.Room.code == body.code)):
        raise HTTPException(409, "room code taken")
    r = models.Room(**body.model_dump()); db.add(r); db.commit(); db.refresh(r)
    return r


# ---------- categories ----------
@router.get("/categories", response_model=list[schemas.CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.scalars(select(models.Category)).all()


@router.post("/categories", response_model=schemas.CategoryOut)
def create_category(body: schemas.CategoryIn, db: Session = Depends(get_db),
                    x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin")
    c = models.Category(**body.model_dump()); db.add(c); db.commit(); db.refresh(c)
    return c


# ---------- points ----------
def _repairs_of(p: models.InstallPoint) -> list[dict]:
    """Full repair records for a point — the same fields the Repairs screen shows."""
    rows = sorted((x for r in p.reports for x in r.repairs),
                  key=lambda x: x.repaired_at or dt.datetime.min, reverse=True)
    return [{
        "id": x.id, "report_id": x.report_id,
        "action": x.action, "cost": x.cost,
        "repaired_at": x.repaired_at.isoformat() if x.repaired_at else None,
        "attachment": x.attachment, "note": x.note,
        "technician_name": x.technician.name if x.technician else "",
        "supplier_name": x.supplier.company if x.supplier else "",
        "report_status": x.report.status if x.report else "",
        "report_symptom": x.report.symptom if x.report else "",
        "report_reported_at": x.report.reported_at.isoformat() if x.report and x.report.reported_at else None,
    } for x in rows]


def _point_out(db: Session, p: models.InstallPoint, with_summary: bool,
               history_count: int | None = None) -> dict:
    d = {c: getattr(p, c) for c in ("id", "code", "room_id", "category_id", "name_en",
                                    "x_pct", "y_pct", "installed_at", "notes", "is_active")}
    d["room_code"] = p.room.code if p.room else ""
    d["room_name"] = (p.room.name_en if p.room else "")
    d["category_code"] = p.category.code if p.category else ""
    d["category_name"] = (p.category.name_en if p.category else "")
    d["work_type"] = (p.category.work_type if p.category else "") or ""
    d["spec"] = p.spec or {}
    if history_count is None:
        log_rows = db.scalar(select(func.count()).select_from(models.PointLog)
                             .where(models.PointLog.install_point_id == p.id)) or 0
        rep_rows = db.scalar(select(func.count()).select_from(models.Repair)
                             .join(models.Report, models.Repair.report_id == models.Report.id)
                             .where(models.Report.install_point_id == p.id)) or 0
        history_count = log_rows + rep_rows
    d["log_count"] = history_count
    d["missing"] = missing_fields(p, history_count)
    d["summary"] = point_summary(db, p) if with_summary else {}
    return d


@router.get("/points")
def list_points(room_id: int | None = None, category_id: int | None = None,
                q: str | None = None, db: Session = Depends(get_db)):
    query = select(models.InstallPoint).order_by(models.InstallPoint.code)
    if room_id: query = query.where(models.InstallPoint.room_id == room_id)
    if category_id: query = query.where(models.InstallPoint.category_id == category_id)
    if q:
        like = f"%{q}%"
        query = query.where((models.InstallPoint.code.ilike(like))
                            | (models.InstallPoint.name_en.ilike(like)))
    pts = db.scalars(query).all()
    logs = dict(db.execute(select(models.PointLog.install_point_id, func.count())
                           .group_by(models.PointLog.install_point_id)).all())
    reps = dict(db.execute(select(models.Report.install_point_id, func.count(models.Repair.id))
                           .join(models.Repair, models.Repair.report_id == models.Report.id)
                           .group_by(models.Report.install_point_id)).all())
    return [_point_out(db, p, True, logs.get(p.id, 0) + reps.get(p.id, 0)) for p in pts]


@router.post("/points")
def create_point(body: schemas.PointIn, db: Session = Depends(get_db),
                 x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    if db.scalar(select(models.InstallPoint).where(models.InstallPoint.code == body.code)):
        raise HTTPException(409, "point code taken")
    p = models.InstallPoint(**body.model_dump()); db.add(p); db.commit(); db.refresh(p)
    return _point_out(db, p, True)


@router.get("/points/{code}")
def point_detail(code: str, db: Session = Depends(get_db)):
    p = db.scalar(select(models.InstallPoint).where(models.InstallPoint.code == code))
    if not p: raise HTTPException(404, "point not found")
    out = _point_out(db, p, True)
    out["timeline"] = point_timeline(db, p)
    out["equipments"] = [{"id": e.id, "serial_no": e.serial_no, "brand_model": e.brand_model,
                          "installed_at": e.installed_at.isoformat() if e.installed_at else None,
                          "removed_at": e.removed_at.isoformat() if e.removed_at else None,
                          "status": e.status, "notes": e.notes} for e in p.equipments]
    out["spec"] = p.spec or {}
    out["sub_units"] = [{"id": u.id, "kind": u.kind, "label": u.label,
                         "detail": u.detail, "status": u.status} for u in p.sub_units]
    out["maintenances"] = [{"id": m.id, "kind": m.kind,
                            "performed_at": m.performed_at.isoformat() if m.performed_at else None,
                            "performer": m.performer, "result": m.result,
                            "cost": m.cost, "note": m.note} for m in p.maintenances]
    # switch → controlled lamps (reverse lookup for SW points)
    out["controls"] = []
    if p.category and p.category.code == "SW":
        for q in db.scalars(select(models.InstallPoint)).all():
            if (q.spec or {}).get("switch_point_id") == p.id:
                out["controls"].append({"code": q.code, "name": q.name_en})
    out["logs"] = [{"id": g.id, "kind": g.kind,
                    "happened_at": g.happened_at.isoformat() if g.happened_at else None,
                    "detail": g.detail, "recorded_by": g.recorded_by} for g in p.logs]
    out["repairs"] = _repairs_of(p)
    return out


@router.put("/points/{pid}")
def update_point(pid: int, body: schemas.PointUpdate, db: Session = Depends(get_db),
                 x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    p = db.get(models.InstallPoint, pid)
    if not p: raise HTTPException(404, "not found")
    sent = body.model_dump(exclude_unset=True)
    if sent.get("code") and sent["code"] != p.code:
        if db.scalar(select(models.InstallPoint).where(models.InstallPoint.code == sent["code"])):
            raise HTTPException(409, "point code taken")
    if sent.get("room_id") and not db.get(models.Room, sent["room_id"]):
        raise HTTPException(404, "room not found")
    if sent.get("category_id") and not db.get(models.Category, sent["category_id"]):
        raise HTTPException(404, "category not found")
    for k, v in sent.items():
        if v is not None or k == "installed_at":
            setattr(p, k, v)
    db.commit(); db.refresh(p); return _point_out(db, p, True)


@router.patch("/points/{pid}/position")
def move_point(pid: int, body: schemas.PointMove, db: Session = Depends(get_db),
               x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    p = db.get(models.InstallPoint, pid)
    if not p: raise HTTPException(404, "not found")
    p.x_pct, p.y_pct = body.x_pct, body.y_pct
    db.commit(); return {"ok": True, "x_pct": p.x_pct, "y_pct": p.y_pct}


@router.delete("/points/{pid}")
def delete_point(pid: int, db: Session = Depends(get_db),
                 x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin")
    p = db.get(models.InstallPoint, pid)
    if not p: raise HTTPException(404, "not found")
    db.delete(p); db.commit(); return {"ok": True}


# ---------- point attachments ----------
def _save_upload(sub: str, f: UploadFile) -> str:
    """Store one attachment, refusing anything above 500 MB."""
    ext = Path(f.filename or "").suffix.lower()
    if ext not in ALLOWED_UPLOADS:
        raise HTTPException(400, f"file type not allowed: {ext}")
    name = f"{int(time.time()*1000)}_{Path(f.filename or 'file').stem[:40]}{ext}"
    dest = UPLOAD_DIR / sub / name
    size = 0
    try:
        with dest.open("wb") as out:
            while True:
                chunk = f.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "ไฟล์ใหญ่เกิน 500MB · file is larger than 500 MB")
                out.write(chunk)
    except Exception:
        dest.unlink(missing_ok=True)
        raise
    return f"/uploads/{sub}/{name}"


@router.post("/points/{pid}/attachment")
def upload_point_attachment(pid: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                            x_user_role: str | None = Header(default=None)):
    """Attach the purchase order / photo that backs a point's spec (500 MB max)."""
    _need(x_user_role, "admin", "technician")
    p = db.get(models.InstallPoint, pid)
    if not p: raise HTTPException(404, "point not found")
    spec = dict(p.spec or {})
    spec["attachment"] = _save_upload("spec", file)
    spec["attachment_name"] = file.filename or ""
    p.spec = spec
    db.commit()
    return {"ok": True, "attachment": spec["attachment"], "attachment_name": spec["attachment_name"]}


# ---------- point logs (hand-written timeline) ----------
LOG_KINDS = ("install", "repair", "replace", "update")


def _log_out(g: models.PointLog) -> dict:
    return {"id": g.id, "install_point_id": g.install_point_id, "kind": g.kind,
            "happened_at": g.happened_at.isoformat() if g.happened_at else None,
            "detail": g.detail, "recorded_by": g.recorded_by}


@router.post("/points/{pid}/logs")
def create_point_log(pid: int, body: schemas.PointLogIn, db: Session = Depends(get_db),
                     x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    p = db.get(models.InstallPoint, pid)
    if not p: raise HTTPException(404, "point not found")
    if body.kind not in LOG_KINDS:
        raise HTTPException(400, "bad kind")
    if not body.detail.strip() or not body.recorded_by.strip():
        raise HTTPException(400, "ต้องกรอกรายละเอียดและชื่อผู้บันทึก · detail and recorder are required")
    g = models.PointLog(install_point_id=p.id, kind=body.kind,
                        happened_at=body.happened_at or dt.datetime.now(),
                        detail=body.detail.strip(), recorded_by=body.recorded_by.strip())
    db.add(g); db.commit(); db.refresh(g)
    return _log_out(g)


@router.put("/logs/{lid}")
def update_point_log(lid: int, body: schemas.PointLogUpdate, db: Session = Depends(get_db),
                     x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    g = db.get(models.PointLog, lid)
    if not g: raise HTTPException(404, "not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(g, k, v)
    db.commit(); db.refresh(g); return _log_out(g)


@router.delete("/logs/{lid}")
def delete_point_log(lid: int, db: Session = Depends(get_db),
                     x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    g = db.get(models.PointLog, lid)
    if not g: raise HTTPException(404, "not found")
    db.delete(g); db.commit(); return {"ok": True}


# ---------- equipments ----------
@router.get("/equipments", response_model=list[schemas.EquipmentOut])
def list_equipments(point_id: int | None = None, db: Session = Depends(get_db)):
    q = select(models.Equipment).order_by(models.Equipment.installed_at)
    if point_id: q = q.where(models.Equipment.install_point_id == point_id)
    return db.scalars(q).all()


@router.post("/equipments", response_model=schemas.EquipmentOut)
def create_equipment(body: schemas.EquipmentIn, db: Session = Depends(get_db),
                     x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    e = models.Equipment(**body.model_dump()); db.add(e); db.commit(); db.refresh(e)
    return e


@router.post("/points/{pid}/replace")
def replace_equipment(pid: int, body: schemas.ReplaceIn, db: Session = Depends(get_db),
                      x_user_role: str | None = Header(default=None)):
    """Retire current active unit, add new one. Point history is preserved."""
    _need(x_user_role, "admin", "technician")
    from datetime import datetime
    p = db.get(models.InstallPoint, pid)
    if not p: raise HTTPException(404, "point not found")
    now = body.installed_at or datetime.now()
    old = db.scalars(select(models.Equipment).where(
        models.Equipment.install_point_id == pid,
        models.Equipment.status == "active")).all()
    for e in old:
        e.status = "retired"; e.removed_at = now
    new = models.Equipment(install_point_id=pid, serial_no=body.serial_no,
                           brand_model=body.brand_model, installed_at=now,
                           status="active", notes=body.notes)
    db.add(new); db.commit(); db.refresh(new)
    return {"ok": True, "retired": len(old), "new_id": new.id}
