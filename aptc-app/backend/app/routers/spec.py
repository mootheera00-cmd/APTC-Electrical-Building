"""Routers: suppliers, panels/breakers, sub-units, maintenance logs."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Iterable
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_db, point_summary

router = APIRouter()


def _role(x_user_role: str | None) -> str:
    return (x_user_role or "reporter").lower()


def _need(x_user_role: str | None, *allowed: str):
    if _role(x_user_role) not in allowed:
        raise HTTPException(403, "Forbidden for role: " + _role(x_user_role))


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------- suppliers (10) ----------
def _contact_key(s: models.Supplier) -> tuple[str, str, str, str]:
    return (s.contact_name or "", s.phone or "", s.line_id or "", s.email or "")


def _open_contact(s: models.Supplier) -> models.SupplierContact | None:
    return next((c for c in s.contacts if c.is_current), None)


def _record_contact_change(s: models.Supplier, after: tuple[str, str, str, str],
                           note: str, db: Session) -> bool:
    """Move the supplier's contact fields to `after`, keeping the outgoing person.

    A new history period opens only when the *person* changes (the name). The
    same person with a new phone / LINE / e-mail is edited in place, so the list
    stays a list of people, not of typo fixes. Returns True when history moved.
    """
    before = _contact_key(s)
    after = tuple((x or "").strip() for x in after)
    if before == after:
        return False

    when = _utcnow()
    open_row = _open_contact(s)
    # The person is unchanged when the name is unchanged — even for a legacy
    # contact that has no history row yet (updating a phone number must not
    # invent a "previous person" that never existed).
    same_person = bool(after[0]) and after[0] == before[0]

    if same_person:
        if open_row is not None:
            open_row.phone, open_row.line_id, open_row.email = after[1], after[2], after[3]
            if note:
                open_row.note = note
    else:
        if open_row is not None:
            open_row.is_current = False
            open_row.ended_at = when
        elif any(before):
            # Contact predating the history table: we know only that it ended now.
            db.add(models.SupplierContact(
                supplier_id=s.id, name=before[0], phone=before[1], line_id=before[2],
                email=before[3], started_at=None, ended_at=when, is_current=False))
        db.add(models.SupplierContact(
            supplier_id=s.id, name=after[0], phone=after[1], line_id=after[2],
            email=after[3], note=note or "", started_at=when, is_current=True))

    s.contact_name, s.phone, s.line_id, s.email = after
    return True


def _contact_json(c: models.SupplierContact) -> dict:
    return {
        "id": c.id, "name": c.name, "phone": c.phone, "line_id": c.line_id,
        "email": c.email, "note": c.note, "is_current": c.is_current,
        "started_at": c.started_at.isoformat() if c.started_at else None,
        "ended_at": c.ended_at.isoformat() if c.ended_at else None,
    }


MAX_WORK_TYPES = 8


def _clean_work_types(names: Iterable[str]) -> list[str]:
    """Trim, drop blanks, dedupe case-insensitively, keep the caller's order."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in names:
        v = " ".join((raw or "").split())[:64]
        if not v or v.lower() in seen:
            continue
        seen.add(v.lower())
        out.append(v)
        if len(out) >= MAX_WORK_TYPES:
            break
    return out


def _work_type_names(s: models.Supplier) -> list[str]:
    """Canonical trades. Falls back to the legacy column for un-migrated rows."""
    names = _clean_work_types(w.name for w in s.work_types)
    if names:
        return names
    return _clean_work_types((s.work_type or "").split("/"))


def _set_work_types(s: models.Supplier, names: Iterable[str], db: Session) -> list[str]:
    clean = _clean_work_types(names)
    wanted = {n.lower() for n in clean}
    for row in list(s.work_types):
        if row.name.lower() not in wanted:
            db.delete(row)
    have = {w.name.lower(): w for w in s.work_types}
    for i, name in enumerate(clean):
        row = have.get(name.lower())
        if row is None:
            db.add(models.SupplierWorkType(supplier_id=s.id, name=name, sort_order=i))
        else:
            row.sort_order = i
    s.work_type = " / ".join(clean)  # keep the denormalised summary in step
    return clean


