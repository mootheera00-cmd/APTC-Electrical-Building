"""Shared DB session, settings, auth helper, summary computation."""
from __future__ import annotations
import os
from pathlib import Path
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from .models import Equipment, InstallPoint, Repair, Report

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
for sub in ("plan", "report", "repair", "spec"):
    (UPLOAD_DIR / sub).mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{(BASE_DIR / 'aptc.db').as_posix()}")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def current_user_id() -> int | None:
    return None  # replaced per-request via header in routers


OPEN_STATUSES = ("reported", "waiting", "repairing")

# ---------- Lighting completeness ----------
# A Lighting record is only "complete" when the office could re-buy the same lamp
# and see who recorded what: the spec, a P/O (or why there is none), an attachment
# and at least one logged entry with a recorder.
L_REQUIRED = (
    ("lamp_type", "ประเภทโคม · Lamp type"),
    ("brand", "ยี่ห้อ · Brand"),
    ("model", "รุ่น · Model"),
    ("wattage", "กำลังไฟ · Wattage"),
    ("supplier", "ซื้อที่ไหน · Supplier"),
    ("attachment", "ไฟล์แนบ · Attachment"),
)


def missing_fields(point: InstallPoint, history_count: int) -> list[str]:
    """Labels of what a point still has to fill in — Lighting first, others [].

    `history_count` is repairs + hand-written log entries: either one proves the
    point has somebody recording work against it.
    """
    if not point.category or point.category.code != "L":
        return []
    spec = point.spec or {}
    missing = [label for key, label in L_REQUIRED if not str(spec.get(key) or "").strip()]
    if not str(spec.get("po_no") or "").strip() and not str(spec.get("po_reason") or "").strip():
        missing.append("P/O หรือเหตุผล · P/O or reason")
    if history_count == 0:
        missing.append("ประวัติ/ผู้บันทึก · Timeline entry")
    return missing


def point_summary(db: Session, point: InstallPoint) -> dict:
    eqs = db.scalars(select(Equipment).where(Equipment.install_point_id == point.id)
                     .order_by(Equipment.installed_at)).all()
    first_installed = None
    if eqs:
        dates = [e.installed_at for e in eqs if e.installed_at]
        first_installed = min(dates) if dates else None
    if first_installed is None:
        first_installed = point.installed_at
    replace_count = max(0, len(eqs) - 1)
    rep_rows = (db.query(Repair).join(Report, Repair.report_id == Report.id)
                .filter(Report.install_point_id == point.id).all())
    repair_count = len(rep_rows)
    last_repair_at = max((r.repaired_at for r in rep_rows if r.repaired_at), default=None)
    total_cost = round(sum(r.cost or 0 for r in rep_rows), 2)
    open_rep = (db.query(Report).filter(Report.install_point_id == point.id,
                Report.status.in_(OPEN_STATUSES)).order_by(Report.reported_at.desc()).first())
    status = open_rep.status if open_rep else "normal"
    active_eq = next((e for e in reversed(eqs) if e.status == "active"), None)
    return {
        "first_installed_at": first_installed.isoformat() if first_installed else None,
        "repair_count": repair_count,
        "replace_count": replace_count,
        "last_repair_at": last_repair_at.isoformat() if last_repair_at else None,
        "current_status": status,
        "total_cost": total_cost,
        "active_equipment_id": active_eq.id if active_eq else None,
        "open_report_id": open_rep.id if open_rep else None,
    }


def point_timeline(db: Session, point: InstallPoint) -> list[dict]:
    from .models import Maintenance
    events: list[dict] = []
    for lg in point.logs:
        events.append({"at": lg.happened_at.isoformat() if lg.happened_at else None,
                       "kind": lg.kind, "label": (lg.detail or "")[:80],
                       "ref_id": lg.id, "recorded_by": lg.recorded_by})
    for e in point.equipments:
        events.append({"at": (e.installed_at.isoformat() if e.installed_at else None),
                       "kind": "replace" if e.removed_at else "install",
                       "label": f"Unit {e.brand_model or '#'+str(e.id)} installed"
                                + (" (retired)" if e.removed_at else ""),
                       "ref_id": e.id})
    for m in point.maintenances:
        kind_label = {"cleaning": "Cleaned", "test": "Tested"}.get(m.kind, m.kind.title())
        events.append({"at": m.performed_at.isoformat() if m.performed_at else None,
                       "kind": "maintenance",
                       "label": f"{kind_label}: {(m.note or m.result or '')[:80]}",
                       "ref_id": m.id})
    for r in point.reports:
        events.append({"at": r.reported_at.isoformat() if r.reported_at else None,
                       "kind": "report", "label": f"Reported: {(r.symptom or '')[:80]}",
                       "ref_id": r.id, "status": r.status})
        for rp in r.repairs:
            events.append({"at": rp.repaired_at.isoformat() if rp.repaired_at else None,
                           "kind": "repair",
                           "label": f"Repaired: {(rp.action or '')[:80]} (฿{rp.cost or 0:,.0f})",
                           "ref_id": rp.id})
    events.sort(key=lambda e: (e["at"] or "", e["kind"]))
    return events
