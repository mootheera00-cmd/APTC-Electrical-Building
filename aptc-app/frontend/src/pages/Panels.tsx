import { useEffect, useMemo, useState } from "react";
import {
  PanelTop, Plus, Inbox, X, SquarePen, Save, Pencil, Search, Filter, TriangleAlert,
  Trash, Zap, Gauge, Ruler, Tag, Plug, ArrowLeft, ChevronRight,
} from "lucide-react";
import { api, getUser, STATUS_META } from "../lib/api";
import { PageHead, Panel as Card, Empty, Notice, Modal } from "../components/ui";

interface PanelRow {
  id: number; code: string; room_id: number | null; room_code: string;
  name_en: string; main_amps: number | null; main_breaker: string; phase: string;
  location_note: string; notes: string; is_active: boolean;
  breaker_count: number; fed_count: number; spare_count: number;
}
interface Breaker {
  id: number; panel_id: number; position_no: string; amps: number | null;
  poles: string; breaker_type: string; rated_ka: number | null; brand_model: string;
  purpose: string; circuit_name: string; controls: string; notes: string;
  fed_points: { code: string; name_en: string; room_code: string; category: string; status: string }[];
}
interface PanelDetail extends PanelRow {
  breakers: Breaker[];
  fed_points: { code: string; room_code: string; category: string; status: string }[];
  unassigned_points: { code: string; room_code: string; breaker_no: string; status: string }[];
  total_amps: number;
}

/** What to type in each field — shown as placeholder + hint so staff don't guess. */
const GUIDE = {
  code: { ph: "เช่น MDB-1, LP-2", hint: "รหัสตู้ที่พิมพ์อยู่หน้าตู้ — ต้องไม่ซ้ำกับตู้ที่มีอยู่" },
  name: { ph: "เช่น Main panel LAB zone", hint: "ชื่อเรียกในบ้านเรา เช่น โซนแล็บ / ฝั่งทิศเหนือ" },
  room: { hint: "ห้องที่ติดตั้งตู้จริง" },
  mainAmps: { ph: "เช่น 100", hint: "พิกัดกระแสตัวเมน (A)" },
  mainBreaker: { ph: "เช่น MCCB 100A 3P 25kA", hint: "สเปกตัวเมน: ชนิด + พิกัด + จำนวนขั้ว + kA" },
  phase: { ph: "เช่น 3P 4W 400V", hint: "ระบบไฟของตู้ — 1P 230V หรือ 3P 4W 400V" },
  location: { ph: "เช่น ผนังทางเดินแล็บ", hint: "ตำแหน่งที่หาเจอจริง" },
  notes: { ph: "เช่น ต้องปิดไฟทั้งโซนก่อนทำงาน", hint: "สิ่งที่ช่างควรรู้ก่อนแตะตู้นี้" },
  pos: { ph: "เช่น 1", hint: "เลขช่องในตู้ที่พิมพ์ไว้ — จุดติดตั้งอ้างเลขนี้" },
  amps: { ph: "เช่น 20", hint: "พิกัดกระแสของเบรกเกอร์ตัวนี้ (A)" },
  poles: { ph: "1P · 1P+N · 3P · 4P", hint: "จำนวนขั้ว" },
  btype: { ph: "MCB · MCCB · RCBO · ELCB", hint: "ชนิดของเบรกเกอร์" },
  ka: { ph: "เช่น 6, 10, 25", hint: "ความสามารถตัดกระแสลัดวงจร (kA)" },
  brand: { ph: "เช่น Schneider iC60N", hint: "ยี่ห้อ/รุ่น — ไว้ซื้อเปลี่ยนให้ตรงรุ่น" },
  purpose: { ph: "เช่น แสงสว่าง / ปลั๊กไฟ / แอร์", hint: "ใช้สำหรับอะไร" },
  circuit: { ph: "เช่น Lighting LAB1/LAB2", hint: "ชื่อวงจรตามที่เขียนในตู้" },
  controls: { ph: "เช่น โคมไฟ L-003, L-004 / แอร์ AC-001", hint: "ควบคุมอะไรบ้าง — ใส่รหัสจุดในแปลนได้เลย" },
  bnotes: { ph: "เช่น มีกันไฟรั่ว 30mA", hint: "หมายเหตุของตัวนี้โดยเฉพาะ" },
};

const blankPanel = {
  code: "", name_en: "", room_id: "", main_amps: "", main_breaker: "",
  phase: "", location_note: "", notes: "",
};
const blankBreaker = {
  position_no: "", amps: "", poles: "", breaker_type: "", rated_ka: "",
  brand_model: "", purpose: "", circuit_name: "", controls: "", notes: "",
};

