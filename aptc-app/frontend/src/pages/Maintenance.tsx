import { useEffect, useMemo, useState } from "react";
import {
  Sparkles, Plus, Inbox, X, SquarePen, Save, Pencil, Search, Filter,
  TriangleAlert, AirVent, FlaskConical, ClipboardCheck, CalendarDays, User, CircleCheck, CircleX,
} from "lucide-react";
import { api, getUser } from "../lib/api";
import { PageHead, Panel as Card, Empty, Notice, Modal } from "../components/ui";

interface Row {
  id: number; install_point_id: number; point_code: string;
  point_name: string; room_code: string; category_code: string;
  kind: string; performed_at: string | null; performer: string;
  result: string; cost: number; note: string;
}
interface Detail extends Row {
  history: Row[];
}

/** What to type in each field — shown as placeholder + hint so staff don't guess. */
const GUIDE = {
  point: { hint: "จุดติดตั้งที่เข้าไปดูแล — เลือกจากรหัสบนแปลน" },
  kind: { hint: "ล้างแอร์ · ทดสอบเซ็นเซอร์ · ตรวจทั่วไป" },
  performer: { ph: "เช่น ช่างสมชาย / NSK team", hint: "ใครเป็นคนทำ (ชื่อช่างหรือทีมผู้รับเหมา)" },
  result: { hint: "pass = ผ่าน · fail = ต้องกลับไปแก้" },
  cost: { ph: "0", hint: "ค่าใช้จ่ายครั้งนี้ (บาท) ไม่มีใส่ 0" },
  note: { ph: "เช่น ล้างคอยล์ + เติมน้ำยา R32", hint: "ทำอะไรไปบ้าง — ละเอียดพอให้ครั้งต่อไปเทียบได้" },
};

const KINDS = [
  { value: "", label: "All", th: "ทั้งหมด" },
  { value: "cleaning", label: "Cleaning", th: "ล้างแอร์" },
  { value: "test", label: "Test", th: "ทดสอบ" },
  { value: "inspection", label: "Inspection", th: "ตรวจ" },
];

const KIND_META: Record<string, { label: string; icon: typeof AirVent; cls: string }> = {
  cleaning: { label: "ล้างแอร์", icon: AirVent, cls: "chip chip-work" },
  test: { label: "ทดสอบ", icon: FlaskConical, cls: "chip chip-accent" },
  inspection: { label: "ตรวจ", icon: ClipboardCheck, cls: "chip chip-idle" },
};

const blankLog = {
  install_point_id: "", kind: "cleaning", performed_at: "", performer: "",
  result: "pass", cost: "0", note: "",
};

