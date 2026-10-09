import { useEffect, useMemo, useState } from "react";
import {
  Wrench, Plus, Inbox, X, SquarePen, Save, Pencil, Search, Filter, TriangleAlert,
  Paperclip, ClipboardList, Truck, CalendarDays, FileText,
} from "lucide-react";
import { api, getUser, img, upload, STATUS_META, WORK_TYPES, workTypeTh } from "../lib/api";
import { PageHead, Panel as Card, Empty, Notice, Modal } from "../components/ui";

interface Row {
  id: number; report_id: number; technician_id: number | null;
  action: string; cost: number; repaired_at: string | null; started_at: string | null;
  completed_at: string | null; po_date: string | null; code: string;
  work_type?: string;
  attachment: string; quotation_attachment: string; po_attachment: string;
  note: string; po_no: string; technician_name: string; supplier_id: number | null; supplier_name: string;
  point_code: string; point_name: string; room_code: string; category_code: string;
  report_status: string; report_symptom: string;
}
interface Sibling {
  id: number; action: string; cost: number; repaired_at: string | null; technician_name: string;
}
interface Detail extends Row {
  report: {
    id: number; symptom: string; status: string; note: string; photo: string;
    reported_at: string | null; reporter_name: string;
    point_code: string; point_name: string; room_code: string;
    siblings: Sibling[];
  };
}

/** What to type in each field — shown as placeholder + hint so staff don't guess. */
const GUIDE = {
  report: { hint: "งานซ่อมต้องผูกกับใบแจ้งเสมอ — เลือกใบที่ยังไม่ปิด" },
  tech: { hint: "ช่างที่ลงมือทำจริง" },
  action: { ph: "เช่น เปลี่ยนบัลลาสต์อิเล็กทรอนิกส์ 2 ตัว", hint: "ทำอะไรไป — ขึ้นต้นด้วยคำกริยา อ่านแล้วรู้เลย" },
  cost: { ph: "0", hint: "ค่าอะไหล่ + ค่าแรง (บาท) · เคลมประกันใส่ 0" },
  date: { hint: "วันที่เข้าซ่อมจริง" },
  note: { ph: "เช่น ใช้บัลลาสต์ Philips EBM-118 ประกัน 1 ปี", hint: "รุ่นอะไหล่ที่ใช้ / ค่าที่วัดได้ / สภาพหลังซ่อม" },
  po_no: { ph: "APP-xxxxx", hint: "ตัวอย่าง APP-68210 • ใส่เฉพาะเมื่อมีใบสั่งซื้อ / leave blank if not available" },
  po_date: { hint: "วันที่ตามใบสั่งซื้อ — ใช้เรียงลำดับงาน (ล่าสุดอยู่บนสุด)" },
  supplier: { hint: "ผู้รับเหมาที่ใช้ (ถ้ามีซื้อของหรือจ้างทำ)" },
};

const blankRepair = {
  report_id: "", technician_id: "", action: "", cost: "0",
  repaired_at: "", started_at: "", completed_at: "", note: "", po_no: "", po_date: "",
  quotation_attachment: "", po_attachment: "", supplier_id: "",
};