/** Amps + poles + type read as one line: "32A · 3P MCB · 10kA". */
const breakerSpec = (b: Breaker) =>
  [b.amps ? `${b.amps}A` : "", [b.poles, b.breaker_type].filter(Boolean).join(" "),
   b.rated_ka ? `${b.rated_ka}kA` : ""].filter(Boolean).join(" · ");

export default function Panels() {
  const [rows, setRows] = useState<PanelRow[]>([]);
  const [rooms, setRooms] = useState<{ id: number; code: string }[]>([]);
  const [detail, setDetail] = useState<PanelDetail | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState(blankPanel);
  const [q, setQ] = useState("");
  const [editingPanel, setEditingPanel] = useState(false);
  const [pForm, setPForm] = useState(blankPanel);
  const [editingBreaker, setEditingBreaker] = useState<number | "new" | null>(null);
  const [bForm, setBForm] = useState(blankBreaker);
  const [viewBreaker, setViewBreaker] = useState<Breaker | null>(null);

  const user = getUser();
  const isAdmin = user?.role === "admin";
  const canEditBreaker = isAdmin || user?.role === "technician";

  const load = async () => {
    setRows(await api("/api/panels"));
    setRooms(await api("/api/rooms"));
  };
  useEffect(() => { load().catch((e) => setErr(String(e))); }, []);

  /** Every write goes through here so a failed request surfaces in the UI. */
  const run = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { setErr(String(e)); }
  };

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((p) =>
      [p.code, p.name_en, p.room_code, p.main_breaker, p.phase, p.location_note, p.notes]
        .join(" ").toLowerCase().includes(needle));
  }, [rows, q]);

  const staleApi = rows.length > 0 && rows.every((p) => !("main_breaker" in p));

  const open = async (id: number, startEditing = false) => {
    try {
      const d = await api<PanelDetail>(`/api/panels/${id}`);
      setDetail(d);
      setPForm({
        code: d.code, name_en: d.name_en, room_id: d.room_id ? String(d.room_id) : "",
        main_amps: d.main_amps != null ? String(d.main_amps) : "",
        main_breaker: d.main_breaker || "", phase: d.phase || "",
        location_note: d.location_note || "", notes: d.notes || "",
      });
      setEditingPanel(startEditing);
      setEditingBreaker(null);
      setViewBreaker(null);
      setErr("");
    } catch (e) { setErr(String(e)); }
  };
  const reopen = async (id: number) => { await open(id, false); await load(); };

  const panelBody = (f: typeof blankPanel) => ({
    code: f.code.trim(), name_en: f.name_en, room_id: f.room_id ? Number(f.room_id) : null,
    main_amps: f.main_amps ? Number(f.main_amps) : null, main_breaker: f.main_breaker,
    phase: f.phase, location_note: f.location_note, notes: f.notes,
  });

  const saveNewPanel = () => run(async () => {
    if (!addForm.code.trim()) { setErr("กรอกรหัสตู้ก่อนบันทึก · panel code is required"); return; }
    await api("/api/panels", { method: "POST", body: JSON.stringify(panelBody(addForm)) });
    setErr(""); setMsg(`เพิ่มตู้ ${addForm.code} แล้ว · panel added`);
    setAddForm(blankPanel); setAdding(false);
    await load();
  });

  const savePanel = () => run(async () => {
    if (!detail) return;
    if (!pForm.code.trim()) { setErr("กรอกรหัสตู้ก่อนบันทึก · panel code is required"); return; }
    await api(`/api/panels/${detail.id}`, { method: "PUT", body: JSON.stringify(panelBody(pForm)) });
    setErr(""); setMsg(`บันทึกข้อมูลตู้ ${pForm.code} แล้ว · panel updated`);
    await reopen(detail.id);
  });

  const breakerBody = (f: typeof blankBreaker) => ({
    position_no: f.position_no.trim(), amps: f.amps ? Number(f.amps) : null,
    poles: f.poles, breaker_type: f.breaker_type,
    rated_ka: f.rated_ka ? Number(f.rated_ka) : null, brand_model: f.brand_model,
    purpose: f.purpose, circuit_name: f.circuit_name, controls: f.controls, notes: f.notes,
  });

  const saveBreaker = (id: number | "new") => run(async () => {
    if (!detail) return;
    if (id === "new" && !bForm.position_no.trim()) {
      setErr("กรอกเลขช่องในตู้ก่อนบันทึก · breaker position is required"); return;
    }
    if (id === "new") {
      await api("/api/breakers", { method: "POST", body: JSON.stringify({ panel_id: detail.id, ...breakerBody(bForm) }) });
      setMsg(`เพิ่มเบรกเกอร์ช่อง ${bForm.position_no} แล้ว · breaker added`);
    } else {
      await api(`/api/breakers/${id}`, { method: "PUT", body: JSON.stringify(breakerBody(bForm)) });
      setMsg(`อัปเดตเบรกเกอร์ช่อง ${bForm.position_no} แล้ว · breaker updated`);
    }
    setErr(""); setEditingBreaker(null); setBForm(blankBreaker);
    await reopen(detail.id);
  });

  const deleteBreaker = (b: Breaker) => run(async () => {
    if (!detail) return;
    if (!window.confirm(`ลบเบรกเกอร์ช่อง ${b.position_no}? · delete breaker?`)) return;
    await api(`/api/breakers/${b.id}`, { method: "DELETE" });
    setMsg(`ลบเบรกเกอร์ช่อง ${b.position_no} แล้ว · breaker removed`);
    await reopen(detail.id);
  });

  const startEditBreaker = (b: Breaker) => {
    setEditingBreaker(b.id);
    setBForm({
      position_no: b.position_no || "", amps: b.amps != null ? String(b.amps) : "",
      poles: b.poles || "", breaker_type: b.breaker_type || "",
      rated_ka: b.rated_ka != null ? String(b.rated_ka) : "", brand_model: b.brand_model || "",
      purpose: b.purpose || "", circuit_name: b.circuit_name || "",
      controls: b.controls || "", notes: b.notes || "",
    });
    setErr("");
  };

  const statusDot = (s: string) => STATUS_META[s]?.dot ?? "bg-idle";
  const statusLabel = (s: string) => STATUS_META[s]?.label ?? s;

  /* Small helpers so the panel/breaker forms read the same. */
  const text = (label: string, hint: string, ph: string, value: string,
                onChange: (v: string) => void, span?: boolean) => (
    <label className={`fld${span ? " sm:col-span-2" : ""}`}>
      <span>{label}</span>
      <input className="inp" placeholder={ph} value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="fld-hint">{hint}</span>
    </label>
  );

  const breakerForm = (which: number | "new") => (
    <div className="grid gap-3 rounded-control border border-accentsoft bg-accenttint p-3 sm:grid-cols-2">
      <p className="font-display text-sm font-bold sm:col-span-2">
        {which === "new" ? "เพิ่มเบรกเกอร์ · Add breaker" : `แก้ไขเบรกเกอร์ช่อง ${bForm.position_no} · Edit breaker`}
      </p>
      <div className="grid gap-3 sm:col-span-2 sm:grid-cols-4">
        {text("ช่อง · Pos", GUIDE.pos.hint, GUIDE.pos.ph, bForm.position_no, (v) => setBForm({ ...bForm, position_no: v }))}
        {text("กระแส · Amps", GUIDE.amps.hint, GUIDE.amps.ph, bForm.amps, (v) => setBForm({ ...bForm, amps: v }))}
        {text("ขั้ว · Poles", GUIDE.poles.hint, GUIDE.poles.ph, bForm.poles, (v) => setBForm({ ...bForm, poles: v }))}
        {text("ชนิด · Type", GUIDE.btype.hint, GUIDE.btype.ph, bForm.breaker_type, (v) => setBForm({ ...bForm, breaker_type: v }))}
      </div>
      <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
        {text("kA", GUIDE.ka.hint, GUIDE.ka.ph, bForm.rated_ka, (v) => setBForm({ ...bForm, rated_ka: v }))}
        {text("ยี่ห้อ/รุ่น · Brand", GUIDE.brand.hint, GUIDE.brand.ph, bForm.brand_model, (v) => setBForm({ ...bForm, brand_model: v }))}
        {text("ใช้สำหรับ · Purpose", GUIDE.purpose.hint, GUIDE.purpose.ph, bForm.purpose, (v) => setBForm({ ...bForm, purpose: v }))}
        {text("ชื่อวงจร · Circuit", GUIDE.circuit.hint, GUIDE.circuit.ph, bForm.circuit_name, (v) => setBForm({ ...bForm, circuit_name: v }))}
      </div>
      <div className="grid gap-3 sm:col-span-2">
        {text("ควบคุมอะไร · Controls", GUIDE.controls.hint, GUIDE.controls.ph, bForm.controls, (v) => setBForm({ ...bForm, controls: v }), true)}
        {text("หมายเหตุ · Notes", GUIDE.bnotes.hint, GUIDE.bnotes.ph, bForm.notes, (v) => setBForm({ ...bForm, notes: v }), true)}
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => saveBreaker(which)}>
          <Save size={13} aria-hidden /> บันทึก · Save
        </button>
        <button type="button" className="btn btn-secondary btn-sm"
          onClick={() => { setEditingBreaker(null); setBForm(blankBreaker); setErr(""); }}>
          ยกเลิก · Cancel
        </button>
      </div>
    </div>
  );

  /* Clicking a breaker row opens its full record — every field labelled,
     with the plan points it actually feeds. */
  const breakerView = viewBreaker && detail ? (
    <>
      <div className="sheet-head">
        <button type="button" className="btn btn-icon" aria-label="Back to panel"
          title="กลับไปที่ตู้ · back to panel" onClick={() => setViewBreaker(null)}>
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-soft">{detail.code} · เบรกเกอร์ช่อง {viewBreaker.position_no || "—"}</p>
          <h2 className="sheet-title">
            {viewBreaker.purpose || viewBreaker.circuit_name || `Way ${viewBreaker.position_no}`}
          </h2>
          <p className="sheet-sub font-mono">{breakerSpec(viewBreaker) || "ไม่ระบุสเปก"}</p>
        </div>
        <button type="button" className="btn btn-icon" aria-label="Close" onClick={() => setDetail(null)}><X size={16} /></button>
      </div>

      <div className="stat-strip">
        <div className="stat">
          <p className="stat-value">{viewBreaker.amps ? `${viewBreaker.amps} A` : "—"}</p>
          <p className="stat-label">พิกัดกระแส · rated</p>
        </div>
        <div className="stat">
          <p className="stat-value">{viewBreaker.poles || "—"}</p>
          <p className="stat-label">จำนวนขั้ว · poles</p>
        </div>
        <div className="stat">
          <p className="stat-value">{viewBreaker.breaker_type || "—"}</p>
          <p className="stat-label">ชนิด · type</p>
        </div>
        <div className="stat">
          <p className="stat-value">{viewBreaker.rated_ka ? `${viewBreaker.rated_ka} kA` : "—"}</p>
          <p className="stat-label">ตัดลัดวงจร · breaking</p>
        </div>
      </div>

      {canEditBreaker && editingBreaker !== viewBreaker.id && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="label m-0">แก้ไข · Actions</p>
          <span className="ml-auto flex gap-2">
            <button type="button" className="btn btn-secondary btn-sm"
              onClick={() => startEditBreaker(viewBreaker)}>
              <SquarePen size={13} aria-hidden /> แก้ไข · Edit
            </button>
            {isAdmin && (
              <button type="button" className="btn btn-secondary btn-sm"
                onClick={() => deleteBreaker(viewBreaker)}>
                <Trash size={13} aria-hidden /> ลบ · Delete
              </button>
            )}
          </span>
        </div>
      )}

      {editingBreaker === viewBreaker.id && <div className="mt-3">{breakerForm(viewBreaker.id)}</div>}

      <p className="label mt-5">รายละเอียด · Details</p>
      <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="flex items-center gap-1 text-xs text-soft"><Ruler size={12} aria-hidden /> ช่องในตู้ · Position</dt>
          <dd className="font-mono font-semibold">{viewBreaker.position_no || "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-1 text-xs text-soft"><Tag size={12} aria-hidden /> ยี่ห้อ/รุ่น · Brand model</dt>
          <dd>{viewBreaker.brand_model || "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-1 text-xs text-soft"><Zap size={12} aria-hidden /> ใช้สำหรับ · Purpose</dt>
          <dd>{viewBreaker.purpose || "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-1 text-xs text-soft"><Plug size={12} aria-hidden /> ชื่อวงจร · Circuit</dt>
          <dd>{viewBreaker.circuit_name || "—"}</dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-xs text-soft">ควบคุมอะไร · Controls</dt>
          <dd>{viewBreaker.controls || "—"}</dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-xs text-soft">หมายเหตุ · Notes</dt>
          <dd>{viewBreaker.notes || "—"}</dd>
        </div>
      </dl>

      <p className="label mt-5">
        จุดที่ช่องนี้จ่ายไฟ · Points on this way ({viewBreaker.fed_points.length})
      </p>
      {viewBreaker.fed_points.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-xs">
          {viewBreaker.fed_points.map((p) => (
            <li key={p.code} className="flex flex-wrap items-baseline gap-x-2 rounded-input border border-rule px-2.5 py-1.5">
              <span className="font-mono font-semibold">{p.code}</span>
              <span className="min-w-0 flex-1 text-muted">{p.name_en}{p.room_code && ` · ${p.room_code}`}</span>
              <span className="chip chip-mono">{p.category}</span>
              <span className={`chip ${p.status === "normal" ? "chip-ok" : p.status === "done" ? "chip-idle" : "chip-wait"}`}>
                <span className={`h-2 w-2 rounded-full ${statusDot(p.status)}`} aria-hidden />
                {statusLabel(p.status)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 rounded-control border border-dashed border-rulestrong px-3 py-3 text-xs text-soft">
          ยังไม่มีจุดไหนผูกกับช่องนี้ · nothing wired to this way yet
        </p>
      )}

      <button type="button" className="btn btn-secondary btn-block mt-4" onClick={() => setViewBreaker(null)}>
        <ArrowLeft size={14} aria-hidden /> กลับไปที่ตู้ {detail.code}
      </button>
    </>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHead
        icon={PanelTop}
        title="Main Panels"
        sub="ตู้ไฟ · เบรกเกอร์ย่อย · วงจรที่จ่าย — คลิกแถวเพื่อดูสเปกแต่ละตัวและแก้ไข"
      >
        <button
          type="button"
          className="switch"
          aria-pressed={editMode}
          disabled={!canEditBreaker}
          title={canEditBreaker ? "เปิดเพื่อแก้ไขข้อมูล" : "เฉพาะ admin / technician · staff only"}
          onClick={() => { setEditMode((v) => !v); if (editMode) setAdding(false); }}
        >
          <span className="switch-track" aria-hidden />
          <Pencil size={14} aria-hidden />
          โหมดแก้ไข
        </button>
        <button
          type="button"
          className={adding ? "btn btn-secondary" : "btn btn-primary"}
          disabled={!isAdmin}
          title={isAdmin ? "เพิ่มตู้ไฟใหม่" : "เฉพาะ admin เท่านั้น · admin only"}
          onClick={() => { setAdding((v) => !v); setErr(""); }}
        >
          {adding
            ? <><X size={14} aria-hidden /> ปิดฟอร์ม</>
            : <><Plus size={14} aria-hidden /> Add panel · เพิ่มตู้ไฟ</>}
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
            เซิร์ฟเวอร์ที่ต่ออยู่ยังเป็นเวอร์ชันเก่า — สเปกเบรกเกอร์/การแก้ไขจะยังไม่ทำงาน
            <span className="text-soft"> · กรุณาปิดหน้าต่าง backend แล้วเปิดใหม่ (รัน start.bat อีกครั้ง)</span>
          </span>
        </Notice>
      )}
      {editMode && (
        <Notice>
          <Pencil size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1">
            โหมดแก้ไขเปิดอยู่ — คลิกแถวใดก็ได้เพื่อแก้ไขตู้และเบรกเกอร์ในตู้นั้น
            <span className="text-soft"> · Edit mode is on: click a row to edit it</span>
          </span>
        </Notice>
      )}

      {adding && (
        <section className="fieldset">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="card-title">Add panel · เพิ่มตู้ไฟ</h2>
            <span className="text-xs text-soft">กรอกเท่าที่มี — เว้นว่างได้</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {text("Code · รหัสตู้", GUIDE.code.hint, GUIDE.code.ph, addForm.code, (v) => setAddForm({ ...addForm, code: v }))}
            {text("Name · ชื่อตู้", GUIDE.name.hint, GUIDE.name.ph, addForm.name_en, (v) => setAddForm({ ...addForm, name_en: v }))}
            <label className="fld">
              <span>Room · ห้อง</span>
              <select className="inp" value={addForm.room_id} onChange={(e) => setAddForm({ ...addForm, room_id: e.target.value })}>
                <option value="">— ยังไม่ระบุ —</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
              </select>
              <span className="fld-hint">{GUIDE.room.hint}</span>
            </label>
            {text("Main (A) · พิกัดเมน", GUIDE.mainAmps.hint, GUIDE.mainAmps.ph, addForm.main_amps, (v) => setAddForm({ ...addForm, main_amps: v }))}
            {text("Main breaker · สเปกตัวเมน", GUIDE.mainBreaker.hint, GUIDE.mainBreaker.ph, addForm.main_breaker, (v) => setAddForm({ ...addForm, main_breaker: v }))}
            {text("Phase · ระบบไฟ", GUIDE.phase.hint, GUIDE.phase.ph, addForm.phase, (v) => setAddForm({ ...addForm, phase: v }))}
            {text("Location · ตำแหน่ง", GUIDE.location.hint, GUIDE.location.ph, addForm.location_note, (v) => setAddForm({ ...addForm, location_note: v }), true)}
            {text("Notes · หมายเหตุ", GUIDE.notes.hint, GUIDE.notes.ph, addForm.notes, (v) => setAddForm({ ...addForm, notes: v }), true)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={saveNewPanel}>
              <Save size={14} aria-hidden /> บันทึก · Save panel
            </button>
            <button type="button" className="btn btn-secondary"
              onClick={() => { setAdding(false); setAddForm(blankPanel); setErr(""); }}>
              ยกเลิก · Cancel
            </button>
          </div>
        </section>
      )}

      <Card flush>
        <div className="card-head">
          <h2 className="card-title">ตู้ไฟทั้งหมด · All panels</h2>
          <span className="chip chip-mono" title="แสดง / ทั้งหมด">{shown.length} / {rows.length}</span>
          <div className="card-tools">
            <div className="search">
              <Search size={15} className="search-icon" aria-hidden />
              <input className="search-inp" type="search" value={q}
                placeholder="ค้นหา รหัสตู้ / ชื่อ / ห้อง / สเปก"
                aria-label="Search panels"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} />
            </div>
          </div>
        </div>

        {q.trim() && (
          <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-2 text-xs text-muted">
            <Filter size={13} className="text-accent" aria-hidden />
            <span>คำค้น “{q.trim()}” — พบ <strong className="text-ink">{shown.length}</strong> ตู้</span>
            <button type="button" className="btn btn-quiet btn-sm ml-auto" onClick={() => setQ("")}>
              <X size={13} aria-hidden /> ล้าง · Clear
            </button>
          </div>
        )}

        <div className="tbl-wrap border-0 shadow-none">
          <table className="tbl">
            <thead>
              <tr>
                <th>Code</th>
                <th>ชื่อตู้ · Name</th>
                <th>Room</th>
                <th className="text-right">Main</th>
                <th>Main breaker · Phase</th>
                <th className="text-right">Breakers</th>
                <th className="text-right">วงจรที่จ่าย</th>
                {editMode && <th aria-label="Edit" />}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="is-clickable" onClick={() => open(p.id, editMode)}>
                  <td className="code">{p.code}</td>
                  <td>
                    <span className="font-semibold">{p.name_en || "—"}</span>
                    {p.location_note && <span className="block text-xs text-soft">{p.location_note}</span>}
                  </td>
                  <td className="text-xs text-muted">{p.room_code || "—"}</td>
                  <td className="num">{p.main_amps ? `${p.main_amps} A` : "—"}</td>
                  <td className="text-xs text-muted">
                    {p.main_breaker || "—"}
                    {p.phase && <span className="block font-mono text-[11px] text-soft">{p.phase}</span>}
                  </td>
                  <td className="num">
                    {p.breaker_count}
                    {p.spare_count > 0 && (
                      <span className="ml-1.5 chip chip-idle" title="ช่องที่ยังไม่ระบุการใช้งาน">
                        ว่าง {p.spare_count}
                      </span>
                    )}
                  </td>
                  <td className="num">{p.fed_count}</td>
                  {editMode && (
                    <td className="text-right">
                      <span className="inline-flex text-accent" title="แก้ไข · edit"><SquarePen size={15} aria-hidden /></span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && (
            q.trim()
              ? <Empty icon={Search}>ไม่พบตู้ที่ตรงกับคำค้น · no panels match</Empty>
              : <Empty icon={Inbox}>No panels yet · ยังไม่มีตู้ไฟ</Empty>
          )}
        </div>
      </Card>

      {detail && (
        <Modal onClose={() => setDetail(null)} labelledBy="pn-title" wide>
          {breakerView ?? (<>
          <div className="sheet-head">
            <div className="min-w-0 flex-1">
              <h2 id="pn-title" className="sheet-title font-mono">{detail.code}</h2>
              <p className="sheet-sub">
                {detail.name_en || "ไม่ระบุชื่อตู้"}
                {detail.room_code && ` · ${detail.room_code}`}
                {detail.location_note && ` · ${detail.location_note}`}
              </p>
            </div>
            <button type="button" className="btn btn-icon" aria-label="Close" onClick={() => setDetail(null)}><X size={16} /></button>
          </div>

          <div className="stat-strip">
            <div className="stat">
              <p className="stat-value">{detail.main_amps ? `${detail.main_amps} A` : "—"}</p>
              <p className="stat-label">พิกัดตัวเมน · main</p>
            </div>
            <div className="stat">
              <p className="stat-value">{detail.breakers.length}</p>
              <p className="stat-label">เบรกเกอร์ · breakers</p>
            </div>
            <div className="stat">
              <p className="stat-value">{detail.fed_points.length}</p>
              <p className="stat-label">วงจรที่จ่าย · fed points</p>
            </div>
            <div className="stat">
              <p className="stat-value">{detail.spare_count}</p>
              <p className="stat-label">ช่องว่าง · spare</p>
            </div>
          </div>

          {detail.unassigned_points.length > 0 && (
            <Notice tone="warn">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                มีจุดที่ต่อจากตู้นี้แต่ยังไม่ระบุช่องเบรกเกอร์:{" "}
                {detail.unassigned_points.map((p) => p.code).join(", ")}
                <span className="text-soft"> · ผูกให้ครบเพื่อให้รู้ว่าช่องไหนคุมอะไร</span>
              </span>
            </Notice>
          )}

          {/* ── Panel spec ──────────────────────────────────────── */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="label m-0">ข้อมูลตู้ · Panel</p>
            {isAdmin && !editingPanel && (
              <button type="button" className="btn btn-secondary btn-sm ml-auto"
                onClick={() => { setEditingPanel(true); setErr(""); }}>
                <SquarePen size={13} aria-hidden /> แก้ไข · Edit
              </button>
            )}
          </div>

          {!editingPanel ? (
            <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-soft"><Gauge size={12} aria-hidden /> สเปกตัวเมน · Main breaker</dt>
                <dd className="font-mono">{detail.main_breaker || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-soft"><Zap size={12} aria-hidden /> ระบบไฟ · Phase</dt>
                <dd className="font-mono">{detail.phase || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-soft"><Ruler size={12} aria-hidden /> ตำแหน่ง · Location</dt>
                <dd>{detail.location_note || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-soft"><Tag size={12} aria-hidden /> รวมพิกัดเบรกเกอร์</dt>
                <dd className="font-mono">{detail.total_amps} A</dd>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-xs text-soft">หมายเหตุ · Notes</dt>
                <dd>{detail.notes || "—"}</dd>
              </div>
            </dl>
          ) : (
            <div className="mt-2 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {text("Code · รหัสตู้", GUIDE.code.hint, GUIDE.code.ph, pForm.code, (v) => setPForm({ ...pForm, code: v }))}
                {text("Name · ชื่อตู้", GUIDE.name.hint, GUIDE.name.ph, pForm.name_en, (v) => setPForm({ ...pForm, name_en: v }))}
                <label className="fld">
                  <span>Room · ห้อง</span>
                  <select className="inp" value={pForm.room_id} onChange={(e) => setPForm({ ...pForm, room_id: e.target.value })}>
                    <option value="">— ยังไม่ระบุ —</option>
                    {rooms.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
                  </select>
                  <span className="fld-hint">{GUIDE.room.hint}</span>
                </label>
                {text("Main (A) · พิกัดเมน", GUIDE.mainAmps.hint, GUIDE.mainAmps.ph, pForm.main_amps, (v) => setPForm({ ...pForm, main_amps: v }))}
                {text("Main breaker · สเปกตัวเมน", GUIDE.mainBreaker.hint, GUIDE.mainBreaker.ph, pForm.main_breaker, (v) => setPForm({ ...pForm, main_breaker: v }))}
                {text("Phase · ระบบไฟ", GUIDE.phase.hint, GUIDE.phase.ph, pForm.phase, (v) => setPForm({ ...pForm, phase: v }))}
                {text("Location · ตำแหน่ง", GUIDE.location.hint, GUIDE.location.ph, pForm.location_note, (v) => setPForm({ ...pForm, location_note: v }), true)}
                {text("Notes · หมายเหตุ", GUIDE.notes.hint, GUIDE.notes.ph, pForm.notes, (v) => setPForm({ ...pForm, notes: v }), true)}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={savePanel}>
                  <Save size={14} aria-hidden /> บันทึก · Save
                </button>
                <button type="button" className="btn btn-secondary"
                  onClick={() => {
                    setEditingPanel(false); setErr("");
                    setPForm({
                      code: detail.code, name_en: detail.name_en,
                      room_id: detail.room_id ? String(detail.room_id) : "",
                      main_amps: detail.main_amps != null ? String(detail.main_amps) : "",
                      main_breaker: detail.main_breaker || "", phase: detail.phase || "",
                      location_note: detail.location_note || "", notes: detail.notes || "",
                    });
                  }}>
                  ยกเลิก · Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Breakers ────────────────────────────────────────── */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <p className="label m-0">เบรกเกอร์ในตู้ · Breakers ({detail.breakers.length})</p>
            {canEditBreaker && editingBreaker !== "new" && (
              <button type="button" className="btn btn-secondary btn-sm ml-auto"
                onClick={() => { setEditingBreaker("new"); setBForm(blankBreaker); setErr(""); }}>
                <Plus size={13} aria-hidden /> เพิ่มเบรกเกอร์ · Add breaker
              </button>
            )}
          </div>

          {editingBreaker === "new" && <div className="mt-2">{breakerForm("new")}</div>}

          <ul className="mt-2 space-y-2">
            {detail.breakers.map((b) => (
              <li key={b.id} className={`rounded-control border ${viewBreaker?.id === b.id ? "border-accentsoft" : "border-rule"}`}>
                {editingBreaker === b.id ? breakerForm(b.id) : (
                  <div className="flex items-start gap-2 p-2">
                    <button type="button"
                      className="min-w-0 flex-1 rounded-input px-1 py-1 text-left transition-colors duration-fast ease-out hover:bg-accenttint"
                      title="ดูรายละเอียดช่องนี้ · open this way"
                      onClick={() => { setViewBreaker(b); setEditingBreaker(null); setErr(""); }}>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="chip chip-accent chip-mono">ช่อง {b.position_no || "—"}</span>
                        <span className="font-mono text-sm font-semibold">{breakerSpec(b) || "—"}</span>
                        {b.purpose && <span className="chip">{b.purpose}</span>}
                        {!b.circuit_name && !b.controls && <span className="chip chip-idle">ว่าง · spare</span>}
                        <ChevronRight size={14} className="ml-auto shrink-0 text-soft" aria-hidden />
                      </span>
                      <span className="mt-1 grid gap-1 text-xs text-muted">
                        {b.brand_model && <span>รุ่น · {b.brand_model}</span>}
                        {b.circuit_name && <span>วงจร · {b.circuit_name}</span>}
                        {b.controls && <span>ควบคุม · {b.controls}</span>}
                        {b.notes && <span className="text-soft">หมายเหตุ · {b.notes}</span>}
                      </span>
                      {b.fed_points.length > 0 && (
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Plug size={12} className="text-soft" aria-hidden />
                          {b.fed_points.map((p) => (
                            <span key={p.code} className="chip" title={`${p.name_en} · ${p.room_code} · ${statusLabel(p.status)}`}>
                              <span className={`h-2 w-2 rounded-full ${statusDot(p.status)}`} aria-hidden />
                              <span className="font-mono">{p.code}</span>
                            </span>
                          ))}
                        </span>
                      )}
                    </button>
                    {canEditBreaker && (
                      <span className="flex shrink-0 gap-1">
                        <button type="button" className="btn btn-quiet btn-sm"
                          onClick={() => startEditBreaker(b)} title="แก้ไข · edit">
                          <SquarePen size={13} aria-hidden />
                        </button>
                        {isAdmin && (
                          <button type="button" className="btn btn-quiet btn-sm"
                            onClick={() => deleteBreaker(b)} title="ลบ · delete">
                            <Trash size={13} aria-hidden />
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
            {detail.breakers.length === 0 && (
              <li className="text-xs text-soft">ยังไม่มีเบรกเกอร์ในตู้ · no breakers recorded</li>
            )}
          </ul>

          <p className="label mt-5">จุดที่ตู้นี้จ่ายไฟ · Fed points ({detail.fed_points.length})</p>
          <p className="mt-2 flex flex-wrap gap-1.5">
            {detail.fed_points.map((p) => (
              <span key={p.code} className="chip chip-mono" title={`${p.room_code} · ${statusLabel(p.status)}`}>{p.code}</span>
            ))}
            {detail.fed_points.length === 0 && <span className="text-xs text-soft">ยังไม่มีจุดที่ผูกกับตู้นี้</span>}
          </p>

          <button type="button" className="btn btn-secondary btn-block mt-4" onClick={() => setDetail(null)}>Close · ปิด</button>
          </>)}
        </Modal>
      )}
    </div>
  );
}
