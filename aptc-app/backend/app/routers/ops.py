"""Routers: reports, repairs, uploads, dashboard."""
from __future__ import annotations
import time
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import UPLOAD_DIR, get_db, point_summary

router = APIRouter()

ALLOWED = {".png", ".jpg", ".jpeg", ".webp", ".pdf"}
MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB per attachment
WORK_TYPES = {"electrical", "building", "other"}  # ไฟฟ้า · งานอาคาร · อื่นๆ
CODE_PREFIX = "REP"  # REP-YYYY-NNNN · รันต่อเนื่องยาวไปตลอดปี


def _year_of(dtv: datetime | None) -> int:
    return (dtv or datetime.now()).year


def _next_code(db: Session, model, year: int) -> str:
    """Next number in that year's run. Codes are stored, not derived, so a
       number never moves once a supplier or a P/O already quotes it."""
    prefix = f"{CODE_PREFIX}-{year}-"
    top = 0
    for c in db.scalars(select(model.code).where(model.code.like(prefix + "%"))).all():
        try:
            top = max(top, int(str(c).rsplit("-", 1)[-1]))
        except ValueError:
            continue
    return f"{prefix}{top + 1:04d}"


def _ensure_code(db: Session, model, x, year: int) -> None:
    """Give a row its code, or move it to the new year when its date changed."""
    if not x.code or not str(x.code).startswith(f"{CODE_PREFIX}-{year}-"):
        x.code = _next_code(db, model, year)


def _role(x_user_role: str | None) -> str:
    return (x_user_role or "reporter").lower()


def _need(x_user_role: str | None, *allowed: str):
    if _role(x_user_role) not in allowed:
        raise HTTPException(403, "Forbidden for role: " + _role(x_user_role))


def _save_upload(sub: str, f: UploadFile) -> str:
    """Store one attachment, refusing anything above 500 MB."""
    ext = Path(f.filename or "").suffix.lower()
    if ext not in ALLOWED:
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


# ---------- reports ----------
@router.get("/reports")
def list_reports(status: str | None = None, point_id: int | None = None,
                 db: Session = Depends(get_db)):
    q = select(models.Report).order_by(models.Report.reported_at.desc())
    if status: q = q.where(models.Report.status == status)
    if point_id: q = q.where(models.Report.install_point_id == point_id)
    out = []
    for r in db.scalars(q).all():
        d = {c: getattr(r, c) for c in ("id", "install_point_id", "equipment_id", "symptom",
                                        "photo", "reporter_id", "reported_at", "status", "note",
                                        "work_type", "code", "quotation_attachment")}
        d["point_code"] = r.point.code if r.point else ""
        d["reporter_name"] = r.reporter.name if r.reporter else ""
        out.append(d)
    return out


@router.post("/reports")
def create_report(body: schemas.ReportIn, db: Session = Depends(get_db)):
    p = db.get(models.InstallPoint, body.install_point_id)
    if not p: raise HTTPException(404, "point not found")
    wt = (body.work_type or "").strip()
    if wt and wt not in WORK_TYPES:
        raise HTTPException(400, "work_type must be electrical|building|other")
    active_eq = db.scalar(select(models.Equipment).where(
        models.Equipment.install_point_id == p.id,
        models.Equipment.status == "active").order_by(models.Equipment.installed_at.desc()))
    when = body.reported_at or datetime.now()
    r = models.Report(install_point_id=p.id,
                      equipment_id=active_eq.id if active_eq else None,
                      symptom=body.symptom, reporter_id=body.reporter_id,
                      reported_at=when,
                      status="reported", note=body.note, work_type=wt,
                      code=_next_code(db, models.Report, _year_of(when)))
    db.add(r); db.commit(); db.refresh(r)
    return {"ok": True, "id": r.id, "status": r.status, "code": r.code}


@router.get("/reports/{rid}")
def get_report(rid: int, db: Session = Depends(get_db)):
    r = db.get(models.Report, rid)
    if not r: raise HTTPException(404, "not found")
    d = {c: getattr(r, c) for c in ("id", "install_point_id", "equipment_id", "symptom",
                                    "photo", "reporter_id", "reported_at", "status", "note",
                                    "work_type", "code", "quotation_attachment")}
    d["point_code"] = r.point.code if r.point else ""
    d["reporter_name"] = r.reporter.name if r.reporter else ""
    d["repairs"] = [{"id": x.id, "action": x.action, "cost": x.cost,
                     "repaired_at": x.repaired_at.isoformat() if x.repaired_at else None,
                     "technician_name": x.technician.name if x.technician else "",
                     "attachment": x.attachment, "note": x.note} for x in r.repairs]
    return d


