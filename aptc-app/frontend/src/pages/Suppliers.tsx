import { useEffect, useMemo, useState } from "react";
import {
  Truck, Plus, Inbox, X, SquarePen, UserPlus, Save, ListChecks,
  BadgeCheck, Phone, Mail, MessageCircle, Pencil, Check, Search, Filter, TriangleAlert,
} from "lucide-react";
import { api, getUser } from "../lib/api";
import { PageHead, Panel as Card, Empty, Notice, Modal } from "../components/ui";

interface Sup {
  id: number; company: string; work_type: string; work_types: string[]; contact_name: string;
  phone: string; line_id: string; email: string; notes: string; is_active: boolean;
  repair_count: number; total_cost: number;
  contact_changes: number; contact_since: string | null; past_contacts: string[];
}
interface Contact {
  id: number; name: string; phone: string; line_id: string; email: string; note: string;
  started_at: string | null; ended_at: string | null; is_current: boolean;
}
interface SupDetail extends Sup {
  current_contact: { name: string; phone: string; line_id: string; email: string; since: string | null };
  contacts: Contact[];
  repairs: { id: number; report_id: number; action: string; cost: number; repaired_at: string | null; point_code: string }[];
}

/** What to type in each field — shown as placeholder + hint so staff don't guess. */
const GUIDE = {
  company: { ph: "เช่น บริษัท สยาม อิเล็คทริค จำกัด", hint: "ชื่อนิติบุคคลตามใบเสนอราคา" },
  work_types: { ph: "เพิ่มประเภทงานใหม่ เช่น ซ่อมประตูอัตโนมัติ", hint: "เลือกได้หลายอย่าง — บริษัทเดียวรับได้ 2–3 งาน" },
  contact: { ph: "เช่น คุณสมชาย ใจดี", hint: "ชื่อ-นามสกุลคนที่เราคุยด้วยจริง" },
  phone: { ph: "08x-xxx-xxxx", hint: "มือถือ หรือเบอร์ออฟฟิศ" },
  line: { ph: "เช่น siam.elec", hint: "LINE ID หรือ @official" },
  email: { ph: "name@company.co.th", hint: "อีเมลที่ใช้ส่งใบเสนอราคา" },
  note: { ph: "เช่น เปลี่ยนผู้ดูแลเขต / ลาออก", hint: "บันทึกไว้ในประวัติผู้ติดต่อ" },
};

const blankSup = { company: "", work_types: [] as string[], contact_name: "", phone: "", line_id: "", email: "" };
const blankContact = { name: "", phone: "", line_id: "", email: "", note: "" };

/** Multi-select over the trades already in use, plus a box for a new one.
 *  `onChange` takes an updater so two fast toggles can't clobber each other. */
function WorkTypePicker({
  value, onChange, options,
}: {
  value: string[];
  onChange: (updater: (prev: string[]) => string[]) => void;
  options: string[];
}) {
  const [draft, setDraft] = useState("");
  const has = (n: string) => value.some((v) => v.toLowerCase() === n.toLowerCase());
  const choices = useMemo(() => {
    const seen = new Set(value.map((v) => v.toLowerCase()));
    return [...value, ...options.filter((o) => !seen.has(o.toLowerCase()))];
  }, [value, options]);

  const toggle = (name: string) =>
    onChange((prev) => prev.some((v) => v.toLowerCase() === name.toLowerCase())
      ? prev.filter((v) => v.toLowerCase() !== name.toLowerCase())
      : [...prev, name]);

  const addDraft = () => {
    const v = draft.trim();
    if (!v) return;
    onChange((prev) => (prev.some((x) => x.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]));
    setDraft("");
  };

  return (
    <div className="pick">
      <div className="pick-row">
        {choices.map((name) => {
          const on = has(name);
          return (
            <button key={name} type="button" aria-pressed={on}
              className={`pick-chip${on ? " is-on" : ""}`} onClick={() => toggle(name)}>
              {on && <Check size={12} aria-hidden />}{name}
            </button>
          );
        })}
        {choices.length === 0 && (
          <span className="text-xs text-soft">ยังไม่มีประเภทงานในระบบ — พิมพ์เพิ่มด้านล่างได้เลย</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="inp min-w-0 flex-1 basis-48" placeholder={GUIDE.work_types.ph}
          aria-label="Add a new work type" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDraft(); } }} />
        <button type="button" className="btn btn-secondary" onClick={addDraft} disabled={!draft.trim()}>
          <Plus size={14} aria-hidden /> เพิ่มประเภท
        </button>
      </div>
      <span className="fld-hint">{GUIDE.work_types.hint}</span>
    </div>
  );
}