def _requested_work_types(body) -> list[str] | None:
    """New list wins; a legacy single `work_type` is split on `/`."""
    if getattr(body, "work_types", None):
        return list(body.work_types)
    legacy = getattr(body, "work_type", None)
    if legacy is not None:
        return [p for p in legacy.split("/")]
    return None


@router.get("/suppliers")
def list_suppliers(db: Session = Depends(get_db)):
    out = []
    for s in db.scalars(select(models.Supplier).order_by(models.Supplier.company)).all():
        names = _work_type_names(s)
        d = {c: getattr(s, c) for c in ("id", "company", "contact_name",
                                        "phone", "line_id", "email", "notes", "is_active")}
        d["work_type"] = " / ".join(names)
        d["work_types"] = names
        d["repair_count"] = len(s.repairs)
        d["total_cost"] = round(sum(x.cost or 0 for x in s.repairs), 2)
        d["contact_changes"] = sum(1 for c in s.contacts if not c.is_current)
        d["contact_since"] = next(
            (c.started_at.isoformat() for c in s.contacts if c.is_current and c.started_at), None)
        d["past_contacts"] = [c.name for c in s.contacts if not c.is_current and c.name]
        out.append(d)
    return out


@router.post("/suppliers")
def create_supplier(body: schemas.SupplierIn, db: Session = Depends(get_db),
                    x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin")
    s = models.Supplier(**{k: v for k, v in body.model_dump().items()
                           if k not in ("work_types",)})
    db.add(s); db.flush()
    _set_work_types(s, _requested_work_types(body) or [], db)
    if (s.contact_name or "").strip():
        db.add(models.SupplierContact(
            supplier_id=s.id, name=s.contact_name.strip(), phone=s.phone, line_id=s.line_id,
            email=s.email, started_at=_utcnow(), is_current=True))
    db.commit(); db.refresh(s)
    return {"ok": True, "id": s.id}


@router.put("/suppliers/{sid}")
def update_supplier(sid: int, body: schemas.SupplierUpdate, db: Session = Depends(get_db),
                    x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin")
    s = db.get(models.Supplier, sid)
    if not s: raise HTTPException(404, "not found")

    sent = body.model_dump(exclude_unset=True)
    sent.pop("contact_note", None)
    sent.pop("work_type", None)
    sent.pop("work_types", None)
    contact_fields = {"contact_name", "phone", "line_id", "email"}

    contact_logged = False
    if contact_fields & sent.keys():
        current = _contact_key(s)
        after = (
            sent.get("contact_name", current[0]),
            sent.get("phone", current[1]),
            sent.get("line_id", current[2]),
            sent.get("email", current[3]),
        )
        contact_logged = _record_contact_change(s, after, body.contact_note, db)

    for k, v in sent.items():
        if k not in contact_fields:
            setattr(s, k, v)

    wanted = _requested_work_types(body)
    if wanted is not None:
        _set_work_types(s, wanted, db)

    db.commit()
    return {"ok": True, "contact_logged": contact_logged}


@router.post("/suppliers/{sid}/contacts")
def change_supplier_contact(sid: int, body: schemas.SupplierContactIn,
                            db: Session = Depends(get_db),
                            x_user_role: str | None = Header(default=None)):
    """Hand the account to a new person — the outgoing one stays in the history."""
    _need(x_user_role, "admin")
    s = db.get(models.Supplier, sid)
    if not s: raise HTTPException(404, "not found")
    if not body.name.strip():
        raise HTTPException(400, "ต้องระบุชื่อผู้ติดต่อ · contact name is required")
    changed = _record_contact_change(
        s, (body.name, body.phone, body.line_id, body.email), body.note, db)
    db.commit()
    return {"ok": True, "changed": changed}


@router.get("/suppliers/{sid}")
def supplier_detail(sid: int, db: Session = Depends(get_db)):
    s = db.get(models.Supplier, sid)
    if not s: raise HTTPException(404, "not found")
    contacts = [_contact_json(c) for c in s.contacts]
    work_types = _work_type_names(s)
    repairs = sorted(s.repairs, key=lambda x: (x.repaired_at is None, x.repaired_at), reverse=True)
    return {
        "id": s.id, "company": s.company,
        "work_type": " / ".join(work_types), "work_types": work_types,
        "contact_name": s.contact_name, "phone": s.phone, "line_id": s.line_id,
        "email": s.email, "notes": s.notes, "is_active": s.is_active,
        "current_contact": {
            "name": s.contact_name, "phone": s.phone, "line_id": s.line_id,
            "email": s.email,
            "since": next((c.started_at.isoformat() for c in s.contacts
                           if c.is_current and c.started_at), None),
        },
        "contacts": contacts,
        "contact_changes": sum(1 for c in contacts if not c["is_current"]),
        "repairs": [{"id": x.id, "report_id": x.report_id, "action": x.action,
                     "cost": x.cost,
                     "repaired_at": x.repaired_at.isoformat() if x.repaired_at else None,
                     "point_code": x.report.point.code if x.report and x.report.point else ""}
                    for x in repairs],
        "total_cost": round(sum(x.cost or 0 for x in s.repairs), 2),
        "repair_count": len(s.repairs),
    }


# ---------- panels + breakers (4) ----------
@router.get("/panels")
def list_panels(db: Session = Depends(get_db)):
    points = db.scalars(select(models.InstallPoint)).all()
    out = []
    for p in db.scalars(select(models.Panel).order_by(models.Panel.code)).all():
        fed = [q for q in points if (q.spec or {}).get("panel_id") == p.id]
        out.append({"id": p.id, "code": p.code, "room_id": p.room_id,
                    "room_code": p.room.code if p.room else "",
                    "name_en": p.name_en, "main_amps": p.main_amps,
                    "main_breaker": p.main_breaker, "phase": p.phase,
                    "location_note": p.location_note, "notes": p.notes,
                    "is_active": p.is_active, "breaker_count": len(p.breakers),
                    "fed_count": len(fed),
                    "spare_count": sum(1 for b in p.breakers if not (b.circuit_name or b.controls))})
    return out


@router.post("/panels")
def create_panel(body: schemas.PanelIn, db: Session = Depends(get_db),
                 x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin")
    if db.scalar(select(models.Panel).where(models.Panel.code == body.code)):
        raise HTTPException(409, "panel code taken")
    p = models.Panel(**body.model_dump()); db.add(p); db.commit(); db.refresh(p)
    return {"ok": True, "id": p.id}


def _fed_json(q: models.InstallPoint, status_map: dict[int, str] | None = None) -> dict:
    return {"code": q.code, "name_en": q.name_en,
            "room_code": q.room.code if q.room else "",
            "category": q.category.code if q.category else "",
            "status": (status_map or {}).get(q.id, "normal")}


def _breaker_json(b: models.Breaker, fed: list[models.InstallPoint] | None = None,
                  status_map: dict[int, str] | None = None) -> dict:
    return {
        "id": b.id, "panel_id": b.panel_id, "position_no": b.position_no,
        "amps": b.amps, "poles": b.poles, "breaker_type": b.breaker_type,
        "rated_ka": b.rated_ka, "brand_model": b.brand_model,
        "purpose": b.purpose, "circuit_name": b.circuit_name,
        "controls": b.controls, "notes": b.notes,
        "fed_points": [_fed_json(q, status_map) for q in (fed or [])],
    }


def _fed_for(panel_id: int, breaker: models.Breaker,
             points: list[models.InstallPoint]) -> list[models.InstallPoint]:
    """Points whose spec names this board *and* this breaker position."""
    pos = (breaker.position_no or "").strip()
    out = []
    for q in points:
        spec = q.spec or {}
        if spec.get("panel_id") != panel_id:
            continue
        no = str(spec.get("breaker_no") or "").strip()
        if pos and no == pos:
            out.append(q)
    return out


@router.get("/panels/{pid}")
def panel_detail(pid: int, db: Session = Depends(get_db)):
    p = db.get(models.Panel, pid)
    if not p: raise HTTPException(404, "not found")
    points = db.scalars(select(models.InstallPoint)).all()
    fed_all = [q for q in points if (q.spec or {}).get("panel_id") == p.id]
    status_map = {q.id: point_summary(db, q)["current_status"] for q in fed_all}
    used = set()
    breakers = []
    for b in p.breakers:
        fed = _fed_for(p.id, b, points)
        used.update(q.id for q in fed)
        breakers.append(_breaker_json(b, fed, status_map))
    return {
        "id": p.id, "code": p.code, "room_id": p.room_id,
        "room_code": p.room.code if p.room else "", "name_en": p.name_en,
        "main_amps": p.main_amps, "main_breaker": p.main_breaker, "phase": p.phase,
        "location_note": p.location_note, "notes": p.notes, "is_active": p.is_active,
        "breakers": breakers,
        "fed_points": [_fed_json(q, status_map) for q in fed_all],
        # Points wired to this board but not matched to any breaker position —
        # the gaps worth fixing while you're in here.
        "unassigned_points": [{"code": q.code, "room_code": q.room.code if q.room else "",
                               "breaker_no": str((q.spec or {}).get("breaker_no") or ""),
                               "status": status_map.get(q.id, "normal")}
                              for q in fed_all if q.id not in used],
        "total_amps": round(sum(b.amps or 0 for b in p.breakers), 1),
        "spare_count": sum(1 for b in p.breakers if not (b.circuit_name or b.controls)),
    }


@router.put("/panels/{pid}")
def update_panel(pid: int, body: schemas.PanelUpdate, db: Session = Depends(get_db),
                 x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin")
    p = db.get(models.Panel, pid)
    if not p: raise HTTPException(404, "not found")
    sent = body.model_dump(exclude_unset=True)
    if "code" in sent and sent["code"] != p.code:
        if db.scalar(select(models.Panel).where(models.Panel.code == sent["code"])):
            raise HTTPException(409, "panel code taken")
    for k, v in sent.items():
        if v is not None or k in ("main_amps", "room_id"):
            setattr(p, k, v)
    db.commit()
    return {"ok": True}


@router.post("/breakers")
def create_breaker(body: schemas.BreakerIn, db: Session = Depends(get_db),
                   x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    if not db.get(models.Panel, body.panel_id):
        raise HTTPException(404, "panel not found")
    b = models.Breaker(**body.model_dump()); db.add(b); db.commit(); db.refresh(b)
    return {"ok": True, "id": b.id}


@router.put("/breakers/{bid}")
def update_breaker(bid: int, body: schemas.BreakerUpdate, db: Session = Depends(get_db),
                   x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    b = db.get(models.Breaker, bid)
    if not b: raise HTTPException(404, "not found")
    sent = body.model_dump(exclude_unset=True)
    if sent.get("panel_id") and not db.get(models.Panel, sent["panel_id"]):
        raise HTTPException(404, "panel not found")
    for k, v in sent.items():
        if v is not None or k in ("amps", "rated_ka"):
            setattr(b, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/breakers/{bid}")
def delete_breaker(bid: int, db: Session = Depends(get_db),
                   x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin")
    b = db.get(models.Breaker, bid)
    if not b: raise HTTPException(404, "not found")
    db.delete(b); db.commit(); return {"ok": True}


# ---------- sub-units (5, 6) ----------
@router.get("/points/{pid}/subunits")
def list_subunits(pid: int, db: Session = Depends(get_db)):
    return [{"id": u.id, "kind": u.kind, "label": u.label, "detail": u.detail,
             "status": u.status}
            for u in db.scalars(select(models.SubUnit).where(
                models.SubUnit.install_point_id == pid)).all()]


@router.post("/subunits")
def create_subunit(body: schemas.SubUnitIn, db: Session = Depends(get_db),
                   x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    if not db.get(models.InstallPoint, body.install_point_id):
        raise HTTPException(404, "point not found")
    u = models.SubUnit(**body.model_dump()); db.add(u); db.commit(); db.refresh(u)
    return {"ok": True, "id": u.id}


@router.delete("/subunits/{uid}")
def delete_subunit(uid: int, db: Session = Depends(get_db),
                   x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin")
    u = db.get(models.SubUnit, uid)
    if not u: raise HTTPException(404, "not found")
    db.delete(u); db.commit(); return {"ok": True}


# ---------- maintenance logs (6, 7) ----------
@router.get("/maintenance")
def list_maintenance(point_id: int | None = None, kind: str | None = None,
                     db: Session = Depends(get_db)):
    q = select(models.Maintenance).order_by(models.Maintenance.performed_at.desc())
    if point_id: q = q.where(models.Maintenance.install_point_id == point_id)
    if kind: q = q.where(models.Maintenance.kind == kind)
    return [_maintenance_json(m) for m in db.scalars(q.limit(500)).all()]


@router.post("/maintenance")
def create_maintenance(body: schemas.MaintenanceIn, db: Session = Depends(get_db),
                       x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    if not db.get(models.InstallPoint, body.install_point_id):
        raise HTTPException(404, "point not found")
    m = models.Maintenance(install_point_id=body.install_point_id, kind=body.kind,
                           performed_at=body.performed_at or datetime.now(),
                           performer=body.performer, result=body.result,
                           cost=body.cost or 0, note=body.note)
    db.add(m); db.commit(); db.refresh(m)
    return {"ok": True, "id": m.id}


def _maintenance_json(m: models.Maintenance) -> dict:
    return {
        "id": m.id, "install_point_id": m.install_point_id,
        "point_code": m.point.code if m.point else "",
        "point_name": m.point.name_en if m.point else "",
        "room_code": m.point.room.code if m.point and m.point.room else "",
        "category_code": m.point.category.code if m.point and m.point.category else "",
        "kind": m.kind,
        "performed_at": m.performed_at.isoformat() if m.performed_at else None,
        "performer": m.performer, "result": m.result, "cost": m.cost,
        "note": m.note,
    }


@router.get("/maintenance/{mid}")
def maintenance_detail(mid: int, db: Session = Depends(get_db)):
    m = db.get(models.Maintenance, mid)
    if not m: raise HTTPException(404, "not found")
    out = _maintenance_json(m)
    # Other upkeep on the same point, so the sheet answers "what else has this
    # unit had?" without a second trip.
    out["history"] = [_maintenance_json(x) for x in
                      db.scalars(select(models.Maintenance)
                                 .where(models.Maintenance.install_point_id == m.install_point_id,
                                        models.Maintenance.id != m.id)
                                 .order_by(models.Maintenance.performed_at.desc())
                                 .limit(20)).all()]
    return out


@router.put("/maintenance/{mid}")
def update_maintenance(mid: int, body: schemas.MaintenanceUpdate,
                       db: Session = Depends(get_db),
                       x_user_role: str | None = Header(default=None)):
    _need(x_user_role, "admin", "technician")
    m = db.get(models.Maintenance, mid)
    if not m: raise HTTPException(404, "not found")
    sent = body.model_dump(exclude_unset=True)
    if "install_point_id" in sent and not db.get(models.InstallPoint, sent["install_point_id"]):
        raise HTTPException(404, "point not found")
    for k, v in sent.items():
        if v is not None:
            setattr(m, k, v)
    db.commit()
    return {"ok": True}
