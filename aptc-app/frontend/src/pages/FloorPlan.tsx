import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Lightbulb, Plug, AirVent, ToggleLeft, PanelTop, Droplets, Flame, Fan, Search, Plus, X,
  FireExtinguisher, Flashlight, DoorOpen, CircleHelp,
  Map as MapIcon, SquarePen, Save, Trash, Pencil, TriangleAlert, MousePointerClick,
  Gauge, ListChecks, Boxes, Sparkles, ClipboardList, CalendarDays, Info, Crosshair,
  Paperclip,
} from "lucide-react";
import { api, getUser, img, upload, STATUS_META, WORK_TYPES } from "../lib/api";
import { PageHead, Panel as Card, Notice, Empty, Modal } from "../components/ui";
import ReportFault from "../components/ReportFault";

interface Pt {
  id: number; code: string; room_id: number; category_id: number; name_en: string;
  x_pct: number; y_pct: number; notes: string; installed_at: string | null;
  room_code: string; room_name: string;
  category_code: string; category_name: string; spec: Record<string, unknown>;
  /** ประเภทงานของหมวดจุดนี้ (electrical|building|other) — ใช้เติมให้ใบแจ้งเสีย */
  work_type?: string;
  /** Hand-written timeline entries recorded for this point. */
  log_count: number;
  /** Labels of what is still missing (Lighting only — [] for other categories). */
  missing: string[];
  summary: {
    current_status: string; repair_count: number; replace_count: number;
    first_installed_at: string | null; last_repair_at: string | null; total_cost: number;
  };
}
interface PointLog {
  id: number; kind: string; happened_at: string | null; detail: string; recorded_by: string;
}
/** One record exactly as the Repair Records screen holds it. */
interface RepairRow {
  id: number; report_id: number; action: string; cost: number;
  repaired_at: string | null; attachment: string; note: string;
  technician_name: string; supplier_name: string;
  report_status: string; report_symptom: string; report_reported_at: string | null;
}
interface Detail extends Pt {
  timeline: { at: string | null; kind: string; label: string; ref_id: number; status?: string }[];
  logs: PointLog[];
  repairs: RepairRow[];
  equipments: { id: number; serial_no: string; brand_model: string; installed_at: string | null;
    removed_at: string | null; status: string; notes: string }[];
  sub_units: { id: number; kind: string; label: string; detail: string; status: string }[];
  maintenances: { id: number; kind: string; performed_at: string | null; performer: string;
    result: string; cost: number; note: string }[];
  controls: { code: string; name: string }[];
}

const CAT_ICON: Record<string, typeof Plug> = {
  L: Lightbulb, P: Plug, AC: AirVent, SW: ToggleLeft, MDB: PanelTop,
  W: Droplets, SEN: Flame, FAN: Fan,
  FE: FireExtinguisher, EL: Flashlight, EX: DoorOpen, OT: CircleHelp,
};

/** Silhouette per category, so a category is recognisable from its shape alone. */
const CAT_SHAPE: Record<string, string> = {
  L: "rect",      // Lighting → สี่เหลี่ยมผืนผ้าแนวตั้ง
  AC: "square",   // Air Conditioner → สี่เหลี่ยมจัตุรัส
  SEN: "circle",  // Heat/Smoke Sensor → วงกลม
  FAN: "hex",     // Exhaust Fan → หกเหลี่ยม
};
/** Shell = the outline of the marker; body = the inner box holding the icon + code. */
const SHAPE_SHELL: Record<string, string> = {
  tag: "rounded-pill border-2",
  rect: "rounded-tag border-2",
  square: "rounded-tag border-2",
  circle: "rounded-pill border-2",
  hex: "marker-hex p-[2px]",
};
/** Content direction: "h" = icon beside the code, "v" = icon above it.
    Each point can override its category default via spec.marker_layout. */
const LAYOUT = { h: "items-center gap-1 py-0.5 pl-1 pr-2", v: "flex-col items-center justify-center gap-0 px-1 py-1" };
/** Shapes whose default direction is stacked. */
const STACKED_SHAPES = ["rect", "square", "circle"];
/** Geometry a shape prefers for a given direction — falls back to LAYOUT. */
const SHAPE_BODY: Record<string, Record<string, string>> = {
  rect: { v: "flex-col items-center justify-center gap-0 px-1 py-3" },
  square: { v: "flex-col items-center justify-center gap-0 px-1 py-1.5" },
  circle: { v: "flex-col items-center justify-center gap-0 aspect-square px-1" },
  hex: { h: "items-center gap-1 px-1.5 py-1", v: "flex-col items-center justify-center gap-0 px-1.5 py-2" },
};
/** Background + silhouette a shape needs on its content box. */
const SHAPE_INK: Record<string, string> = { hex: "marker-hex bg-surface" };
/** Code size per shape + direction — a stacked marker tightens up unless tuned wider. */
const SHAPE_CODE: Record<string, Record<string, string>> = {
  rect: { v: "text-[9px]" }, square: { v: "text-[11px]" },
  circle: { v: "text-[11px]" }, hex: { h: "text-[11px]" },
};
const CODE_SIZE: Record<string, string> = { h: "text-[11px]", v: "text-[9px]" };
const SHAPE_BADGE: Record<string, string> = {
  tag: "rounded-pill", rect: "rounded-tag", square: "rounded-tag",
  circle: "rounded-full", hex: "rounded-tag",
};
/** Options for the per-point marker direction (spec.marker_layout). */
const LAYOUT_OPTIONS = [
  { id: "", th: "ตามหมวด · Auto" },
  { id: "h", th: "แนวนอน · Horizontal" },
  { id: "v", th: "แนวตั้ง · Vertical" },
];
/** Lighting spec — the printed record the office needs to re-buy the same lamp. */
const LAMP_TYPES = ["โคมไฟพาแนลไลท์ · LED panel", "โคมดาวน์ไลท์ · Downlight", "หลอดไฟทั่วไป · Tube / bulb"];
const MAX_UPLOAD_MB = 500;