const SORTS = [
  { value: "company", label: "ชื่อบริษัท A–Z · Company" },
  { value: "jobs", label: "งานซ่อมมากสุด · Most jobs" },
  { value: "cost", label: "ค่าใช้จ่ายสูงสุด · Highest cost" },
  { value: "changes", label: "เปลี่ยนผู้ติดต่อมากสุด · Most changes" },
];

const day = (s: string | null) => (s ? s.slice(0, 10) : "");
const thDate = (s: string | null) => {
  if (!s) return "";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const period = (c: Contact) => {
  const from = c.started_at ? thDate(c.started_at) : "ไม่ทราบวันเริ่ม";
  return c.is_current ? `ตั้งแต่ ${from}` : `${from} – ${thDate(c.ended_at)}`;
};
const thb = (n: number) => `฿${Number(n || 0).toLocaleString()}`;

export default function Suppliers() {
  const [rows, setRows] = useState<Sup[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState(blankSup);
  const [detail, setDetail] = useState<SupDetail | null>(null);
  const [editingInfo, setEditingInfo] = useState(false);
  const [changingContact, setChangingContact] = useState(false);
  const [infoForm, setInfoForm] = useState({ company: "", work_types: [] as string[], notes: "" });
  const [cForm, setCForm] = useState(blankContact);
  const [q, setQ] = useState("");
  const [workType, setWorkType] = useState("");
  const [sort, setSort] = useState("company");
  const isAdmin = getUser()?.role === "admin";

  const load = async () => setRows(await api("/api/suppliers"));
  useEffect(() => { load().catch((e) => setErr(String(e))); }, []);

  /* Everything the search box looks at — including people who used to handle
     the account, so "who was our contact at X?" is answerable. */
  const haystack = (s: Sup) =>
    [s.company, ...(s.work_types ?? []), s.contact_name, s.phone, s.line_id, s.email, s.notes,
     ...(s.past_contacts ?? [])].join(" ").toLowerCase();

  /* Trades in use, most-covered first — feeds both the filter tabs and the picker. */
  const workTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of rows) {
      for (const raw of s.work_types ?? []) {
        const k = raw.trim();
        if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rows]);

  const workTypeOptions = useMemo(() => workTypes.map(([n]) => n), [workTypes]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((s) =>
      (!workType || (s.work_types ?? []).includes(workType)) &&
      (!needle || haystack(s).includes(needle)));
    const by: Record<string, (a: Sup, b: Sup) => number> = {
      company: (a, b) => a.company.localeCompare(b.company),
      jobs: (a, b) => b.repair_count - a.repair_count || a.company.localeCompare(b.company),
      cost: (a, b) => b.total_cost - a.total_cost || a.company.localeCompare(b.company),
      changes: (a, b) => b.contact_changes - a.contact_changes || a.company.localeCompare(b.company),
    };
    return [...list].sort(by[sort] ?? by.company);
  }, [rows, q, workType, sort]);

  const filtering = q.trim() !== "" || workType !== "";

  /* The API grew `work_types` / `contacts` over time. If an older server is
     still running, say so plainly instead of quietly showing half the screen. */
  const staleApi = rows.length > 0 && rows.every((s) => !Array.isArray(s.work_types));

  const open = async (id: number, startEditing = false) => {
    try {
      const d = await api<SupDetail>(`/api/suppliers/${id}`);
      setDetail(d);
      setInfoForm({ company: d.company, work_types: d.work_types ?? [], notes: d.notes || "" });
      setCForm(blankContact);
      setEditingInfo(startEditing);
      setChangingContact(false);
      setErr("");
    } catch (e) {
      setErr(String(e));
    }
  };
  const reopen = async (id: number) => { await open(id, false); await load(); };

  /** Every write goes through here so a failed request surfaces instead of
   *  silently doing nothing (or taking the page down). */
  const run = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { setErr(String(e)); }
  };

  const saveInfo = () => run(async () => {
    if (!detail) return;
    if (!infoForm.company.trim()) { setErr("กรอกชื่อบริษัทก่อนบันทึก · company is required"); return; }
    await api(`/api/suppliers/${detail.id}`, { method: "PUT", body: JSON.stringify(infoForm) });
    setErr("");
    setMsg(`บันทึกข้อมูล ${infoForm.company} แล้ว · supplier updated`);
    await reopen(detail.id);
  });

  const saveContact = () => run(async () => {
    if (!detail) return;
    if (!cForm.name.trim()) { setErr("กรอกชื่อผู้ติดต่อก่อนบันทึก · contact name is required"); return; }
    await api(`/api/suppliers/${detail.id}/contacts`, { method: "POST", body: JSON.stringify(cForm) });
    setErr("");
    setMsg(`เปลี่ยนผู้ติดต่อเป็น “${cForm.name}” แล้ว — คนเดิมถูกเก็บไว้ในประวัติ`);
    await reopen(detail.id);
  });

  const addSupplier = () => run(async () => {
    if (!addForm.company.trim()) { setErr("กรอกชื่อบริษัทก่อนบันทึก · company is required"); return; }
    await api("/api/suppliers", { method: "POST", body: JSON.stringify(addForm) });
    setErr("");
    setMsg(`เพิ่ม ${addForm.company} แล้ว · supplier added`);
    setAddForm(blankSup);
    setAdding(false);
    await load();
  });

  /* The detail sheet tolerates a lean response: older/partial payloads just
     render less, they never take the page down. */
  const contacts: Contact[] = detail?.contacts ?? [];
  const past = contacts.filter((c) => !c.is_current);
  const repairs = detail?.repairs ?? [];
  const current = detail
    ? (detail.current_contact ?? {
        name: detail.contact_name, phone: detail.phone,
        line_id: detail.line_id, email: detail.email, since: null,
      })
    : null;

  return (
    <div className="space-y-6">
      <PageHead
        icon={Truck}
        title="Suppliers"
        sub="ซัพพลายเออร์และงานที่เกี่ยวข้อง · คลิกแถวเพื่อดูข้อมูลเต็ม แก้ไข และดูประวัติผู้ติดต่อ"
      >
        <button
          type="button"
          className="switch"
          aria-pressed={editMode}
          disabled={!isAdmin}
          title={isAdmin ? "เปิดเพื่อแก้ไขข้อมูล" : "เฉพาะ admin เท่านั้น · admin only"}
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
          title={isAdmin ? "เพิ่มซัพพลายเออร์ใหม่" : "เฉพาะ admin เท่านั้น · admin only"}
          onClick={() => { setAdding((v) => !v); setErr(""); }}
        >
          {adding ? <><X size={14} aria-hidden /> ปิดฟอร์ม</> : <><Plus size={14} aria-hidden /> Add supplier · เพิ่มซัพพลายเออร์</>}
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
          <span className="min-w-0 flex-1">{err}</span>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setErr("")} aria-label="Dismiss"><X size={13} /></button>
        </Notice>
      )}
      {staleApi && (
        <Notice tone="warn">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            เซิร์ฟเวอร์ที่ต่ออยู่ยังเป็นเวอร์ชันเก่า — ยังไม่มีประเภทงานหลายค่าและประวัติผู้ติดต่อ
            <span className="text-soft"> · กรุณาปิดหน้าต่าง backend แล้วเปิดใหม่ (รัน start.bat อีกครั้ง)</span>
          </span>
        </Notice>
      )}
      {editMode && (
        <Notice>
          <Pencil size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1">
            โหมดแก้ไขเปิดอยู่ — คลิกแถวใดก็ได้เพื่อแก้ไขข้อมูลและเปลี่ยนผู้ติดต่อ
            <span className="text-soft"> · Edit mode is on: click a row to edit it</span>
          </span>
        </Notice>
      )}

      {adding && (
        <section className="fieldset">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="card-title">Add supplier · เพิ่มซัพพลายเออร์</h2>
            <span className="text-xs text-soft">กรอกเท่าที่มี — เว้นว่างได้</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="fld">
              <span>Company · บริษัท</span>
              <input className="inp" placeholder={GUIDE.company.ph} value={addForm.company}
                onChange={(e) => setAddForm({ ...addForm, company: e.target.value })} />
              <span className="fld-hint">{GUIDE.company.hint}</span>
            </label>
            <div className="fld md:col-span-3">
              <span>Work types · ประเภทงานที่รับ</span>
              <WorkTypePicker value={addForm.work_types} options={workTypeOptions}
                onChange={(fn) => setAddForm((f) => ({ ...f, work_types: fn(f.work_types) }))} />
            </div>
            <label className="fld">
              <span>Contact · ผู้ติดต่อ</span>
              <input className="inp" placeholder={GUIDE.contact.ph} value={addForm.contact_name}
                onChange={(e) => setAddForm({ ...addForm, contact_name: e.target.value })} />
              <span className="fld-hint">{GUIDE.contact.hint}</span>
            </label>
            <label className="fld">
              <span>Phone · โทร</span>
              <input className="inp" placeholder={GUIDE.phone.ph} value={addForm.phone}
                onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} />
              <span className="fld-hint">{GUIDE.phone.hint}</span>
            </label>
            <label className="fld">
              <span>LINE</span>
              <input className="inp" placeholder={GUIDE.line.ph} value={addForm.line_id}
                onChange={(e) => setAddForm({ ...addForm, line_id: e.target.value })} />
              <span className="fld-hint">{GUIDE.line.hint}</span>
            </label>
            <label className="fld">
              <span>Email</span>
              <input className="inp" placeholder={GUIDE.email.ph} value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
              <span className="fld-hint">{GUIDE.email.hint}</span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={addSupplier}>
              <Save size={14} aria-hidden /> บันทึก · Save supplier
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { setAdding(false); setAddForm(blankSup); setErr(""); }}>
              ยกเลิก · Cancel
            </button>
          </div>
        </section>
      )}

      <Card flush>
        <div className="card-head">
          <h2 className="card-title">ซัพพลายเออร์ทั้งหมด · All suppliers</h2>
          <span className="chip chip-mono" title="แสดง / ทั้งหมด">
            {shown.length} / {rows.length}
          </span>
          <div className="card-tools">
            <div className="search">
              <Search size={15} className="search-icon" aria-hidden />
              <input
                className="search-inp"
                type="search"
                value={q}
                placeholder="ค้นหา บริษัท / ผู้ติดต่อ / เบอร์ / LINE / อีเมล"
                aria-label="Search suppliers"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
              />
            </div>
            <span className={`filter-pick${workType ? " is-set" : ""}`}>
              <Filter size={14} aria-hidden />
              <select aria-label="Filter by work type" value={workType}
                onChange={(e) => setWorkType(e.target.value)}>
                <option value="">ทุกประเภทงาน · All trades ({rows.length})</option>
                {workTypes.map(([wt, n]) => (
                  <option key={wt} value={wt}>{wt} ({n})</option>
                ))}
              </select>
            </span>
            <select className="inp" aria-label="Sort suppliers"
              value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {filtering && (
          <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-2 text-xs text-muted">
            <Filter size={13} className="text-accent" aria-hidden />
            <span>
              กรองอยู่: {workType ? `ประเภทงาน “${workType}”` : "ทุกประเภทงาน"}
              {q.trim() && <> · คำค้น “{q.trim()}”</>} — พบ <strong className="text-ink">{shown.length}</strong> รายการ
            </span>
            <button type="button" className="btn btn-quiet btn-sm ml-auto"
              onClick={() => { setQ(""); setWorkType(""); }}>
              <X size={13} aria-hidden /> ล้างตัวกรอง · Clear
            </button>
          </div>
        )}

        <div className="tbl-wrap border-0 shadow-none">
          <table className="tbl">
            <thead>
              <tr>
                <th>Company</th>
                <th>Work type</th>
                <th>ผู้ติดต่อล่าสุด · Latest contact</th>
                <th>Phone / LINE</th>
                <th className="text-right">Jobs</th>
                <th className="text-right">Cost</th>
                {editMode && <th aria-label="Edit" />}
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className="is-clickable" onClick={() => open(s.id, editMode)}>
                  <td className="font-semibold">
                    {s.company}
                    {s.notes && <span className="block text-xs font-normal text-soft">{s.notes}</span>}
                  </td>
                  <td>
                    {(s.work_types ?? []).length > 0 ? (
                      <span className="flex flex-wrap items-center gap-1">
                        {s.work_types.slice(0, 2).map((w) => (
                          <span key={w} className="chip">{w}</span>
                        ))}
                        {s.work_types.length > 2 && (
                          <span className="chip chip-mono" title={s.work_types.join(" · ")}>
                            +{s.work_types.length - 2}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-soft">—</span>
                    )}
                  </td>
                  <td>
                    {s.contact_name ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="chip chip-accent">{s.contact_name}</span>
                        <span className="text-xs text-soft">
                          {s.contact_since ? `ตั้งแต่ ${thDate(s.contact_since)}` : "ไม่ทราบวันเริ่ม"}
                        </span>
                        {s.contact_changes > 0 && (
                          <span className="chip chip-mono" title="จำนวนครั้งที่เปลี่ยนผู้ติดต่อ">
                            เปลี่ยนมาแล้ว {s.contact_changes} ครั้ง
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-soft">ยังไม่ระบุ · none</span>
                    )}
                  </td>
                  <td className="font-mono text-xs">
                    {s.phone || "—"}<br />{s.line_id || ""}
                  </td>
                  <td className="num">{s.repair_count}</td>
                  <td className="num">{thb(s.total_cost)}</td>
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
                ไม่พบซัพพลายเออร์ที่ตรงกับเงื่อนไข · no suppliers match
                <button type="button" className="btn btn-secondary btn-sm mt-1"
                  onClick={() => { setQ(""); setWorkType(""); }}>
                  ล้างตัวกรอง · Clear filters
                </button>
              </Empty>
            ) : (
              <Empty icon={Inbox}>No suppliers yet · ยังไม่มีซัพพลายเออร์</Empty>
            )
          )}
        </div>
      </Card>

      {detail && current && (
        <Modal onClose={() => setDetail(null)} labelledBy="sup-title" wide>          <div className="sheet-head">
            <div className="min-w-0 flex-1">
              <h2 id="sup-title" className="sheet-title">{detail.company}</h2>
              <p className="sheet-sub">
                {(detail.work_types ?? []).length
                  ? `${detail.work_types.length} ประเภทงาน · ${detail.work_types.join(" · ")}`
                  : "ไม่ระบุประเภทงาน"}
              </p>
            </div>
            <button type="button" className="btn btn-icon" aria-label="Close" onClick={() => setDetail(null)}><X size={16} /></button>
          </div>

          <div className="stat-strip">
            <div className="stat">
              <p className="stat-value">{detail.repair_count}</p>
              <p className="stat-label">งานซ่อม · jobs</p>
            </div>
            <div className="stat">
              <p className="stat-value">{thb(detail.total_cost)}</p>
              <p className="stat-label">ค่าใช้จ่ายรวม · total cost</p>
            </div>
            <div className="stat">
              <p className="stat-value">{detail.contact_changes}</p>
              <p className="stat-label">ครั้งที่เปลี่ยนผู้ติดต่อ · contacts changed</p>
            </div>
          </div>

          {/* ── Current contact ─────────────────────────────────── */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="label m-0">ผู้ติดต่อล่าสุด · Current contact</p>
            {isAdmin && !changingContact && (
              <button type="button" className="btn btn-secondary btn-sm ml-auto"
                onClick={() => { setChangingContact(true); setErr(""); }}>
                <UserPlus size={13} aria-hidden /> เปลี่ยนผู้ติดต่อ · Change
              </button>
            )}
          </div>

          {!changingContact ? (
            current.name ? (
              <div className="contact-now mt-2">
                <p className="flex flex-wrap items-center gap-2">
                  <BadgeCheck size={15} className="shrink-0 text-accent" aria-hidden />
                  <span className="font-display text-md font-bold">{current.name}</span>
                  <span className="chip chip-accent">ล่าสุด · current</span>
                </p>
                <p className="contact-when">
                  {current.since ? `รับช่วงตั้งแต่ ${thDate(current.since)}` : "ไม่ทราบวันเริ่ม (ข้อมูลก่อนเปิดใช้ระบบประวัติ)"}
                </p>
                <div className="contact-line">
                  {current.phone && <span className="inline-flex items-center gap-1"><Phone size={12} aria-hidden /> {current.phone}</span>}
                  {current.line_id && <span className="inline-flex items-center gap-1"><MessageCircle size={12} aria-hidden /> {current.line_id}</span>}
                  {current.email && <span className="inline-flex items-center gap-1"><Mail size={12} aria-hidden /> {current.email}</span>}
                </div>
              </div>
            ) : (
              <p className="mt-2 rounded-control border border-dashed border-rulestrong px-3 py-3 text-xs text-soft">
                ยังไม่ระบุผู้ติดต่อ · no contact on file yet
              </p>
            )
          ) : (
            <div className="contact-now mt-2">
              <p className="flex items-center gap-2">
                <UserPlus size={15} className="shrink-0 text-accent" aria-hidden />
                <span className="font-display text-sm font-bold">เปลี่ยนผู้ติดต่อ · Change contact</span>
              </p>
              <p className="text-xs text-soft">
                คนเดิม ({current.name || "ไม่ระบุ"}) จะถูกปิดช่วงและเก็บไว้ในประวัติอัตโนมัติ
              </p>
              {cForm.name.trim() !== "" && cForm.name.trim() === (current.name || "").trim() && (
                <p className="notice notice-accent text-xs">
                  <Check size={14} className="mt-0.5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    ชื่อเดิม — ระบบจะอัปเดตเบอร์ / LINE / อีเมล ของคนเดิม ไม่เพิ่มประวัติใหม่
                  </span>
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="fld">
                  <span>ชื่อผู้ติดต่อใหม่ · New contact</span>
                  <input className="inp" placeholder={GUIDE.contact.ph} value={cForm.name}
                    onChange={(e) => setCForm({ ...cForm, name: e.target.value })} />
                  <span className="fld-hint">{GUIDE.contact.hint}</span>
                </label>
                <label className="fld">
                  <span>Phone · โทร</span>
                  <input className="inp" placeholder={GUIDE.phone.ph} value={cForm.phone}
                    onChange={(e) => setCForm({ ...cForm, phone: e.target.value })} />
                  <span className="fld-hint">{GUIDE.phone.hint}</span>
                </label>
                <label className="fld">
                  <span>LINE</span>
                  <input className="inp" placeholder={GUIDE.line.ph} value={cForm.line_id}
                    onChange={(e) => setCForm({ ...cForm, line_id: e.target.value })} />
                  <span className="fld-hint">{GUIDE.line.hint}</span>
                </label>
                <label className="fld">
                  <span>Email</span>
                  <input className="inp" placeholder={GUIDE.email.ph} value={cForm.email}
                    onChange={(e) => setCForm({ ...cForm, email: e.target.value })} />
                  <span className="fld-hint">{GUIDE.email.hint}</span>
                </label>
                <label className="fld sm:col-span-2">
                  <span>หมายเหตุการเปลี่ยน · Reason (optional)</span>
                  <input className="inp" placeholder={GUIDE.note.ph} value={cForm.note}
                    onChange={(e) => setCForm({ ...cForm, note: e.target.value })} />
                  <span className="fld-hint">{GUIDE.note.hint}</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={saveContact}>
                  <Save size={14} aria-hidden /> บันทึกผู้ติดต่อใหม่
                </button>
                <button type="button" className="btn btn-secondary"
                  onClick={() => { setChangingContact(false); setCForm(blankContact); setErr(""); }}>
                  ยกเลิก · Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Contact history ─────────────────────────────────── */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <p className="label m-0">ประวัติผู้ติดต่อ · Contact history</p>
            <span className="chip chip-mono">{past.length}</span>
          </div>
          <ul className="mt-2 space-y-2">
            {past.map((c) => (
              <li key={c.id} className="contact-past">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-sm font-bold">{c.name || "ไม่ระบุชื่อ"}</span>
                  <span className="chip chip-idle">คนก่อน · previous</span>
                </p>
                <p className="contact-when">{period(c)}</p>
                <div className="contact-line">
                  {c.phone && <span className="inline-flex items-center gap-1"><Phone size={12} aria-hidden /> {c.phone}</span>}
                  {c.line_id && <span className="inline-flex items-center gap-1"><MessageCircle size={12} aria-hidden /> {c.line_id}</span>}
                  {c.email && <span className="inline-flex items-center gap-1"><Mail size={12} aria-hidden /> {c.email}</span>}
                </div>
                {c.note && <p className="text-xs text-muted">เหตุผล · {c.note}</p>}
              </li>
            ))}
            {past.length === 0 && (
              <li className="flex items-center gap-2 rounded-control border border-dashed border-rulestrong px-3 py-3 text-xs text-soft">
                <ListChecks size={15} aria-hidden /> ยังไม่มีประวัติการเปลี่ยนผู้ติดต่อ · no previous contacts
              </li>
            )}
          </ul>

          {/* ── Company details ─────────────────────────────────── */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <p className="label m-0">ข้อมูลบริษัท · Company</p>
            {isAdmin && !editingInfo && (
              <button type="button" className="btn btn-secondary btn-sm ml-auto"
                onClick={() => { setEditingInfo(true); setErr(""); }}>
                <SquarePen size={13} aria-hidden /> แก้ไข · Edit
              </button>
            )}
          </div>

          {!editingInfo ? (
            <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-xs text-soft">Company · บริษัท</dt>
                <dd className="font-semibold">{detail.company}</dd>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-xs text-soft">Work types · ประเภทงานที่รับ</dt>
                <dd>
                  {(detail.work_types ?? []).length ? (
                    <span className="flex flex-wrap gap-1">
                      {detail.work_types.map((w) => <span key={w} className="chip chip-accent">{w}</span>)}
                    </span>
                  ) : "—"}
                </dd>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-xs text-soft">Notes · หมายเหตุ</dt>
                <dd>{detail.notes || "—"}</dd>
              </div>
            </dl>
          ) : (
            <div className="mt-2 grid gap-3">
              <label className="fld">
                <span>Company · บริษัท</span>
                <input className="inp" placeholder={GUIDE.company.ph} value={infoForm.company}
                  onChange={(e) => setInfoForm({ ...infoForm, company: e.target.value })} />
                <span className="fld-hint">{GUIDE.company.hint}</span>
              </label>
              <div className="fld">
                <span>Work types · ประเภทงานที่รับ</span>
                <WorkTypePicker value={infoForm.work_types} options={workTypeOptions}
                  onChange={(fn) => setInfoForm((f) => ({ ...f, work_types: fn(f.work_types) }))} />
              </div>
              <label className="fld">
                <span>Notes · หมายเหตุ</span>
                <input className="inp" placeholder="เช่น เข้าพื้นที่ต้องนัดล่วงหน้า 1 วัน"
                  value={infoForm.notes} onChange={(e) => setInfoForm({ ...infoForm, notes: e.target.value })} />
                <span className="fld-hint">ข้อมูลที่ทีมช่างควรรู้ก่อนติดต่อ</span>
              </label>
              <p className="text-xs text-soft">
                การแก้ไขตรงนี้ไม่แตะผู้ติดต่อ — ใช้ปุ่ม “เปลี่ยนผู้ติดต่อ” เพื่อสลับคนและเก็บประวัติ
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={saveInfo}>
                  <Save size={14} aria-hidden /> บันทึก · Save
                </button>
                <button type="button" className="btn btn-secondary"
                  onClick={() => {
                    setEditingInfo(false); setErr("");
                    setInfoForm({ company: detail.company, work_types: detail.work_types ?? [], notes: detail.notes || "" });
                  }}>
                  ยกเลิก · Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Linked repairs ──────────────────────────────────── */}
          <p className="label mt-5">งานซ่อมที่เกี่ยวข้อง · Linked repairs ({repairs.length})</p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {repairs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 rounded-input border border-rule px-2.5 py-1.5 text-ink2">
                <span className="font-mono font-semibold">{r.point_code || `#${r.report_id}`}</span>
                <span className="min-w-0 flex-1">{r.action}</span>
                <span className="font-mono">{thb(r.cost)}</span>
                <span className="font-mono text-soft">{day(r.repaired_at)}</span>
              </li>
            ))}
            {repairs.length === 0 && <li className="text-soft">ยังไม่มีงานซ่อมที่อ้างถึง · no linked jobs</li>}
          </ul>

          <button type="button" className="btn btn-secondary btn-block mt-4" onClick={() => setDetail(null)}>Close · ปิด</button>
        </Modal>
      )}
    </div>
  );
}