@router.patch("/reports/{rid}")
def set_report_status(rid: int, body: schemas.ReportStatusIn, db: Session = Depends(get_db),
                      x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    if body.status not in ("reported", "waiting", "repairing", "done"):
        raise HTTPException(400, "bad status")
    r = db.get(models.Report, rid)
    if not r: raise HTTPException(404, "not found")
    r.status = body.status; db.commit()
    return {"ok": True, "status": r.status}


@router.post("/reports/{rid}/photo")
def upload_report_photo(rid: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    r = db.get(models.Report, rid)
    if not r: raise HTTPException(404, "not found")
    r.photo = _save_upload("report", file); db.commit()
    return {"ok": True, "photo": r.photo}


@router.post("/reports/{rid}/quotation")
def upload_report_quotation(rid: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                            x_user_role: str | None = Header(default=None)):
    """File (Quotation) and P/R — lives with the report, since that is where the
       request starts; came over from the Repair Records screen."""
    _need(x_user_role, "admin", "technician")
    r = db.get(models.Report, rid)
    if not r: raise HTTPException(404, "not found")
    r.quotation_attachment = _save_upload("report", file); db.commit()
    return {"ok": True, "quotation_attachment": r.quotation_attachment}


# ---------- repairs ----------
def _repair_json(x: models.Repair, with_report: bool = False) -> dict:
    pt = x.report.point if x.report and x.report.point else None
    out = {
        "id": x.id, "report_id": x.report_id, "technician_id": x.technician_id,
        "action": x.action, "cost": x.cost,
        "repaired_at": x.repaired_at.isoformat() if x.repaired_at else None,
        "started_at": x.started_at.isoformat() if x.started_at else None,
        "completed_at": x.completed_at.isoformat() if x.completed_at else None,
        "attachment": x.attachment, "quotation_attachment": x.quotation_attachment,
        "po_attachment": x.po_attachment, "note": x.note, "po_no": x.po_no or "",
        "po_date": x.po_date.isoformat() if x.po_date else None,
        "code": x.code or "",
        "work_type": (x.report.work_type if x.report else "") or "",
        "technician_name": x.technician.name if x.technician else "",
        "supplier_id": x.supplier_id,
        "supplier_name": x.supplier.company if x.supplier else "",
        "point_code": pt.code if pt else "",
        "point_name": pt.name_en if pt else "",
        "room_code": pt.room.code if pt and pt.room else "",
        "category_code": pt.category.code if pt and pt.category else "",
        "report_status": x.report.status if x.report else "",
        "report_symptom": x.report.symptom if x.report else "",
    }
    if with_report and x.report:
        r = x.report
        out["report"] = {
            "id": r.id, "symptom": r.symptom, "status": r.status, "note": r.note,
            "photo": r.photo, "reported_at": r.reported_at.isoformat() if r.reported_at else None,
            "reporter_name": r.reporter.name if r.reporter else "",
            "point_code": pt.code if pt else "", "point_name": pt.name_en if pt else "",
            "room_code": pt.room.code if pt and pt.room else "",
            # other repairs booked against the same report
            "siblings": [_repair_json(y) for y in r.repairs if y.id != x.id],
        }
    return out


@router.get("/repairs")
def list_repairs(report_id: int | None = None, db: Session = Depends(get_db)):
    q = select(models.Repair).order_by(models.Repair.repaired_at.desc())
    if report_id: q = q.where(models.Repair.report_id == report_id)
    return [_repair_json(x) for x in db.scalars(q.limit(500)).all()]


@router.get("/repairs/{xid}")
def repair_detail(xid: int, db: Session = Depends(get_db)):
    x = db.get(models.Repair, xid)
    if not x: raise HTTPException(404, "not found")
    return _repair_json(x, with_report=True)


@router.put("/repairs/{xid}")
def update_repair(xid: int, body: schemas.RepairUpdate, db: Session = Depends(get_db),
                  x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    x = db.get(models.Repair, xid)
    if not x: raise HTTPException(404, "not found")
    sent = body.model_dump(exclude_unset=True)
    if sent.get("report_id") and not db.get(models.Report, sent["report_id"]):
        raise HTTPException(404, "report not found")
    for k, v in sent.items():
        if v is not None or k == "cost":
            if k == "po_no":
                setattr(x, k, (v or "").strip())
            elif k in {"quotation_attachment", "po_attachment"}:
                setattr(x, k, v or "")
            else:
                setattr(x, k, v)
    if x.started_at is None and x.repaired_at is not None:
        x.started_at = x.repaired_at
    if x.completed_at is None and x.started_at is not None and x.repaired_at is not None:
        x.completed_at = x.repaired_at
    _ensure_code(db, models.Repair, x,
                 _year_of(x.po_date or x.completed_at or x.started_at or x.repaired_at))
    db.commit()
    return {"ok": True, "code": x.code}


@router.post("/repairs")
def create_repair(body: schemas.RepairIn, db: Session = Depends(get_db),
                  x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    r = db.get(models.Report, body.report_id)
    if not r: raise HTTPException(404, "report not found")
    start_dt = body.started_at or body.repaired_at or datetime.now()
    end_dt = body.completed_at or start_dt
    x = models.Repair(report_id=r.id, technician_id=body.technician_id,
                      action=body.action, cost=body.cost or 0,
                      repaired_at=start_dt, started_at=start_dt, completed_at=end_dt,
                      note=body.note, po_no=(body.po_no or "").strip(),
                      po_date=body.po_date,
                      quotation_attachment=body.quotation_attachment or "",
                      po_attachment=body.po_attachment or "",
                      supplier_id=body.supplier_id)
    _ensure_code(db, models.Repair, x, _year_of(start_dt))
    db.add(x)
    if r.status in ("reported", "waiting"):
        r.status = "repairing"
    db.commit(); db.refresh(x)
    return {"ok": True, "id": x.id, "code": x.code}


@router.post("/repairs/{xid}/attachment")
def upload_repair_attachment(xid: int, file: UploadFile = File(...),
                             db: Session = Depends(get_db),
                             x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    x = db.get(models.Repair, xid)
    if not x: raise HTTPException(404, "not found")
    x.attachment = _save_upload("repair", file); db.commit()
    return {"ok": True, "attachment": x.attachment}


@router.post("/repairs/{xid}/quotation")
def upload_repair_quotation(xid: int, file: UploadFile = File(...),
                           db: Session = Depends(get_db),
                           x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    x = db.get(models.Repair, xid)
    if not x: raise HTTPException(404, "not found")
    x.quotation_attachment = _save_upload("repair", file); db.commit()
    return {"ok": True, "quotation_attachment": x.quotation_attachment}


@router.post("/repairs/{xid}/po")
def upload_repair_po(xid: int, file: UploadFile = File(...),
                    db: Session = Depends(get_db),
                    x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    x = db.get(models.Repair, xid)
    if not x: raise HTTPException(404, "not found")
    x.po_attachment = _save_upload("repair", file); db.commit()
    return {"ok": True, "po_attachment": x.po_attachment}


# ---------- plan upload ----------
@router.post("/floors/{fid}/plan")
def upload_plan(fid: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin")
    f = db.get(models.Floor, fid)
    if not f: raise HTTPException(404, "not found")
    f.plan_image = _save_upload("plan", file); db.commit()
    return {"ok": True, "plan_image": f.plan_image}


# ---------- dashboard ----------
@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    pts = db.scalars(select(models.InstallPoint).where(models.InstallPoint.is_active)).all()
    by_status: dict[str, int] = {"normal": 0, "reported": 0, "waiting": 0, "repairing": 0, "done": 0}
    faulty = 0
    for p in pts:
        s = point_summary(db, p)["current_status"]
        by_status[s] = by_status.get(s, 0) + 1
        if s in ("reported", "waiting", "repairing"):
            faulty += 1
    open_jobs = db.scalar(select(func.count(models.Report.id)).where(
        models.Report.status.in_(("reported", "waiting", "repairing")))) or 0
    month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_cost = db.scalar(select(func.coalesce(func.sum(models.Repair.cost), 0)).where(
        models.Repair.repaired_at >= month_start)) or 0
    cost_by_cat = []
    for code, name in db.query(models.Category.code, models.Category.name_en).all():
        total = db.scalar(select(func.coalesce(func.sum(models.Repair.cost), 0))
                          .join(models.Report, models.Repair.report_id == models.Report.id)
                          .join(models.InstallPoint,
                                models.Report.install_point_id == models.InstallPoint.id)
                          .join(models.Category,
                                models.InstallPoint.category_id == models.Category.id)
                          .where(models.Category.code == code)) or 0
        cost_by_cat.append({"code": code, "name": name, "total": round(float(total), 2)})
    pending = [{"id": r.id, "point_code": r.point.code if r.point else "",
                "symptom": (r.symptom or "")[:80], "status": r.status,
                "reported_at": r.reported_at.isoformat() if r.reported_at else None}
               for r in db.scalars(select(models.Report).where(
                   models.Report.status.in_(("reported", "waiting", "repairing")))
                   .order_by(models.Report.reported_at.desc()).limit(8)).all()]
    recent = [{"id": x.id, "point_code": x.report.point.code if x.report and x.report.point else "",
               "action": (x.action or "")[:80], "cost": x.cost,
               "repaired_at": x.repaired_at.isoformat() if x.repaired_at else None}
              for x in db.scalars(select(models.Repair)
                                  .order_by(models.Repair.repaired_at.desc()).limit(8)).all()]
    return {"faulty_points": faulty, "open_jobs": open_jobs,
            "month_cost": round(float(month_cost), 2), "total_points": len(pts),
            "by_status": by_status, "cost_by_category": cost_by_cat,
            "pending": pending, "recent": recent}