/** Date helpers — `iso` for form values ('' when empty), `thDate` for display. */
const iso = (s: string | null) => (s ? s.slice(0, 10) : "");
const thDate = (s: string | null) => {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const thb = (n: number) => `฿${Number(n || 0).toLocaleString()}`;
const kindOf = (k: string) => KIND_META[k] ?? { label: k, icon: Sparkles, cls: "chip" };

export default function Maintenance() {
  const [rows, setRows] = useState<Row[]>([]);
  const [points, setPoints] = useState<{ id: number; code: string; name_en: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState(blankLog);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    install_point_id: "", kind: "cleaning", performed_at: "", performer: "",
    result: "pass", cost: "0", note: "",
  });

  const user = getUser();
  const canEdit = !!user && (user.role === "admin" || user.role === "technician");

  const load = async () => {
    setRows(await api(`/api/maintenance${kind ? `?kind=${kind}` : ""}`));
    setPoints(await api("/api/points"));
  };
  useEffect(() => { load().catch((e) => setErr(String(e))); }, [kind]);

  /** Every write goes through here so a failed request surfaces in the UI. */
  const run = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { setErr(String(e)); }
  };

  const haystack = (r: Row) =>
    [r.point_code, r.point_name, r.room_code, r.performer, r.note, r.kind, r.result, kindOf(r.kind).label]
      .join(" ").toLowerCase();

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => !needle || haystack(r).includes(needle));
  }, [rows, q]);

  const totals = useMemo(() => ({
    count: shown.length,
    cost: shown.reduce((s, r) => s + (r.cost || 0), 0),
    fail: shown.filter((r) => r.result === "fail").length,
  }), [shown]);

  const filtering = q.trim() !== "" || kind !== "";
  const staleApi = rows.length > 0 && rows.every((r) => !("room_code" in r));

  const open = async (id: number, startEditing = false) => {
    try {
      const d = await api<Detail>(`/api/maintenance/${id}`);
      setDetail(d);
      setForm({
        install_point_id: String(d.install_point_id), kind: d.kind,
        performed_at: iso(d.performed_at), performer: d.performer || "",
        result: d.result || "pass", cost: String(d.cost ?? 0), note: d.note || "",
      });
      setEditing(startEditing);
      setErr("");
    } catch (e) { setErr(String(e)); }
  };
  const reopen = async (id: number) => { await open(id, false); await load(); };

  const body = (f: typeof blankLog) => ({
    install_point_id: Number(f.install_point_id), kind: f.kind,
    performed_at: f.performed_at ? `${f.performed_at}T08:00:00` : null,
    performer: f.performer, result: f.result,
    cost: Number(f.cost) || 0, note: f.note,
  });

  const saveNew = () => run(async () => {
    if (!addForm.install_point_id) { setErr("เลือกจุดติดตั้งก่อนบันทึก · pick an install point"); return; }
    await api("/api/maintenance", { method: "POST", body: JSON.stringify(body(addForm)) });
    setErr("");
    setMsg(`บันทึกการดูแล ${addForm.kind} แล้ว · log saved`);
    setAddForm(blankLog);
    setAdding(false);
    await load();
  });

  const saveEdit = () => run(async () => {
    if (!detail) return;
    if (!form.install_point_id) { setErr("เลือกจุดติดตั้งก่อนบันทึก · pick an install point"); return; }
    await api(`/api/maintenance/${detail.id}`, { method: "PUT", body: JSON.stringify(body(form)) });
    setErr("");
    setMsg(`อัปเดตบันทึก #${detail.id} แล้ว · log updated`);
    await reopen(detail.id);
  });

  const kindField = (value: string, onChange: (v: string) => void) => (
    <label className="fld">
      <span>Kind · ประเภทงาน</span>
      <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="cleaning">cleaning · ล้างแอร์</option>
        <option value="test">test · ทดสอบเซ็นเซอร์</option>
        <option value="inspection">inspection · ตรวจทั่วไป</option>
      </select>
      <span className="fld-hint">{GUIDE.kind.hint}</span>
    </label>
  );

  const resultField = (value: string, onChange: (v: string) => void) => (
    <label className="fld">
      <span>Result · ผลการตรวจ</span>
      <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="pass">pass · ผ่าน</option>
        <option value="fail">fail · ไม่ผ่าน</option>
      </select>
      <span className="fld-hint">{GUIDE.result.hint}</span>
    </label>
  );

  const performerField = (value: string, onChange: (v: string) => void) => (
    <label className="fld">
      <span>Performer · ผู้ทำ</span>
      <input className="inp" placeholder={GUIDE.performer.ph} value={value}
        onChange={(e) => onChange(e.target.value)} />
      <span className="fld-hint">{GUIDE.performer.hint}</span>
    </label>
  );

  const costField = (value: string, onChange: (v: string) => void) => (
    <label className="fld">
      <span>Cost (฿) · ค่าใช้จ่าย</span>
      <input type="number" min="0" className="inp" placeholder={GUIDE.cost.ph} value={value}
        onChange={(e) => onChange(e.target.value)} />
      <span className="fld-hint">{GUIDE.cost.hint}</span>
    </label>
  );

  const noteField = (value: string, onChange: (v: string) => void, span?: boolean) => (
    <label className={`fld${span ? " sm:col-span-2" : ""}`}>
      <span>Note · สิ่งที่ทำ</span>
      <input className="inp" placeholder={GUIDE.note.ph} value={value}
        onChange={(e) => onChange(e.target.value)} />
      <span className="fld-hint">{GUIDE.note.hint}</span>
    </label>
  );

  return (
    <div className="space-y-6">
      <PageHead
        icon={Sparkles}
        title="Maintenance"
        sub="ล้างแอร์ / ทดสอบเซ็นเซอร์ ไม่ต้องแจ้งเสียก่อน · คลิกแถวเพื่อดูรายละเอียด แก้ไข และดูประวัติของจุดนั้น"
      >
        <button
          type="button"
          className="switch"
          aria-pressed={editMode}
          disabled={!canEdit}
          title={canEdit ? "เปิดเพื่อแก้ไขข้อมูล" : "เฉพาะ admin / technician · staff only"}
          onClick={() => { setEditMode((v) => !v); if (editMode) setAdding(false); }}
        >
          <span className="switch-track" aria-hidden />
          <Pencil size={14} aria-hidden />
          โหมดแก้ไข
        </button>
        <button
          type="button"
          className={adding ? "btn btn-secondary" : "btn btn-primary"}
          disabled={!canEdit}
          title={canEdit ? "บันทึกการดูแลใหม่" : "เฉพาะ admin / technician · staff only"}
          onClick={() => { setAdding((v) => !v); setErr(""); }}
        >
          {adding
            ? <><X size={14} aria-hidden /> ปิดฟอร์ม</>
            : <><Plus size={14} aria-hidden /> New log · บันทึกการดูแลใหม่</>}
        </button>
      </PageHead>

      {msg && (
        <Notice tone="accent">
          <span className="min-w-0 flex-1">{msg}</span>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setMsg("")} aria-label="Dismiss"><X size={13} /></button>
        </Notice>
      )}
      {err && (
        <Notice tone="danger">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{err}</span>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setErr("")} aria-label="Dismiss"><X size={13} /></button>
        </Notice>
      )}
      {staleApi && (
        <Notice tone="warn">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            เซิร์ฟเวอร์ที่ต่ออยู่ยังเป็นเวอร์ชันเก่า — การดูรายละเอียด/แก้ไขจะยังไม่ทำงาน
            <span className="text-soft"> · กรุณาปิดหน้าต่าง backend แล้วเปิดใหม่ (รัน start.bat อีกครั้ง)</span>
          </span>
        </Notice>
      )}
      {editMode && (
        <Notice>
          <Pencil size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1">
            โหมดแก้ไขเปิดอยู่ — คลิกแถวใดก็ได้เพื่อแก้ไขบันทึกนั้น
            <span className="text-soft"> · Edit mode is on: click a row to edit it</span>
          </span>
        </Notice>
      )}

      {adding && (
        <section className="fieldset">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="card-title">New log · บันทึกการดูแลใหม่</h2>
            <span className="text-xs text-soft">กรอกเท่าที่มี — เว้นว่างได้</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="fld">
              <span>Point · จุดติดตั้ง</span>
              <select className="inp" value={addForm.install_point_id}
                onChange={(e) => setAddForm({ ...addForm, install_point_id: e.target.value })}>
                <option value="">— pick · เลือกจุด —</option>
                {points.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name_en}</option>)}
              </select>
              <span className="fld-hint">{GUIDE.point.hint}</span>
            </label>
            {kindField(addForm.kind, (v) => setAddForm({ ...addForm, kind: v }))}
            <label className="fld">
              <span>Date · วันที่ทำ</span>
              <input type="date" className="inp" value={addForm.performed_at}
                onChange={(e) => setAddForm({ ...addForm, performed_at: e.target.value })} />
              <span className="fld-hint">เว้นว่าง = วันนี้</span>
            </label>
            {performerField(addForm.performer, (v) => setAddForm({ ...addForm, performer: v }))}
            {resultField(addForm.result, (v) => setAddForm({ ...addForm, result: v }))}
            {costField(addForm.cost, (v) => setAddForm({ ...addForm, cost: v }))}
            {noteField(addForm.note, (v) => setAddForm({ ...addForm, note: v }), true)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={saveNew}>
              <Save size={14} aria-hidden /> บันทึก · Save log
            </button>
            <button type="button" className="btn btn-secondary"
              onClick={() => { setAdding(false); setAddForm(blankLog); setErr(""); }}>
              ยกเลิก · Cancel
            </button>
          </div>
        </section>
      )}

      <Card flush>
        <div className="card-head">
          <h2 className="card-title">บันทึกการดูแลทั้งหมด · All maintenance logs</h2>
          <span className="chip chip-mono" title="แสดง / ทั้งหมด">{shown.length} / {rows.length}</span>
          <span className="chip chip-accent" title="ค่าใช้จ่ายรวมของรายการที่แสดง">รวม {thb(totals.cost)}</span>
          {totals.fail > 0 && <span className="chip chip-wait">{totals.fail} ไม่ผ่าน</span>}
          <div className="card-tools">
            <div className="search">
              <Search size={15} className="search-icon" aria-hidden />
              <input className="search-inp" type="search" value={q}
                placeholder="ค้นหา จุด / ห้อง / ผู้ทำ / สิ่งที่ทำ"
                aria-label="Search maintenance logs"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} />
            </div>
          </div>
        </div>

        <div className="tabbar" role="tablist" aria-label="Filter by kind">
          {KINDS.map((k) => (
            <button key={k.value} type="button" role="tab" aria-selected={kind === k.value}
              className={`tab${kind === k.value ? " is-active" : ""}`}
              onClick={() => setKind(k.value)}>
              {k.label} <span className="text-xs opacity-70">{k.th}</span>
            </button>
          ))}
        </div>

        {filtering && (
          <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-2 text-xs text-muted">
            <Filter size={13} className="text-accent" aria-hidden />
            <span>
              กรองอยู่: {kind ? `ประเภท “${kindOf(kind).label}”` : "ทุกประเภท"}
              {q.trim() && <> · คำค้น “{q.trim()}”</>} — พบ <strong className="text-ink">{shown.length}</strong> รายการ
            </span>
            <button type="button" className="btn btn-quiet btn-sm ml-auto"
              onClick={() => { setQ(""); setKind(""); }}>
              <X size={13} aria-hidden /> ล้างตัวกรอง · Clear
            </button>
          </div>
        )}

        <div className="tbl-wrap border-0 shadow-none">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Point</th>
                <th>Kind</th>
                <th>By</th>
                <th>Result</th>
                <th className="text-right">Cost</th>
                <th>Note · สิ่งที่ทำ</th>
                {editMode && <th aria-label="Edit" />}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const k = kindOf(r.kind);
                const KIcon = k.icon;
                return (
                  <tr key={r.id} className="is-clickable" onClick={() => open(r.id, editMode)}>
                    <td className="font-mono text-xs">{thDate(r.performed_at)}</td>
                    <td>
                      <span className="code">{r.point_code}</span>
                      {r.room_code && <span className="block text-xs text-soft">{r.room_code}{r.point_name ? ` · ${r.point_name}` : ""}</span>}
                    </td>
                    <td>
                      <span className={k.cls}>
                        <KIcon size={12} aria-hidden /> {k.label}
                      </span>
                    </td>
                    <td className="text-xs text-muted">{r.performer || "—"}</td>
                    <td>
                      <span className={r.result === "fail" ? "chip chip-wait" : "chip chip-ok"}>{r.result}</span>
                    </td>
                    <td className="num">{thb(r.cost)}</td>
                    <td className="text-xs text-muted">{r.note || "—"}</td>
                    {editMode && (
                      <td className="text-right">
                        <span className="inline-flex text-accent" title="แก้ไข · edit"><SquarePen size={15} aria-hidden /></span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && (
            filtering ? (
              <Empty icon={Search}>
                ไม่พบบันทึกที่ตรงกับเงื่อนไข · no logs match
                <button type="button" className="btn btn-secondary btn-sm mt-1"
                  onClick={() => { setQ(""); setKind(""); }}>
                  ล้างตัวกรอง · Clear filters
                </button>
              </Empty>
            ) : (
              <Empty icon={Inbox}>No maintenance logs yet · ยังไม่มีบันทึกการดูแล</Empty>
            )
          )}
        </div>
      </Card>

      {detail && (
        <Modal onClose={() => setDetail(null)} labelledBy="mt-title" wide>
          <div className="sheet-head">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs text-soft">Log #{detail.id}</p>
              <h2 id="mt-title" className="sheet-title">
                <span className="font-mono">{detail.point_code}</span>
                {detail.point_name && <span className="text-muted"> · {detail.point_name}</span>}
              </h2>
              <p className="sheet-sub">
                {detail.room_code && `${detail.room_code} · `}{kindOf(detail.kind).label} · {thDate(detail.performed_at)}
              </p>
            </div>
            <button type="button" className="btn btn-icon" aria-label="Close" onClick={() => setDetail(null)}><X size={16} /></button>
          </div>

          <div className="stat-strip">
            <div className="stat">
              <p className="stat-value">{thb(detail.cost)}</p>
              <p className="stat-label">ค่าใช้จ่าย · cost</p>
            </div>
            <div className="stat">
              <p className="stat-value">{detail.result}</p>
              <p className="stat-label">ผลการตรวจ · result</p>
            </div>
            <div className="stat">
              <p className="stat-value">{detail.history?.length ?? 0}</p>
              <p className="stat-label">ครั้งก่อนของจุดนี้ · earlier visits</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="label m-0">รายละเอียดบันทึก · Log details</p>
            {canEdit && !editing && (
              <button type="button" className="btn btn-secondary btn-sm ml-auto"
                onClick={() => { setEditing(true); setErr(""); }}>
                <SquarePen size={13} aria-hidden /> แก้ไข · Edit
              </button>
            )}
          </div>

          {!editing ? (
            <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-soft"><CalendarDays size={12} aria-hidden /> วันที่ทำ · Date</dt>
                <dd className="font-mono font-semibold">{thDate(detail.performed_at)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-soft"><User size={12} aria-hidden /> ผู้ทำ · Performer</dt>
                <dd>{detail.performer || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-soft">ประเภทงาน · Kind</dt>
                <dd>{kindOf(detail.kind).label}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-soft">ผล · Result</dt>
                <dd>
                  <span className={detail.result === "fail" ? "chip chip-wait" : "chip chip-ok"}>
                    {detail.result === "fail" ? <CircleX size={12} aria-hidden /> : <CircleCheck size={12} aria-hidden />}
                    {detail.result}
                  </span>
                </dd>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-xs text-soft">สิ่งที่ทำ · Note</dt>
                <dd>{detail.note || "—"}</dd>
              </div>
            </dl>
          ) : (
            <div className="mt-2 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="fld">
                  <span>Point · จุดติดตั้ง</span>
                  <select className="inp" value={form.install_point_id}
                    onChange={(e) => setForm({ ...form, install_point_id: e.target.value })}>
                    {points.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name_en}</option>)}
                  </select>
                  <span className="fld-hint">{GUIDE.point.hint}</span>
                </label>
                {kindField(form.kind, (v) => setForm({ ...form, kind: v }))}
                <label className="fld">
                  <span>Date · วันที่ทำ</span>
                  <input type="date" className="inp" value={form.performed_at}
                    onChange={(e) => setForm({ ...form, performed_at: e.target.value })} />
                  <span className="fld-hint">วันที่เข้าไปดำเนินการ</span>
                </label>
                {performerField(form.performer, (v) => setForm({ ...form, performer: v }))}
                {resultField(form.result, (v) => setForm({ ...form, result: v }))}
                {costField(form.cost, (v) => setForm({ ...form, cost: v }))}
                {noteField(form.note, (v) => setForm({ ...form, note: v }), true)}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={saveEdit}>
                  <Save size={14} aria-hidden /> บันทึก · Save
                </button>
                <button type="button" className="btn btn-secondary"
                  onClick={() => {
                    setEditing(false); setErr("");
                    setForm({
                      install_point_id: String(detail.install_point_id), kind: detail.kind,
                      performed_at: iso(detail.performed_at),
                      performer: detail.performer || "", result: detail.result || "pass",
                      cost: String(detail.cost ?? 0), note: detail.note || "",
                    });
                  }}>
                  ยกเลิก · Cancel
                </button>
              </div>
            </div>
          )}

          <p className="label mt-5">ประวัติของจุดนี้ · Earlier visits ({detail.history?.length ?? 0})</p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {(detail.history ?? []).map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 rounded-input border border-rule px-2.5 py-1.5 text-ink2">
                <span className="font-mono text-soft">{thDate(h.performed_at)}</span>
                <span className={kindOf(h.kind).cls}>{kindOf(h.kind).label}</span>
                <span className="min-w-0 flex-1">{h.note || "—"}</span>
                <span className="text-soft">{h.performer}</span>
                <span className="font-mono">{thb(h.cost)}</span>
              </li>
            ))}
            {(detail.history ?? []).length === 0 && (
              <li className="text-soft">จุดนี้เพิ่งมีบันทึกครั้งแรก · first visit on this point</li>
            )}
          </ul>

          <button type="button" className="btn btn-secondary btn-block mt-4" onClick={() => setDetail(null)}>Close · ปิด</button>
        </Modal>
      )}
    </div>
  );
}