const iso = (s: string | null) => (s ? s.slice(0, 10) : "");
const thDate = (s: string | null) => {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const thb = (n: number) => `฿${Number(n || 0).toLocaleString()}`;

/** Per-category spec display (หมวด 1–8). */
function specRows(sel: Detail): { k: string; v: string }[] {
  const s = (sel.spec || {}) as Record<string, string | number | boolean | null | undefined>;
  const str = (k: string) => (s[k] === undefined || s[k] === null ? "" : String(s[k]));
  const rows: { k: string; v: string }[] = [];
  const cat = sel.category_code;
  if (cat === "P") {
    rows.push({ k: "Socket type · ประเภทปลั๊ก", v: str("socket_type") || "—" });
    rows.push({ k: "Panel / breaker · ตู้ไฟ/เบรกเกอร์", v: str("panel_id") ? `#${str("panel_id")} / ${str("breaker_no")}` : "—" });
  } else if (cat === "SW") {
    rows.push({ k: "Gangs · จำนวนปุ่ม", v: str("gang_count") || "—" });
    rows.push({ k: "Panel / breaker", v: str("panel_id") ? `#${str("panel_id")} / ${str("breaker_no")}` : "—" });
  } else if (cat === "L") {
    rows.push({ k: "Lamp type · ประเภท", v: str("lamp_type") || "—" });
    rows.push({ k: "Wattage · กำลังไฟ", v: str("wattage") ? `${str("wattage")} W` : "—" });
    rows.push({ k: "Panel / breaker", v: str("panel_id") ? `#${str("panel_id")} / ${str("breaker_no")}` : "—" });
  } else if (cat === "AC") {
    rows.push({ k: "Brand / model · ยี่ห้อรุ่น", v: `${str("brand")} ${str("model")}`.trim() || "—" });
    rows.push({ k: "BTU", v: str("btu") || "—" });
    rows.push({ k: "Indoor · เครื่องใน", v: str("indoor_note") || "—" });
    rows.push({ k: "Outdoor · เครื่องนอก", v: str("outdoor_location") || "—" });
    rows.push({ k: "Panel / breaker", v: str("panel_id") ? `#${str("panel_id")} / ${str("breaker_no")}` : "—" });
  } else if (cat === "SEN") {
    rows.push({ k: "Sensor type · ประเภท", v: str("sensor_type") || "—" });
    rows.push({ k: "Model · รุ่น", v: str("model") || "—" });
    rows.push({ k: "Zone / panel · โซน/ตู้", v: str("zone") || "—" });
  } else if (cat === "FAN") {
    rows.push({ k: "Model · รุ่น", v: str("model") || "—" });
    rows.push({ k: "Size · ขนาด", v: str("size_inch") ? `${str("size_inch")}″` : "—" });
    rows.push({ k: "Wattage · กำลังไฟ", v: str("wattage") ? `${str("wattage")} W` : "—" });
    rows.push({ k: "Panel / breaker", v: str("panel_id") ? `#${str("panel_id")} / ${str("breaker_no")}` : "—" });
  } else if (cat === "W") {
    rows.push({ k: "Fixture · ประเภท", v: str("fixture_type") || "—" });
    rows.push({ k: "Shut-off valve · วาล์วปิดน้ำ", v: str("valve_location") || "—" });
  } else if (cat === "MDB") {
    rows.push({ k: "Panel code · รหัสตู้", v: str("panel_code") || sel.code });
    rows.push({ k: "Main amps · เมน", v: str("main_amps") ? `${str("main_amps")} A` : "—" });
  }
  return rows;
}

const blankForm = {
  code: "", name_en: "", room_id: "", category_id: "", work_type: "",
  installed_at: "", notes: "", layout: "",
  lamp_type: "", brand: "", model: "", wattage: "", supplier: "", po_no: "", po_reason: "",
};

export default function FloorPlan() {
  const [pts, setPts] = useState<Pt[]>([]);
  const [cats, setCats] = useState<{ id: number; code: string; name_en: string; work_type?: string }[]>([]);
  const [rooms, setRooms] = useState<{ id: number; code: string; name_en: string }[]>([]);
  const [floors, setFloors] = useState<{ id: number; name_en: string; plan_image: string }[]>([]);
  /* One category at a time — the plan opens clean, the user picks a trade,
     and the picked pill highlights instead of the old strike-through. */
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Detail | null>(null);
  const [tab, setTab] = useState("overview");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(blankForm);
  /* New point runs in two steps: fill the popup, then place it on the plan. */
  const [newOpen, setNewOpen] = useState(false);
  const [placing, setPlacing] = useState<{ x: number; y: number; active: boolean } | null>(null);
  /** Live marker drag: press-and-hold a point in edit mode and it follows the mouse. */
  const [drag, setDrag] = useState<{ id: number; x: number; y: number; fromX: number; fromY: number; moved: boolean } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [specFile, setSpecFile] = useState<File | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  /* After a real drag the browser still fires a click on the marker — swallow it. */
  const afterDragRef = useRef(false);

  const user = getUser();
  const canEdit = !!user && (user.role === "admin" || user.role === "technician");
  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    const [p, c, r, f] = await Promise.all([
      api<Pt[]>("/api/points"), api<typeof cats>("/api/categories"),
      api<typeof rooms>("/api/rooms"), api<typeof floors>("/api/floors"),
    ]);
    setPts(p); setCats(c); setRooms(r); setFloors(f);
  }, []);
  useEffect(() => { load().catch((e) => setErr(String(e))); }, [load]);

  /** Every write goes through here so a failed request surfaces in the UI. */
  const run = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { setErr(String(e)); }
  };

  /* Single-storey site — the plan is the building's only floor. */
  const plan = floors[0]?.plan_image || "/aptc-layout.png";
  const filtered = pts.filter((p) =>
    (activeCat === null || p.category_code === activeCat) &&
    (!q || p.code.toLowerCase().includes(q.toLowerCase()) || p.name_en.toLowerCase().includes(q.toLowerCase())));

  const posOf = (clientX: number, clientY: number) => {
    const box = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - box.top) / box.height) * 100)),
    };
  };

  const openDetail = async (code: string, keepTab = false) => {
    try {
      const d = await api<Detail>(`/api/points/${code}`);
      setSel(d);
      setSpecFile(null);
      setReportOpen(false);
      setEditing(false);
      setErr("");
      if (!keepTab) setTab("overview");
    } catch (e) { setErr(String(e)); }
  };

  const startEdit = () => {
    if (!sel) return;
    const sp = (sel.spec || {}) as Record<string, unknown>;
    const sv = (k: string) => String(sp[k] ?? "");
    setForm({
      code: sel.code, name_en: sel.name_en || "", room_id: String(sel.room_id),
      category_id: String(sel.category_id), work_type: catWorkType(String(sel.category_id)),
      installed_at: iso(sel.installed_at),
      notes: sel.notes || "", layout: String(sel.spec?.marker_layout ?? ""),
      lamp_type: sv("lamp_type"), brand: sv("brand"), model: sv("model"),
      wattage: sv("wattage"), supplier: sv("supplier"),
      po_no: sv("po_no"), po_reason: sv("po_reason"),
    });
    setSpecFile(null);
    setEditing(true);
    setErr("");
  };

  const bodyOf = (f: typeof blankForm) => ({
    code: f.code.trim(), name_en: f.name_en,
    room_id: f.room_id ? Number(f.room_id) : undefined,
    category_id: f.category_id ? Number(f.category_id) : undefined,
    installed_at: f.installed_at ? `${f.installed_at}T09:00:00` : null,
    notes: f.notes,
  });

  const saveEdit = () => run(async () => {
    if (!sel) return;
    if (!form.code.trim()) { setErr("กรอกรหัสจุดก่อนบันทึก · point code is required"); return; }
    const spec = { ...(sel.spec || {}) } as Record<string, unknown>;
    if (layoutOf(form)) spec.marker_layout = layoutOf(form);
    else delete spec.marker_layout;
    /* Lighting keeps a fixed spec the office can order from — all of it required. */
    if (catCodeOf(form) === "L") {
      const need: [string, string][] = [
        [form.lamp_type, "ประเภทโคม · lamp type"],
        [form.brand, "ยี่ห้อ · brand"],
        [form.model, "รุ่น · model"],
        [form.wattage, "กำลังไฟ · wattage"],
        [form.supplier, "ซื้อที่ไหน · supplier"],
      ];
      const missing = need.filter(([v]) => !v.trim()).map(([, k]) => k);
      if (!form.po_no.trim() && !form.po_reason.trim()) missing.push("P/O หรือเหตุผล · P/O or reason");
      if (!String(spec.attachment || "").trim() && !specFile) missing.push("ไฟล์แนบ · attachment");
      if (missing.length) { setErr(`สเปก Lighting ยังไม่ครบ · missing: ${missing.join(" · ")}`); return; }
      spec.lamp_type = form.lamp_type.trim();
      spec.brand = form.brand.trim();
      spec.model = form.model.trim();
      spec.wattage = form.wattage.trim();
      spec.supplier = form.supplier.trim();
      spec.po_no = form.po_no.trim();
      spec.po_reason = form.po_reason.trim();
    }
    await api(`/api/points/${sel.id}`, { method: "PUT", body: JSON.stringify({ ...bodyOf(form), spec }) });
    if (specFile) await upload(`/api/points/${sel.id}/attachment`, specFile);
    setMsg(`บันทึกจุด ${form.code} แล้ว · point updated`);
    setSpecFile(null);
    setEditing(false);
    await load();
    await openDetail(form.code, true);
  });

  const removePoint = () => run(async () => {
    if (!sel) return;
    if (!window.confirm(`ลบจุด ${sel.code}? ประวัติทั้งหมดของจุดนี้จะถูกลบด้วย · delete this point and its history?`)) return;
    await api(`/api/points/${sel.id}`, { method: "DELETE" });
    setMsg(`ลบจุด ${sel.code} แล้ว · point deleted`);
    setSel(null);
    await load();
  });

  const catCodeOf = (f: typeof blankForm) => cats.find((c) => String(c.id) === f.category_id)?.code ?? "";
  /** Trade of the category a point belongs to — keeps the point form and the
      report-fault form telling the same story about the same equipment. */
  const catWorkType = (categoryId: string) => cats.find((c) => String(c.id) === categoryId)?.work_type ?? "";

  /** Marker direction is a Lighting-only option; other categories keep their default look. */
  const layoutOf = (f: typeof blankForm) => (catCodeOf(f) === "L" ? f.layout : "");

  const openNewPoint = () => {
    setForm({ ...blankForm, room_id: String(rooms[0]?.id ?? "") });
    setSel(null); setEditing(false); setErr("");
    setPlacing(null);
    setNewOpen(true);
  };

  const closeNewPoint = () => { setNewOpen(false); setErr(""); };

  /** Step 1 → 2: the details are complete, so hand over to the plan for placement. */
  const startPlacing = () => {
    if (!form.code.trim()) { setErr("กรอกรหัสจุดก่อนบันทึก · point code is required"); return; }
    if (!form.room_id || !form.category_id) { setErr("เลือกห้องและหมวดก่อนบันทึก · pick a room and category"); return; }
    setErr(""); setNewOpen(false);
    setPlacing({ x: 50, y: 50, active: false });
  };

  const cancelPlacing = () => { setPlacing(null); setErr(""); };

  /** Step 2 — click or drag the plan; the point lands where the pointer is released. */
  const placeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!placing || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setPlacing({ ...posOf(e.clientX, e.clientY), active: true });
  };

  const placeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!placing || !placing.active) return;
    setPlacing({ ...posOf(e.clientX, e.clientY), active: true });
  };

  const placeEnd = () => {
    if (!placing || !placing.active) return;
    const { x, y } = placing;
    const code = form.code;
    run(async () => {
      await api("/api/points", {
        method: "POST",
        body: JSON.stringify({
          ...bodyOf(form), x_pct: x, y_pct: y,
          spec: layoutOf(form) ? { marker_layout: layoutOf(form) } : {},
        }),
      });
      setMsg(`เพิ่มจุด ${code} แล้ว · point created`);
      setPlacing(null); setForm(blankForm);
      await load();
      await openDetail(code);
    });
  };

  /* Press-and-hold a marker in edit mode → it follows the pointer, releasing drops it. */
  const startDrag = (e: React.PointerEvent<HTMLElement>, p: Pt) => {
    if (!canEdit || !editMode || placing || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: p.id, x: p.x_pct, y: p.y_pct, fromX: e.clientX, fromY: e.clientY, moved: false });
    setErr("");
  };

  const dragMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag) return;
    e.stopPropagation();
    const { x, y } = posOf(e.clientX, e.clientY);
    const moved = drag.moved || Math.hypot(e.clientX - drag.fromX, e.clientY - drag.fromY) > 3;
    setDrag({ ...drag, x, y, moved });
  };

  const dropDrag = (e: React.PointerEvent<HTMLElement>) => run(async () => {
    if (!drag) return;
    e.stopPropagation();
    const d = drag;
    setDrag(null);
    if (!d.moved) return;                       // a plain click — let onClick open the detail
    afterDragRef.current = true;
    await api(`/api/points/${d.id}/position`, { method: "PATCH", body: JSON.stringify({ x_pct: d.x, y_pct: d.y }) });
    const moved = pts.find((p) => p.id === d.id);
    await load();
    if (moved) { setMsg(`ย้าย ${moved.code} ไป ${d.x.toFixed(1)}% , ${d.y.toFixed(1)}% · position saved`); await openDetail(moved.code, true); }
  });

  const cancelDrag = () => setDrag(null);

  /** Report-fault lives in one shared component (components/ReportFault.tsx). */

  /* Only the tabs with something in them, plus the always-useful ones.
     Lighting runs a fixed set — overview · spec · timeline · report — because a
     lamp has no sub-units of its own and no upkeep programme, so units/upkeep
     are hidden for that category. */
  const tabs = useMemo(() => {
    if (!sel) return [];
    const sp = (sel.spec || {}) as Record<string, unknown>;
    const filled = (k: string) => !!String(sp[k] ?? "").trim();
    const specCount = sel.category_code === "L"
      ? ["lamp_type", "brand", "model", "wattage", "supplier"].filter(filled).length
        + (filled("po_no") || filled("po_reason") ? 1 : 0)
        + (filled("attachment") ? 1 : 0)
      : specRows(sel).length;
    const all = [
      { id: "overview", label: "ภาพรวม", en: "Overview", icon: Gauge, count: 0 },
      { id: "spec", label: "สเปก", en: "Spec", icon: Info, count: specCount },
      { id: "timeline", label: "ประวัติ", en: "Timeline", icon: ListChecks, count: sel.repairs.length },
      { id: "units", label: "อุปกรณ์", en: "Units", icon: Boxes,
        count: sel.equipments.length + sel.sub_units.length },
      { id: "upkeep", label: "ล้าง/ทดสอบ", en: "Upkeep", icon: Sparkles, count: sel.maintenances.length },
    ];
    return sel.category_code === "L"
      ? all.filter((t) => t.id !== "units" && t.id !== "upkeep")
      : all;
  }, [sel]);

  /* A hidden tab must never stay selected. */
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "overview";

  const statusOf = (s: string) => STATUS_META[s] ?? { label: s, th: "", cls: "chip", dot: "bg-idle", edge: "border-idle" };

  return (
    <div className="space-y-5">
      <PageHead
        icon={MapIcon}
        title="Floor Plan"
        sub="คลิกจุดเพื่อดูรายละเอียดด้านล่าง · เลือกดูทีละส่วน ไม่ต้องเลื่อนหา"
      >
        <button
          type="button"
          className="switch"
          aria-pressed={editMode}
          disabled={!canEdit}
          title={canEdit ? "เปิดเพื่อย้าย/แก้ไข/ลบจุด" : "เฉพาะ admin / technician · staff only"}
          onClick={() => { setEditMode((v) => !v); setNewOpen(false); setPlacing(null); }}
        >
          <span className="switch-track" aria-hidden />
          <Pencil size={14} aria-hidden />
          โหมดแก้ไข
        </button>
        {editMode && canEdit && !placing && (
          <button
            type="button"
            className="btn btn-primary"
            title="เพิ่มจุดติดตั้งใหม่ · add a new point"
            onClick={openNewPoint}
          >
            <Plus size={14} aria-hidden /> Add point · เพิ่มจุด
          </button>
        )}
      </PageHead>

      {msg && (
        <Notice tone="accent">
          <span className="min-w-0 flex-1">{msg}</span>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setMsg("")} aria-label="Dismiss"><X size={13} /></button>
        </Notice>
      )}
      {err && !newOpen && (
        <Notice tone="danger">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{err}</span>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setErr("")} aria-label="Dismiss"><X size={13} /></button>
        </Notice>
      )}

      {/* ── Everything the page can do, in one toolbar ─────────── */}
      <section className="card card-pad">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="เลือกหมวดที่แสดงบนแปลน">
          {cats.map((c) => {
            const on = activeCat === c.code;
            const n = pts.filter((p) => p.category_code === c.code).length;
            return (
              <button key={c.code} type="button" aria-pressed={on}
                onClick={() => setActiveCat(on ? null : c.code)}
                className={`pill${on ? " is-active" : ""}`}>
                {c.code} · {c.name_en} <span className="opacity-60">{n}</span>
              </button>
            );
          })}
          {activeCat !== null && (
            <button type="button" className="btn btn-quiet btn-sm ml-auto" onClick={() => setActiveCat(null)}>
              ล้างการเลือก · Clear
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rule pt-3 text-xs text-muted">
          <span className="label m-0">สถานะ · Status</span>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${v.dot}`} aria-hidden />{v.label} · {v.th}
            </span>
          ))}
          <div className="search ml-auto basis-40 sm:basis-56">
            <Search size={14} className="search-icon" aria-hidden />
            <input className="search-inp" type="search" placeholder="ค้นหารหัส / ชื่อจุด" aria-label="Search points"
              value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} />
          </div>
          <span className="chip chip-mono" title="จุดที่แสดง / ทั้งหมด">{filtered.length} / {pts.length}</span>
          {editMode && (
            <span className="inline-flex items-center gap-1.5 text-accent">
              <Pencil size={12} aria-hidden />
              กดค้างที่จุดแล้วลากเพื่อย้าย · press and hold a marker to drag it
            </span>
          )}
        </div>
      </section>

      {/* ── The plan ───────────────────────────────────────────── */}
      <div ref={boxRef}
        className={`relative overflow-hidden rounded-card border border-rule bg-surface shadow-card ${
          placing ? "cursor-crosshair touch-none" : editMode && canEdit ? "cursor-grab" : ""}`}
        onPointerDown={placeStart}
        onPointerMove={placeMove}
        onPointerUp={placeEnd}>
        <img src={plan.startsWith("/uploads") ? img(plan) : plan} alt="Floor plan"
          className="block w-full select-none" draggable={false} />
        {filtered.map((p) => {
          const Icon = CAT_ICON[p.category_code] || Plug;
          const shape = CAT_SHAPE[p.category_code] || "tag";
          const want = String(p.spec?.marker_layout ?? "");
          const mode: "h" | "v" = want === "h" || want === "v" ? want
            : (STACKED_SHAPES.includes(shape) ? "v" : "h");
          const body = `${SHAPE_INK[shape] ?? ""} ${SHAPE_BODY[shape]?.[mode] ?? LAYOUT[mode]}`;
          const codeCls = `${SHAPE_CODE[shape]?.[mode] ?? CODE_SIZE[mode]} ${mode === "v" ? "mt-0.5 leading-none" : ""}`;
          const st = p.summary.current_status;
          const meta = statusOf(st);
          const isSel = sel?.id === p.id;
          const isDrag = drag?.id === p.id;
          const px = isDrag ? drag.x : p.x_pct;
          const py = isDrag ? drag.y : p.y_pct;
          const grabbable = canEdit && editMode && !placing;
          return (
            <Fragment key={p.id}>
            <button
              onPointerDown={(e) => startDrag(e, p)}
              onPointerMove={dragMove}
              onPointerUp={dropDrag}
              onPointerCancel={cancelDrag}
              onClick={(e) => {
                e.stopPropagation();
                if (afterDragRef.current) { afterDragRef.current = false; return; }
                if (!placing) openDetail(p.code);
              }}
              title={grabbable ? `${p.code} · ${meta.label} · กดค้างแล้วลากเพื่อย้าย · press and hold to drag` : `${p.code} · ${meta.label} · ${p.name_en}`}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center shadow-card transition-all duration-base ease-out ${SHAPE_SHELL[shape]} ${shape === "hex" ? meta.dot : `bg-surface ${meta.edge}`} ${
                isDrag
                  ? "z-30 scale-125 cursor-grabbing ring-4 ring-accent shadow-pop"
                  : `hover:scale-110 ${grabbable ? "cursor-grab" : ""} ${
                      isSel ? "z-20 scale-125 ring-4 ring-accent/45 shadow-pop"
                        : sel ? "opacity-45 hover:opacity-100" : ""}`
              } ${shape === "hex" && (isDrag || isSel) ? "[filter:drop-shadow(0_0_3px_var(--color-accent))]" : ""} ${grabbable ? "touch-none" : ""}`}
              style={{ left: `${px}%`, top: `${py}%` }}>
              <span className={`flex ${body}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center text-surface ${SHAPE_BADGE[shape]} ${meta.dot}`}>
                  <Icon size={12} aria-hidden />
                </span>
                <span className={`font-mono font-bold ${codeCls}`}>{p.code}</span>
              </span>
              {isDrag && (
                <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-pill bg-ink px-2 py-0.5 font-mono text-[10px] font-bold text-surface shadow-pop">
                  {px.toFixed(1)}% , {py.toFixed(1)}%
                </span>
              )}
            </button>
            {p.missing.length > 0 && (
              <span className="pointer-events-none absolute z-40 grid h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-surface bg-warn text-surface shadow-card"
                style={{ left: `calc(${px}% + 16px)`, top: `calc(${py}% - 15px)` }}
                title={`ข้อมูลไม่ครบ: ${p.missing.join(" · ")}`}>
                <TriangleAlert size={11} aria-hidden />
              </span>
            )}
            </Fragment>
          );
        })}
        {placing && (
          <span className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${placing.x}%`, top: `${placing.y}%` }}>
            <span className="flex items-center gap-1 rounded-tag border-2 border-dashed border-accent bg-surface/95 px-1 py-0.5 shadow-pop">
              <span className="flex h-5 w-5 items-center justify-center rounded-tag bg-accent text-surface">
                {(() => {
                  const c = cats.find((x) => String(x.id) === form.category_id);
                  const I = CAT_ICON[c?.code ?? ""] || Plus;
                  return <I size={12} aria-hidden />;
                })()}
              </span>
              <span className="font-mono text-[11px] font-bold text-accent">{form.code || "จุดใหม่"}</span>
            </span>
            <span className="mt-0.5 block whitespace-nowrap text-center font-mono text-[10px] font-bold text-accent">
              {placing.x.toFixed(1)}% , {placing.y.toFixed(1)}%
            </span>
          </span>
        )}
        {filtered.length === 0 && !placing && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
            <p className="max-w-sm rounded-card border border-rule bg-surface/95 px-5 py-4 text-center text-sm text-muted shadow-card">
              <MousePointerClick size={18} className="mx-auto mb-1.5 text-accent" aria-hidden />
              เลือกหมวดด้านบนเพื่อแสดงจุดบนแปลน
              <span className="block text-xs text-soft">เช่น ไฟฟ้าแสงสว่าง · ปลั๊กไฟ · แอร์ — เลือกได้หลายหมวด</span>
            </p>
          </div>
        )}
        {placing && (
          <div className="absolute left-3 top-3 z-40 flex flex-wrap items-center gap-2 rounded-pill bg-accent px-3 py-1 text-xs font-semibold text-surface shadow-pop"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}>
            <Crosshair size={13} aria-hidden />
            ลากหรือคลิกบนแปลนเพื่อกำหนดตำแหน่ง · drag or click the plan to place it
            <button type="button" onClick={cancelPlacing}
              className="rounded-pill border border-surface/50 px-2 py-0.5 text-[11px] font-semibold hover:bg-surface/20">
              ยกเลิก · Cancel
            </button>
          </div>
        )}
        {editMode && canEdit && !placing && !drag && (
          <p className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-pill border border-accentsoft bg-surface/95 px-3 py-1 text-xs font-semibold text-accent shadow-card">
            <Pencil size={13} aria-hidden />
            กดค้างที่จุดแล้วลากเพื่อย้ายตำแหน่ง · press &amp; hold a marker, then drag it
          </p>
        )}
      </div>

      {/* ── Point detail, below the plan ───────────────────────── */}
      {!sel && (
        <Card>
          <Empty icon={MousePointerClick}>
            คลิกจุดบนแปลนเพื่อดูรายละเอียด · click a marker to open its record
          </Empty>
        </Card>
      )}

      {sel && (
        <Card flush>
          <div className="card-head">
            <span className="kpi-icon is-accent">{(() => { const I = CAT_ICON[sel.category_code] || Plug; return <I size={17} aria-hidden />; })()}</span>
            <div className="min-w-0">
              <h2 className="card-title font-mono">{sel.code}</h2>
              <p className="card-title-th block">
                {sel.name_en || "ไม่ระบุชื่อ"} · {sel.room_code} · {sel.category_name}
              </p>
            </div>
            <span className={statusOf(sel.summary.current_status).cls}>
              {statusOf(sel.summary.current_status).label} · {statusOf(sel.summary.current_status).th}
            </span>
            {sel.missing.length > 0 && (
              <span className="chip chip-warn" title={sel.missing.join(" · ")}>
                <TriangleAlert size={12} aria-hidden /> ข้อมูลไม่ครบ {sel.missing.length}
              </span>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => { setReportOpen(true); setErr(""); }}>
                <ClipboardList size={13} aria-hidden /> แจ้งเสีย · Report
              </button>
              {canEdit && !editing && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={startEdit}>
                  <SquarePen size={13} aria-hidden /> Update
                </button>
              )}
              {isAdmin && !editing && (
                <button type="button" className="btn btn-icon btn-sm" onClick={removePoint}
                  aria-label="Delete point" title="ลบจุดนี้ · delete this point">
                  <Trash size={14} />
                </button>
              )}
              <button type="button" className="btn btn-icon" aria-label="Close detail"
                onClick={() => setSel(null)}><X size={15} /></button>
            </div>
          </div>

          {editing ? (
            <div className="card-pad">
              {editPointForm()}
            </div>
          ) : (
            <>
              <div className="tabbar" role="tablist" aria-label="Point sections">
                {tabs.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={activeTab === t.id}
                    className={`tab${activeTab === t.id ? " is-active" : ""}`} onClick={() => setTab(t.id)}>
                    <t.icon size={13} aria-hidden />
                    {t.label} <span className="text-xs opacity-70">{t.en}</span>
                    {t.count > 0 && (
                      <span className={`chip${activeTab === t.id ? " chip-accent" : ""}`}>{t.count}</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="card-pad">{renderTab()}</div>
            </>
          )}
        </Card>
      )}

      {newOpen && newPointModal()}
      {reportOpen && sel && (
        <ReportFault
          point={{ id: sel.id, code: sel.code, name_en: sel.name_en, room_code: sel.room_code, category_name: sel.category_name, work_type: sel.work_type }}
          onClose={() => setReportOpen(false)}
          onDone={(code) => {
            setMsg(`แจ้งเสีย ${sel.code} แล้ว · ${code}`);
            load().then(() => openDetail(sel.code, true)).catch((e) => setErr(String(e)));
          }}
        />
      )}
    </div>
  );

  /* ── field helpers ────────────────────────────────────────── */
  function field(label: string, hint: string, node: React.ReactNode, span?: boolean) {
    return (
      <label className={`fld${span ? " sm:col-span-2" : ""}`}>
        <span>{label}</span>
        {node}
        <span className="fld-hint">{hint}</span>
      </label>
    );
  }

  function baseFields(f: typeof blankForm, set: (n: typeof blankForm) => void, withCode: boolean) {
    /* Work type comes first, then only the categories that belong to it — the
       same trade the “แจ้งเสีย · Report fault” form asks for on the same point.
       Everything else unlocks once the category is picked. */
    const needsCat = !f.work_type || !f.category_id;
    const catOptions = f.work_type ? cats.filter((c) => (c.work_type || "") === f.work_type) : [];
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {field("ประเภทงาน · Work type *", "เลือกประเภทงานก่อน แล้วหมวดจะเหลือเฉพาะที่อยู่ในประเภทนั้น · required",
          <select className="inp" value={f.work_type}
            onChange={(e) => set({ ...f, work_type: e.target.value, category_id: "" })}>
            <option value="">— เลือกประเภทงาน —</option>
            {WORK_TYPES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>)}
        {field("หมวด · Category *", "เลือกหมวดในประเภทงานที่เลือกไว้ (เว้นว่างได้ถ้าหมวดยังไม่มีในระบบ)",
          <select className="inp" value={f.category_id} disabled={!f.work_type}
            onChange={(e) => set({ ...f, category_id: e.target.value })}>
            <option value="">{f.work_type ? "— เลือกหมวด —" : "— เลือกประเภทงานก่อน —"}</option>
            {catOptions.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name_en}</option>)}
          </select>)}
        {field("ห้อง · Room", "ห้องที่ติดตั้งจุดนี้",
          <select className="inp" disabled={needsCat} value={f.room_id} onChange={(e) => set({ ...f, room_id: e.target.value })}>
            <option value="">— เลือกห้อง —</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name_en}</option>)}
          </select>)}
        {field("รหัสจุด · Code", "รหัสที่ใช้จริงบนแปลน เช่น L-009 · ต้องไม่ซ้ำกับจุดที่มีอยู่",
          <input className="inp" placeholder="เช่น L-009" value={f.code} disabled={needsCat} readOnly={!withCode}
            onChange={(e) => set({ ...f, code: e.target.value })} />)}
        {field("ชื่อจุด · Name", "ชื่อสั้น ๆ ที่คนอื่นอ่านแล้วรู้ว่าคืออะไร",
          <input className="inp" placeholder="เช่น LED panel หน้าห้องแล็บ" value={f.name_en} disabled={needsCat}
            onChange={(e) => set({ ...f, name_en: e.target.value })} />)}
        {field("ติดตั้งเมื่อ · Installed", "วันที่ติดตั้งครั้งแรก (เว้นว่างได้)",
          <input type="date" className="inp" value={f.installed_at} disabled={needsCat}
            onChange={(e) => set({ ...f, installed_at: e.target.value })} />)}
        {catCodeOf(f) === "L" && field("การวางปุ่มบนแปลน · Marker",
          "แนวตั้ง/แนวนอน ของปุ่มจุดนี้ (ใช้กับหมวด Lighting)",
          <select className="inp" disabled={needsCat} value={f.layout} onChange={(e) => set({ ...f, layout: e.target.value })}>
            {LAYOUT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.th}</option>)}
          </select>)}
        {field("หมายเหตุ · Notes", "ข้อมูลที่ช่างควรรู้ เช่น อยู่ในฝ้า ต้องใช้บันได",
          <input className="inp" placeholder="เช่น อยู่ในฝ้าเพดาน" value={f.notes} disabled={needsCat}
            onChange={(e) => set({ ...f, notes: e.target.value })} />, true)}
      </div>
    );
  }

  function newPointModal() {
    return (
      <Modal onClose={closeNewPoint} labelledBy="np-title" wide dismissOnBackdrop={false} dismissOnEscape={false}>
        <div className="sheet-head">
          <span className="kpi-icon is-accent"><Plus size={17} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h2 id="np-title" className="sheet-title">จุดใหม่ · New point</h2>
            <p className="sheet-sub">
              เลือกประเภทงาน → หมวด → กรอกข้อมูลให้ครบ จากนั้นกำหนดตำแหน่งบนแปลน · work type → category → details → place it
            </p>
          </div>
          <button type="button" className="btn btn-icon" aria-label="Close" onClick={closeNewPoint}>
            <X size={16} />
          </button>
        </div>

        {err && <Notice tone="danger">{err}</Notice>}

        <div className="mt-3 grid gap-3">
          {baseFields(form, setForm, true)}
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-xs text-soft">
          <Crosshair size={13} aria-hidden />
          ขั้นถัดไป: กด “สร้างจุด” แล้วลากหรือคลิกบนแปลนเพื่อวางตำแหน่ง · next: press Create point, then drag or click the plan
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={startPlacing}>
            <Crosshair size={14} aria-hidden /> สร้างจุด · Create point
          </button>
          <button type="button" className="btn btn-secondary" onClick={closeNewPoint}>
            ยกเลิก · Cancel
          </button>
        </div>
      </Modal>
    );
  }

  function editPointForm() {
    const sp = (sel?.spec || {}) as Record<string, unknown>;
    return (
      <div className="grid gap-3">
        {baseFields(form, setForm, true)}

        {catCodeOf(form) === "L" && (
          <fieldset className="rounded-input border border-rule p-3">
            <legend className="label px-1">สเปกโคมไฟ · Lighting spec *</legend>
            <div className="mt-1 grid gap-3 sm:grid-cols-2">
              {field("ประเภทโคม · Lamp type *", "เลือกให้ตรงกับของที่ติดตั้งจริง",
                <select className="inp" value={form.lamp_type} onChange={(e) => setForm({ ...form, lamp_type: e.target.value })}>
                  <option value="">— เลือกประเภท —</option>
                  {LAMP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>)}
              {field("ยี่ห้อ · Brand *", "ยี่ห้อที่พิมพ์บนกล่อง/โคม",
                <input className="inp" placeholder="เช่น Philips" value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })} />)}
              {field("รุ่น · Model *", "รุ่น/รหัสสินค้าให้สั่งซื้อซ้ำได้",
                <input className="inp" placeholder="เช่น DN027B G2" value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })} />)}
              {field("กำลังไฟ · Wattage *", "ตัวเลขวัตต์ เช่น 18", 
                <input className="inp" placeholder="เช่น 18" value={form.wattage}
                  onChange={(e) => setForm({ ...form, wattage: e.target.value })} />)}
              {field("ซื้อที่ไหน · Supplier *", "ร้าน/ตัวแทนที่ซื้อประจำ",
                <input className="inp" placeholder="เช่น บริษัท สว่างวัฒนา จำกัด" value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })} />)}
              {field("P/O · ใบสั่งซื้อ", "ถ้ามีให้ใส่เลข APP-xxxxx ถ้าไม่มีให้ใส่เหตุผลช่องถัดไป",
                <input className="inp" placeholder="เช่น APP-68210" value={form.po_no}
                  onChange={(e) => setForm({ ...form, po_no: e.target.value })} />)}
              {field("เหตุผลที่ไม่มี P/O · No-P/O reason", "เช่น ซื้อจากสต็อกเดิม / ของบริจาค", 
                <input className="inp" placeholder="เช่น เบิกจากสต็อกเดิม" value={form.po_reason}
                  onChange={(e) => setForm({ ...form, po_reason: e.target.value })} />, true)}
              {field(`ไฟล์แนบ · Attachment *`, `ไม่เกิน ${MAX_UPLOAD_MB} MB · .png .jpg .jpeg .webp .pdf`,
                <div className="grid gap-1">
                  <input type="file" className="inp" accept=".png,.jpg,.jpeg,.webp,.pdf"
                    onChange={(e) => setSpecFile(e.target.files?.[0] ?? null)} />
                  {!!String(sp.attachment ?? "").trim() && (
                    <a className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accentdeep"
                      href={img(String(sp.attachment))} target="_blank" rel="noreferrer">
                      <Paperclip size={12} aria-hidden /> ไฟล์เดิม: {String(sp.attachment_name || "attachment")}
                    </a>
                  )}
                  {specFile && <span className="text-xs text-soft">ไฟล์ใหม่: {specFile.name}</span>}
                </div>, true)}
            </div>
            <p className="mt-2 text-xs text-soft">ช่องที่มี * ต้องกรอกก่อนบันทึก (บังคับสำหรับหมวด Lighting)</p>
          </fieldset>
        )}

        <p className="text-xs text-soft">
          แก้เฉพาะข้อมูลประจำจุด — ตำแหน่งบนแปลนลากย้ายได้ในโหมดแก้ไข
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={saveEdit}>
            <Save size={14} aria-hidden /> บันทึก · Save
          </button>
          <button type="button" className="btn btn-secondary"
            onClick={() => { setEditing(false); setErr(""); }}>ยกเลิก · Cancel</button>
        </div>
      </div>
    );
  }

  /* ── the tab bodies ───────────────────────────────────────── */
  function renderTab() {
    if (!sel) return null;
    const s = sel.summary;
    const isLighting = sel.category_code === "L";

    if (activeTab === "overview") {
      const rows: [string, string][] = [
        ["ติดตั้งครั้งแรก · first installed", thDate(s.first_installed_at)],
        ["วันที่ซ่อมล่าสุด · last repair", thDate(s.last_repair_at)],
        ["เคยเปลี่ยนแล้ว · replacements", `${s.replace_count} ครั้ง · times`],
        ["ตำแหน่ง · Room", `${sel.room_code} · ${sel.room_name}`],
        ["สถานะ · Status", `${statusOf(s.current_status).label} · ${statusOf(s.current_status).th}`],
      ];
      return (
        <div className="grid gap-3">
          <div className="tbl-wrap border-0 shadow-none">
            <table className="tbl">
              <thead>
                <tr><th>รายการ · Field</th><th>ข้อมูล · Value</th></tr>
              </thead>
              <tbody>
                {rows.map(([k, v]) => (
                  <tr key={k}>
                    <td className="text-muted">{k}</td>
                    <td className="font-medium">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sel.missing.length > 0 && (
            <Notice tone="warn">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                ยังกรอกข้อมูลไม่ครบ {sel.missing.length} รายการ · {sel.missing.join(" · ")}
              </span>
            </Notice>
          )}
        </div>
      );
    }

    if (activeTab === "spec") {
      /* Lighting gets a fixed, printable table — the office must be able to
         re-order the exact same lamp from it. */
      if (isLighting) {
        const sp = (sel.spec || {}) as Record<string, unknown>;
        const v = (k: string) => String(sp[k] ?? "").trim() || "—";
        const file = String(sp.attachment ?? "");
        const fileLink = file ? (
          <a className="font-semibold text-accent hover:text-accentdeep" href={img(file)} target="_blank" rel="noreferrer">
            <span className="inline-flex items-center gap-1">
              <Paperclip size={12} aria-hidden /> เปิดดูไฟล์ · Open ({String(sp.attachment_name || "file")})
            </span>
          </a>
        ) : "—";
        const fileRows: [string, React.ReactNode][] = [
          ["ประเภทโคม · Lamp type", v("lamp_type")],
          ["ยี่ห้อ · Brand", v("brand")],
          ["รุ่น · Model", v("model")],
          ["กำลังไฟ · Wattage", sp.wattage ? `${sp.wattage} W` : "—"],
          ["ซื้อที่ไหน · Supplier", v("supplier")],
          ["P/O", sp.po_no ? v("po_no") : (sp.po_reason ? `ไม่มี · ${v("po_reason")}` : "—")],
          ["ไฟล์แนบ · Attachment", fileLink],
        ];
        return (
          <div className="grid gap-3">
            <div className="tbl-wrap border-0 shadow-none">
              <table className="tbl">
                <thead>
                  <tr><th>สเปก · Spec</th><th>ค่า · Value</th></tr>
                </thead>
                <tbody>
                  {fileRows.map(([k, val], i) => (
                    <tr key={i}><td className="text-muted">{k}</td><td>{val}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sel.missing.length > 0 && (
              <Notice tone="warn">
                <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">ยังกรอกไม่ครบ · still missing: {sel.missing.join(" · ")}</span>
              </Notice>
            )}
          </div>
        );
      }
      const rows = specRows(sel);
      if (rows.length === 0 && sel.controls.length === 0) {
        return <Empty icon={Info}>หมวดนี้ยังไม่มีสเปกบันทึกไว้ · no spec recorded for this category</Empty>;
      }
      return (
        <div className="tbl-wrap border-0 shadow-none">
          <table className="tbl">
            <thead>
              <tr><th>สเปก · Spec</th><th>ค่า · Value</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}><td className="text-muted">{r.k}</td><td>{r.v}</td></tr>
              ))}
              {sel.controls.length > 0 && (
                <tr>
                  <td className="text-muted">คุมหลอด · controls</td>
                  <td>
                    {sel.controls.map((c) => (
                      <button key={c.code} type="button" onClick={() => openDetail(c.code)}
                        className="mr-1 font-mono font-bold text-accent hover:text-accentdeep">{c.code}</button>
                    ))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    }

    if (activeTab === "timeline") {
      /* The point's history is the Repair Records of that point — every column
         the Repairs screen holds, newest first, plus the install date it starts from. */
      return (
        <div className="grid gap-3">
          <div className="tbl-wrap border-0 shadow-none">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th><th>วันที่ · Date</th><th>ใบแจ้ง · Report</th>
                  <th>สิ่งที่ทำ · Action</th><th className="text-right">ค่าใช้จ่าย · Cost</th>
                  <th>ช่าง · Tech</th><th>ผู้ขาย · Supplier</th><th>ไฟล์ · File</th>
                  <th>หมายเหตุ · Note</th>
                </tr>
              </thead>
              <tbody>
                {sel.repairs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-soft">
                      ยังไม่มีงานซ่อมของจุดนี้ — บันทึกได้ที่เมนู “งานซ่อม” · no repairs recorded yet
                    </td>
                  </tr>
                )}
                {sel.repairs.map((x, i) => (
                  <tr key={x.id}>
                    <td className="text-soft">{i + 1}</td>
                    <td className="font-mono">{thDate(x.repaired_at)}</td>
                    <td>
                      <span className="font-mono">#{x.report_id}</span>
                      <span className="block text-xs text-soft">{x.report_symptom}</span>
                    </td>
                    <td className="min-w-0 text-ink2">{x.action || "—"}</td>
                    <td className="text-right font-mono">{thb(x.cost)}</td>
                    <td>{x.technician_name || "—"}</td>
                    <td>{x.supplier_name || "—"}</td>
                    <td>
                      {x.attachment
                        ? <a className="inline-flex items-center gap-1 font-semibold text-accent hover:text-accentdeep"
                            href={img(x.attachment)} target="_blank" rel="noreferrer">
                            <Paperclip size={12} aria-hidden /> เปิด
                          </a>
                        : "—"}
                    </td>
                    <td className="min-w-0 text-soft">{x.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-soft">
            <CalendarDays size={12} aria-hidden />
            ติดตั้งครั้งแรก · first installed:
            <span className="font-mono">{thDate(sel.summary.first_installed_at)}</span>
            <span className="text-soft">· ยอดรวมงานซ่อม {thb(sel.summary.total_cost)}</span>
          </p>
        </div>
      );
    }

    if (activeTab === "units") {
      if (sel.equipments.length === 0 && sel.sub_units.length === 0) {
        return <Empty icon={Boxes}>ยังไม่มีอุปกรณ์บันทึกไว้ · no units recorded</Empty>;
      }
      return (
        <div className="grid gap-4">
          {sel.equipments.length > 0 && (
            <div>
              <p className="label">เครื่องที่ติดตั้ง · Equipments ({sel.equipments.length})</p>
              <ul className="mt-2 space-y-1.5 text-xs">
                {sel.equipments.map((e) => (
                  <li key={e.id} className="rounded-input border border-rule px-2.5 py-1.5">
                    <span className="font-mono font-semibold">{e.serial_no || "—"}</span> · {e.brand_model || "—"}
                    <span className="ml-2 chip chip-mono">{e.status}</span>
                    <span className="block text-soft">
                      ติดตั้ง {thDate(e.installed_at)}{e.removed_at ? ` · ถอด ${thDate(e.removed_at)}` : ""}
                      {e.notes ? ` · ${e.notes}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sel.sub_units.length > 0 && (
            <div>
              <p className="label">อุปกรณ์ย่อย · Sub-units ({sel.sub_units.length})</p>
              <ul className="mt-2 space-y-1.5 text-xs">
                {sel.sub_units.map((u) => (
                  <li key={u.id} className="rounded-input border border-rule px-2.5 py-1.5">
                    <span className="chip chip-mono">{u.kind}</span> {u.label}
                    <span className="text-soft"> · {u.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }

    if (activeTab === "upkeep") {
      if (sel.maintenances.length === 0) {
        return <Empty icon={Sparkles}>ยังไม่มีบันทึกล้าง/ทดสอบ · no upkeep logged</Empty>;
      }
      return (
        <ul className="space-y-1.5 text-xs">
          {sel.maintenances.map((m) => (
            <li key={m.id} className="flex flex-wrap items-baseline gap-x-2 rounded-input border border-rule px-2.5 py-1.5">
              <span className="font-mono text-soft">{thDate(m.performed_at)}</span>
              <span className="chip chip-mono">{m.kind}</span>
              <span className="min-w-0 flex-1">{m.note || "—"}</span>
              <span className="text-soft">{m.performer}</span>
              <span className={m.result === "fail" ? "chip chip-wait" : "chip chip-ok"}>{m.result}</span>
              <span className="font-mono">{thb(m.cost)}</span>
            </li>
          ))}
        </ul>
      );
    }

    return null;
  }
}