const iso = (s: string | null) => (s ? s.slice(0, 10) : "");
const thDate = (s: string | null) => {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const thb = (n: number) => `฿${Number(n || 0).toLocaleString()}`;

type Dated = { id: number; po_date?: string | null; completed_at?: string | null; started_at?: string | null; repaired_at?: string | null };
/** Which day a repair is filed under: the P/O date when we have one, otherwise
    the day the job finished / started. Table order and No. both follow it. */
const dateKey = (r: Dated) => (r.po_date || r.completed_at || r.started_at || r.repaired_at || "").slice(0, 10);
const yearOf = (r: Dated) => dateKey(r).slice(0, 4) || "—";

export default function Repairs() {
  const [rows, setRows] = useState<Row[]>([]);
  const [reps, setReps] = useState<{ id: number; point_code: string; symptom: string; status: string; work_type?: string; code?: string; quotation_attachment?: string }[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string; role: string }[]>([]);
  const [sups, setSups] = useState<{ id: number; company: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState(blankRepair);
  const [q, setQ] = useState("");
  const [supFilter, setSupFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [wtFilter, setWtFilter] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(blankRepair);

  const user = getUser();
  const canEdit = !!user && (user.role === "admin" || user.role === "technician");

  const load = async () => {
    setRows(await api("/api/repairs"));
    setReps(await api("/api/reports"));
    setUsers(await api("/api/users"));
    setSups(await api("/api/suppliers"));
  };
  useEffect(() => { load().catch((e) => setErr(String(e))); }, []);

  /** Every write goes through here so a failed request surfaces in the UI. */
  const run = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { setErr(String(e)); }
  };

  const haystack = (r: Row) =>
    [r.point_code, r.point_name, r.room_code, r.action, r.note, r.po_no, r.code, r.technician_name,
     r.supplier_name, r.report_symptom, tradeOf(r), workTypeTh(tradeOf(r)), repNo(r), String(r.report_id)].join(" ").toLowerCase();

  /* A repair carries the trade of the report that raised it — same value the
     Floor Plan report form asks for, so both screens always agree. */
  const repOf = (r: { report_id: number }) => reps.find((x) => x.id === r.report_id);
  const repNo = (r: { report_id: number }) => repOf(r)?.code || `#${r.report_id}`;
  /** File (Quotation) and P/R is attached at the report — the repair just shows it. */
  const quotOf = (r: { report_id: number; quotation_attachment?: string; attachment?: string }) =>
    repOf(r)?.quotation_attachment || r.quotation_attachment || r.attachment || "";
  const tradeOf = (r: { report_id: number; work_type?: string }) =>
    r.work_type || repOf(r)?.work_type || "";

  /* Repairs don't carry their own status — they inherit the report's — and in
     practice every job is against a closed report. What the data *does* vary
     on is who did the work, so that is the axis worth filtering. */
  const supTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = r.supplier_name || "";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rows]);

  const yearTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const y = yearOf(r);
      counts.set(y, (counts.get(y) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  /* งานซ่อมใช้ประเภทงานของใบแจ้ง — นับจากค่าที่จะแสดงจริง เพื่อให้ตัวกรองตรงกับตาราง */
  const wtTabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = tradeOf(r);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }, [rows, reps]);

  /* ลำดับแถวและเลข No. ยึด "ใบแจ้ง" เป็นหลัก: ใบแจ้งใหม่สุดอยู่บน และนับ No. 1,2,3 จากล่างขึ้นบน
     (ล่างสุด = ใบแจ้งแรกสุด) — เลขจึงเดินตามคอลัมน์ Report ตรง ๆ */
  const repKey = (r: Row) => repOf(r)?.code || `#${String(r.report_id).padStart(6, "0")}`;
  const order = useMemo(() => {
    const asc = [...rows].sort((a, b) => repKey(a).localeCompare(repKey(b)) || a.id - b.id);
    return new Map(asc.map((r, i) => [r.id, i + 1]));
  }, [rows, reps]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) =>
        (!supFilter || (r.supplier_name || "") === supFilter) &&
        (!yearFilter || yearOf(r) === yearFilter) &&
        (!wtFilter || tradeOf(r) === (wtFilter === "__none" ? "" : wtFilter)) &&
        (!needle || haystack(r).includes(needle)))
      .sort((a, b) => repKey(b).localeCompare(repKey(a)) || b.id - a.id);
  }, [rows, reps, q, supFilter, yearFilter, wtFilter]);

  const totals = useMemo(() => ({
    cost: shown.reduce((s, r) => s + (r.cost || 0), 0),
    files: shown.filter((r) => r.attachment || r.quotation_attachment || r.po_attachment).length,
  }), [shown]);

  const filtering = q.trim() !== "" || supFilter !== "" || yearFilter !== "" || wtFilter !== "";
  const staleApi = rows.length > 0 && rows.every((r) => !("room_code" in r));

  const open = async (id: number, startEditing = false) => {
    try {
      const d = await api<Detail>(`/api/repairs/${id}`);
      setDetail(d);
      setForm({
        report_id: String(d.report_id), technician_id: d.technician_id ? String(d.technician_id) : "",
        action: d.action || "", cost: String(d.cost ?? 0),
        repaired_at: iso(d.repaired_at), started_at: iso(d.started_at ?? d.repaired_at),
        completed_at: iso(d.completed_at ?? d.repaired_at), note: d.note || "", po_no: d.po_no || "",
        po_date: iso(d.po_date),
        quotation_attachment: d.quotation_attachment || "", po_attachment: d.po_attachment || "",
        supplier_id: d.supplier_id ? String(d.supplier_id) : "",
      });
      setEditing(startEditing);
      setErr("");
    } catch (e) { setErr(String(e)); }
  };
  const reopen = async (id: number) => { await open(id, false); await load(); };

  const bodyOf = (f: typeof blankRepair) => {
    const poNo = (f.po_no || "").trim();
    const start = f.started_at || f.repaired_at || "";
    const finish = f.completed_at || start;
    return {
      report_id: Number(f.report_id), technician_id: f.technician_id ? Number(f.technician_id) : null,
      action: f.action, cost: Number(f.cost) || 0,
      repaired_at: start ? `${start}T14:00:00` : null,
      started_at: start ? `${start}T08:00:00` : null,
      completed_at: finish ? `${finish}T17:00:00` : null,
      note: f.note, po_no: poNo || null,
      po_date: f.po_date ? `${f.po_date}T12:00:00` : null,
      quotation_attachment: f.quotation_attachment || null,
      po_attachment: f.po_attachment || null,
      supplier_id: f.supplier_id ? Number(f.supplier_id) : null,
    };
  };

  const saveNew = () => run(async () => {
    if (!addForm.report_id) { setErr("เลือกใบแจ้งก่อนบันทึก · pick a report"); return; }
    if (!addForm.action.trim()) { setErr("ระบุงานที่ทำก่อนบันทึก · describe the action"); return; }
    const poNo = (addForm.po_no || "").trim();
    if (poNo && !/^APP-\d{5,}$/.test(poNo)) { setErr("รูปแบบ P/O No. ต้องเป็น APP-xxxxx"); return; }
    const made = await api<{ code?: string }>("/api/repairs", { method: "POST", body: JSON.stringify(bodyOf(addForm)) });
    setErr(""); setMsg(`บันทึกงานซ่อมใหม่แล้ว · ${made.code || "repair saved"}`);
    setAddForm(blankRepair); setAdding(false);
    await load();
  });

  const saveEdit = () => run(async () => {
    if (!detail) return;
    if (!form.action.trim()) { setErr("ระบุงานที่ทำก่อนบันทึก · describe the action"); return; }
    const poNo = (form.po_no || "").trim();
    if (poNo && !/^APP-\d{5,}$/.test(poNo)) { setErr("รูปแบบ P/O No. ต้องเป็น APP-xxxxx"); return; }
    await api(`/api/repairs/${detail.id}`, { method: "PUT", body: JSON.stringify(bodyOf(form)) });
    setErr(""); setMsg(`อัปเดตงานซ่อม ${detail.code || "#" + detail.id} แล้ว · repair updated`);
    await reopen(detail.id);
  });

  const statusChip = (s: string) => STATUS_META[s]?.cls ?? "chip";

  /* Shared field renderers so the add form and the edit form read the same. */
  const reportField = (value: string, onChange: (v: string) => void) => {
    const open0 = reps.filter((r) => r.status !== "done");
    const current = reps.find((r) => String(r.id) === value);
    const list = value && current && !open0.some((r) => r.id === current.id) ? [current, ...open0] : open0;
    return (
      <label className="fld">
        <span>Report · ใบแจ้ง</span>
        <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— เลือกใบแจ้ง —</option>
          {list.map((r) => (
            <option key={r.id} value={r.id}>{r.code || `#${r.id}`} · {r.point_code} — {r.symptom.slice(0, 38)}</option>
          ))}
        </select>
        <span className="fld-hint">{GUIDE.report.hint}</span>
      </label>
    );
  };

  const techField = (value: string, onChange: (v: string) => void) => (
    <label className="fld">
      <span>Technician · ช่างผู้ทำ</span>
      <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— ตัวเอง ({user?.name ?? "—"}) —</option>
        {users.filter((u) => u.role !== "reporter").map((u) => (
          <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
        ))}
      </select>
      <span className="fld-hint">{GUIDE.tech.hint}</span>
    </label>
  );

  const supplierField = (value: string, onChange: (v: string) => void) => (
    <label className="fld">
      <span>Supplier · ผู้รับเหมา</span>
      <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— ไม่ใช้ผู้รับเหมา —</option>
        {sups.map((s) => <option key={s.id} value={s.id}>{s.company}</option>)}
      </select>
      <span className="fld-hint">{GUIDE.supplier.hint}</span>
    </label>
  );

  const textField = (label: string, guide: { ph: string; hint: string }, value: string,
                     onChange: (v: string) => void, span?: boolean) => (
    <label className={`fld${span ? " sm:col-span-2" : ""}`}>
      <span>{label}</span>
      <input className="inp" placeholder={guide.ph} value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="fld-hint">{guide.hint}</span>
    </label>
  );

  const dateField = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="fld">
      <span>{label}</span>
      <input type="date" className="inp" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="fld-hint">{GUIDE.date.hint}</span>
    </label>
  );

  const moneyField = (value: string, onChange: (v: string) => void) => (
    <label className="fld">
      <span>Cost (฿) · ค่าใช้จ่าย</span>
      <input type="number" min="0" className="inp" placeholder={GUIDE.cost.ph} value={value}
        onChange={(e) => onChange(e.target.value)} />
      <span className="fld-hint">{GUIDE.cost.hint}</span>
    </label>
  );

  const formBody = (f: typeof blankRepair, set: (n: typeof blankRepair) => void, which: "new" | "edit") => (
    <div className="grid gap-3 sm:grid-cols-2">
      {which === "edit" ? (
        <label className="fld">
          <span>Report · ใบแจ้ง</span>
          <input className="inp" value={repNo({ report_id: Number(f.report_id) || 0 })} readOnly />
          <span className="fld-hint">ย้ายงานซ่อมไปใบอื่นไม่ได้ — ถ้าผิดให้ลบแล้วสร้างใหม่</span>
        </label>
      ) : reportField(f.report_id, (v) => set({ ...f, report_id: v }))}
      <label className="fld">
        <span>ประเภทงาน · Work type</span>
        <input className="inp" readOnly
          value={tradeOf({ report_id: Number(f.report_id) || 0 }) ? workTypeTh(tradeOf({ report_id: Number(f.report_id) || 0 })) : "— เลือกใบแจ้งก่อน —"} />
        <span className="fld-hint">ระบบใช้ประเภทงานของใบแจ้งที่ผูกอยู่ · inherited from the report</span>
      </label>
      {techField(f.technician_id, (v) => set({ ...f, technician_id: v }))}
      {textField("Action · สิ่งที่ทำ", GUIDE.action, f.action, (v) => set({ ...f, action: v }), true)}
      {moneyField(f.cost, (v) => set({ ...f, cost: v }))}
      {dateField("วันที่เริ่มซ่อม · Start date", f.started_at || f.repaired_at, (v) => set({ ...f, started_at: v, repaired_at: v }))}
      {dateField("วันที่ซ่อมเสร็จ · Completed date", f.completed_at || f.repaired_at, (v) => set({ ...f, completed_at: v }))}
      {supplierField(f.supplier_id, (v) => set({ ...f, supplier_id: v }))}
      {textField("P/O No. · ใบสั่งซื้อ", GUIDE.po_no, f.po_no, (v) => set({ ...f, po_no: v }))}
      {dateField("วันที่ P/O · P/O date", f.po_date, (v) => set({ ...f, po_date: v }))}
      {textField("Note · รายละเอียด", GUIDE.note, f.note, (v) => set({ ...f, note: v }), true)}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHead
        icon={Wrench}
        title="Repair Records"
        sub="บันทึกผู้ทำ ค่าใช้จ่าย ไฟล์แนบ · คลิกแถวเพื่อดูข้อมูลเต็ม แก้ไข และดูใบแจ้งที่ผูกอยู่"
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
          title={canEdit ? "บันทึกงานซ่อมใหม่" : "เฉพาะ admin / technician · staff only"}
          onClick={() => { setAdding((v) => !v); setErr(""); }}
        >
          {adding
            ? <><X size={14} aria-hidden /> ปิดฟอร์ม</>
            : <><Plus size={14} aria-hidden /> New repair · บันทึกงานซ่อมใหม่</>}
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
            โหมดแก้ไขเปิดอยู่ — คลิกแถวใดก็ได้เพื่อแก้ไขงานซ่อมนั้น
            <span className="text-soft"> · Edit mode is on: click a row to edit it</span>
          </span>
        </Notice>
      )}

      {adding && (
        <section className="fieldset">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="card-title">New repair · บันทึกงานซ่อมใหม่</h2>
            <span className="text-xs text-soft">งานซ่อมทุกใบต้องผูกกับใบแจ้งเสีย</span>
          </div>
          {formBody(addForm, setAddForm, "new")}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={saveNew}>
              <Save size={14} aria-hidden /> บันทึก · Save repair
            </button>
            <button type="button" className="btn btn-secondary"
              onClick={() => { setAdding(false); setAddForm(blankRepair); setErr(""); }}>
              ยกเลิก · Cancel
            </button>
          </div>
        </section>
      )}

      <Card flush>
        <div className="card-head">
          <h2 className="card-title">ใบงานซ่อมทั้งหมด · All repairs</h2>
          <span className="chip chip-mono" title="แสดง / ทั้งหมด">{shown.length} / {rows.length}</span>
          <span className="chip chip-accent" title="ค่าใช้จ่ายรวมของรายการที่แสดง">รวม {thb(totals.cost)}</span>
          {totals.files > 0 && (
            <span className="chip" title="จำนวนรายการที่มีไฟล์แนบ">
              <Paperclip size={11} aria-hidden /> {totals.files}
            </span>
          )}
          <div className="card-tools">
            <div className="search">
              <Search size={15} className="search-icon" aria-hidden />
              <input className="search-inp" type="search" value={q}
                placeholder="ค้นหา จุด / งานที่ทำ / ช่าง / ผู้รับเหมา / อาการ"
                aria-label="Search repairs"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} />
            </div>
            <span className={`filter-pick${wtFilter ? " is-set" : ""}`}>
              <Filter size={14} aria-hidden />
              <select aria-label="Filter by work type" value={wtFilter}
                onChange={(e) => setWtFilter(e.target.value)}>
                <option value="">ทุกประเภทงาน · All work types ({rows.length})</option>
                {WORK_TYPES.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label} ({wtTabs.get(w.value) ?? 0})
                  </option>
                ))}
                {(wtTabs.get("") ?? 0) > 0 && (
                  <option value="__none">ยังไม่ระบุ · not set ({wtTabs.get("")})</option>
                )}
              </select>
            </span>
            <span className={`filter-pick${yearFilter ? " is-set" : ""}`}>
              <CalendarDays size={14} aria-hidden />
              <select aria-label="Filter by year" value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}>
                <option value="">ทุกปี · All years ({rows.length})</option>
                {yearTabs.map(([y, n]) => (
                  <option key={y} value={y}>
                    {y === "—" ? "ไม่ระบุปี · no date" : y} ({n})
                  </option>
                ))}
              </select>
            </span>
            <span className={`filter-pick${supFilter ? " is-set" : ""}`}>
              <Filter size={14} aria-hidden />
              <select aria-label="Filter by supplier" value={supFilter}
                onChange={(e) => setSupFilter(e.target.value)}>
                <option value="">ทุกราย · All ({rows.length})</option>
                {supTabs.map(([name, n]) => (
                  <option key={name || "__none"} value={name}>
                    {name || "ไม่ใช้ผู้รับเหมา"} ({n})
                  </option>
                ))}
              </select>
            </span>
          </div>
        </div>

        {filtering && (
          <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-2 text-xs text-muted">
            <Filter size={13} className="text-accent" aria-hidden />
            <span>
              กรองอยู่: {supFilter ? `ผู้รับเหมา “${supFilter}”` : "ทุกราย"}
              {wtFilter && <> · ประเภทงาน {wtFilter === "__none" ? "ยังไม่ระบุ" : workTypeTh(wtFilter)}</>}
              {yearFilter && <> · ปี {yearFilter === "—" ? "ไม่ระบุปี" : yearFilter}</>}
              {q.trim() && <> · คำค้น “{q.trim()}”</>} — พบ <strong className="text-ink">{shown.length}</strong> รายการ
            </span>
            <button type="button" className="btn btn-quiet btn-sm ml-auto"
              onClick={() => { setQ(""); setSupFilter(""); setYearFilter(""); setWtFilter(""); }}>
              <X size={13} aria-hidden /> ล้างตัวกรอง · Clear
            </button>
          </div>
        )}

        <div className="tbl-wrap border-0 shadow-none">
          <table className="tbl tbl-dense">
            <colgroup>
              <col style={{ width: 56 }} />
              <col style={{ width: 102 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 78 }} />
              <col style={{ width: 66 }} />
              <col />
              <col style={{ width: 74 }} />
              <col style={{ width: 84 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 84 }} />
              <col style={{ width: 84 }} />
              <col style={{ width: 62 }} />
              <col style={{ width: 62 }} />
              {editMode && <col style={{ width: 34 }} />}
            </colgroup>
            <thead>
              <tr>
                <th title="เลขรัน 1,2,3 เรียงตามเลขที่ใบแจ้ง — ล่างสุด = 1 · running number by report, bottom = 1">No.</th>
                <th>Report</th>
                <th title="สถานะของใบแจ้งที่ผูกอยู่ · งานซ่อมใช้สถานะของใบแจ้ง">สถานะ · Status</th>
                <th title="ประเภทงานของใบแจ้งที่ผูกอยู่ · inherited from the linked report">ประเภทงาน · Work type</th>
                <th>Point</th>
                <th>Action · สิ่งที่ทำ</th>
                <th>P/O No.</th>
                <th>วันที่ P/O · Date</th>
                <th className="text-right">Cost</th>
                <th>Supplier name</th>
                <th>วันที่เริ่มซ่อม · Date</th>
                <th>วันที่ซ่อมเสร็จ · Date</th>
                <th>File (Quotation) and P/R</th>
                <th>File (P/O (ตัวที่มีลายเซ็น))</th>
                {editMode && <th aria-label="Edit" />}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="is-clickable" onClick={() => open(r.id, editMode)}>
                  <td className="num" title={`${r.code || "ไม่มีเลขที่"} · record #${r.id}`}>{order.get(r.id) ?? "—"}</td>
                  <td className="truncate font-mono text-[11px]" title={`ใบแจ้ง · report #${r.report_id}`}>{repNo(r)}</td>
                  <td className="truncate">
                    <span className={statusChip(r.report_status)}>
                      {STATUS_META[r.report_status]?.label ?? r.report_status}
                    </span>
                  </td>
                  <td>
                    {tradeOf(r)
                      ? <span className="chip">{workTypeTh(tradeOf(r))}</span>
                      : <span className="text-soft">—</span>}
                  </td>
                  <td className="truncate" title={`${r.point_code}${r.room_code ? ` · ${r.room_code}` : ""}${r.point_name ? ` · ${r.point_name}` : ""}`}>
                    <span className="code">{r.point_code}</span>
                    {r.room_code && <span className="block truncate text-[11px] text-soft">{r.room_code}{r.point_name ? ` · ${r.point_name}` : ""}</span>}
                  </td>
                  <td title={r.action}>
                    <span className="line-clamp-2">{r.action}</span>
                  </td>
                  <td className="truncate font-mono text-[11px]">{r.po_no || "—"}</td>
                  <td className="truncate font-mono text-[11px]">{thDate(r.po_date)}</td>
                  <td className="num whitespace-nowrap text-[11px]">{thb(r.cost)}</td>
                  <td className="truncate text-muted" title={r.supplier_name || ""}>{r.supplier_name || "—"}</td>
                  <td className="truncate font-mono text-[11px]">{thDate(r.started_at || r.repaired_at)}</td>
                  <td className="truncate font-mono text-[11px]">{thDate(r.completed_at || r.repaired_at)}</td>
                  <td className="whitespace-nowrap">
                    {quotOf(r)
                      ? <a className="inline-flex items-center gap-1 font-semibold text-accent hover:text-accentdeep"
                          href={img(quotOf(r))} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}>
                          <Paperclip size={12} aria-hidden /> open
                        </a>
                      : <span className="text-soft">—</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    {r.po_attachment
                      ? <a className="inline-flex items-center gap-1 font-semibold text-accent hover:text-accentdeep"
                          href={img(r.po_attachment)} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}>
                          <Paperclip size={12} aria-hidden /> open
                        </a>
                      : <span className="text-soft">—</span>}
                  </td>
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
            filtering ? (
              <Empty icon={Search}>
                ไม่พบงานซ่อมที่ตรงกับเงื่อนไข · no repairs match
                <button type="button" className="btn btn-secondary btn-sm mt-1"
                  onClick={() => { setQ(""); setSupFilter(""); setYearFilter(""); setWtFilter(""); }}>
                  ล้างตัวกรอง · Clear filters
                </button>
              </Empty>
            ) : (
              <Empty icon={Inbox}>No repairs recorded · ยังไม่มีงานซ่อม</Empty>
            )
          )}
        </div>
      </Card>

      {detail && (
        <Modal onClose={() => setDetail(null)} labelledBy="rp-title" wide>
          <div className="sheet-head">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs text-soft">Repair #{detail.id} · ใบแจ้ง #{detail.report_id}</p>
              <h2 id="rp-title" className="sheet-title">{detail.action || "ไม่ระบุงานที่ทำ"}</h2>
              <p className="sheet-sub">
                <span className="font-mono">{detail.point_code}</span>
                {detail.point_name && ` · ${detail.point_name}`}
                {detail.room_code && ` · ${detail.room_code}`} · {thDate(detail.repaired_at)}
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
              <p className="stat-value">{thDate(detail.repaired_at)}</p>
              <p className="stat-label">วันที่ซ่อม · repaired</p>
            </div>
            <div className="stat">
              <p className="stat-value">{detail.report?.siblings.length ?? 0}</p>
              <p className="stat-label">ครั้งอื่นในใบนี้ · other visits</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="label m-0">รายละเอียดงานซ่อม · Repair</p>
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
                <dt className="flex items-center gap-1 text-xs text-soft"><FileText size={12} aria-hidden /> เลขที่งาน · Repair no.</dt>
                <dd className="font-mono">{detail.code || `#${detail.id}`}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-soft"><ClipboardList size={12} aria-hidden /> ประเภทงาน · Work type</dt>
                <dd>{tradeOf(detail) ? workTypeTh(tradeOf(detail)) : "—"} <span className="text-xs text-soft">· จากใบแจ้ง {repNo(detail)}</span></dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-soft"><Truck size={12} aria-hidden /> ผู้รับเหมา · Supplier</dt>
                <dd>{detail.supplier_name || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-soft"><FileText size={12} aria-hidden /> P/O No. · Purchase order</dt>
                <dd className="font-mono">{detail.po_no || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-soft"><CalendarDays size={12} aria-hidden /> วันที่ P/O · P/O date</dt>
                <dd className="font-mono">{thDate(detail.po_date)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-soft"><CalendarDays size={12} aria-hidden /> วันที่เริ่มซ่อม · Start date</dt>
                <dd className="font-mono">{iso(detail.started_at ?? detail.repaired_at) || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-soft"><CalendarDays size={12} aria-hidden /> วันที่ซ่อมเสร็จ · Completed date</dt>
                <dd className="font-mono">{iso(detail.completed_at ?? detail.repaired_at) || "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-soft"><FileText size={12} aria-hidden /> File (Quotation) and P/R</dt>
                <dd>
                  {quotOf(detail)
                    ? <a className="font-semibold text-accent hover:text-accentdeep" href={img(quotOf(detail))} target="_blank" rel="noreferrer">เปิดไฟล์ · open</a>
                    : <span className="text-soft">ไม่มีไฟล์แนบ</span>}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="flex items-center gap-1 text-xs text-soft"><FileText size={12} aria-hidden /> File (P/O (ตัวที่มีลายเซ็น))</dt>
                <dd>
                  {detail.po_attachment
                    ? <a className="font-semibold text-accent hover:text-accentdeep" href={img(detail.po_attachment)} target="_blank" rel="noreferrer">เปิดไฟล์ · open</a>
                    : <span className="text-soft">ไม่มีไฟล์แนบ</span>}
                </dd>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-xs text-soft">รายละเอียด · Note</dt>
                <dd>{detail.note || "—"}</dd>
              </div>
            </dl>
          ) : (
            <div className="mt-2 grid gap-3">
              {formBody(form, setForm, "edit")}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={saveEdit}>
                  <Save size={14} aria-hidden /> บันทึก · Save
                </button>
                <button type="button" className="btn btn-secondary"
                  onClick={() => {
                    setEditing(false); setErr("");
                    setForm({
                      report_id: String(detail.report_id),
                      technician_id: detail.technician_id ? String(detail.technician_id) : "",
                      action: detail.action || "", cost: String(detail.cost ?? 0),
                      repaired_at: iso(detail.repaired_at), started_at: iso(detail.started_at ?? detail.repaired_at),
                      completed_at: iso(detail.completed_at ?? detail.repaired_at), note: detail.note || "", po_no: detail.po_no || "",
                      po_date: iso(detail.po_date),
                      quotation_attachment: detail.quotation_attachment || "", po_attachment: detail.po_attachment || "",
                      supplier_id: detail.supplier_id ? String(detail.supplier_id) : "",
                    });
                  }}>
                  ยกเลิก · Cancel
                </button>
              </div>
            </div>
          )}

          {canEdit && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="fld">
                <span>แนบไฟล์ · File (P/O (ตัวที่มีลายเซ็น))</span>
                <input type="file" className="inp" accept="image/*,.pdf"
                  onChange={(e) => e.target.files && upload(`/api/repairs/${detail.id}/po`, e.target.files[0]).then(() => reopen(detail.id)).catch((err) => setErr(String(err)))} />
                <span className="fld-hint">แนบ P/O ตัวที่มีลายเซ็น / signed purchase order</span>
              </label>
              <label className="fld">
                <span>ไฟล์ใบเสนอราคา · File (Quotation) and P/R</span>
                <input className="inp" readOnly value={quotOf(detail) ? "แนบไว้ที่ใบแจ้งแล้ว — ดูด้านล่าง" : "ยังไม่มีไฟล์ — แนบที่หน้า “แจ้งเสีย”"} />
                <span className="fld-hint">ไฟล์นี้แนบที่ใบแจ้งเสีย ({repNo(detail)}) · attached on the Fault Reports screen</span>
              </label>
            </div>
          )}

          {/* ── The report this repair belongs to ─────────────── */}
          <p className="label mt-5">ใบแจ้งที่ผูกอยู่ · Linked report</p>
          {detail.report ? (
            <div className="mt-2 grid gap-2 rounded-control border border-rule p-3 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <ClipboardList size={14} className="shrink-0 text-accent" aria-hidden />
                <span className="font-mono text-xs text-soft">{repNo(detail)}</span>
                <span className="font-semibold">{detail.report.symptom}</span>
                <span className={statusChip(detail.report.status)}>
                  {STATUS_META[detail.report.status]?.label ?? detail.report.status}
                </span>
              </p>
              <p className="text-xs text-soft">
                แจ้งโดย {detail.report.reporter_name || "—"} · {thDate(detail.report.reported_at)}
                {detail.report.note && ` · ${detail.report.note}`}
              </p>
              <p className="text-xs">
                <span className="font-mono">{detail.report.point_code}</span>
                {detail.report.point_name && ` · ${detail.report.point_name}`}
                {detail.report.room_code && ` · ${detail.report.room_code}`}
              </p>
              {detail.report.photo && (
                <img src={img(detail.report.photo)} alt="Fault" className="max-h-40 w-full rounded-control border border-rule object-contain" />
              )}
              {(detail.report.siblings ?? []).length > 0 && (
                <>
                  <p className="label mt-1">ครั้งอื่นที่ซ่อมใบนี้ · Other repairs on this report</p>
                  <ul className="space-y-1.5 text-xs">
                    {detail.report.siblings.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-baseline gap-x-2 rounded-input border border-rule px-2.5 py-1.5 text-ink2">
                        <span className="font-mono text-soft">{thDate(s.repaired_at)}</span>
                        <span className="min-w-0 flex-1">{s.action}</span>
                        <span className="text-soft">{s.technician_name}</span>
                        <span className="font-mono">{thb(s.cost)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <p className="mt-2 rounded-control border border-dashed border-rulestrong px-3 py-3 text-xs text-soft">
              ไม่พบใบแจ้งต้นทาง · no linked report
            </p>
          )}

          <button type="button" className="btn btn-secondary btn-block mt-4" onClick={() => setDetail(null)}>Close · ปิด</button>
        </Modal>
      )}
    </div>
  );
}
