import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Filter, ImagePlus, Inbox, Paperclip, Plus, X } from "lucide-react";
import { api, getUser, img, upload, STATUS_META, WORK_TYPES, workTypeTh } from "../lib/api";
import { PageHead, Panel, Empty, Notice, Modal } from "../components/ui";
import ReportFault from "../components/ReportFault";

interface Rep {
  id: number; install_point_id: number; point_code: string; symptom: string;
  photo: string; reporter_name: string; reported_at: string; status: string; note: string;
  code: string; work_type: string; quotation_attachment: string;
}
interface PointOpt { id: number; code: string; name_en?: string; room_code?: string; category_name?: string }

const FILTERS = [
  { value: "", label: "All", th: "ทั้งหมด" },
  { value: "reported", label: "Reported", th: "แจ้งเสีย" },
  { value: "waiting", label: "Waiting", th: "รอซ่อม" },
  { value: "repairing", label: "Repairing", th: "กำลังซ่อม" },
  { value: "done", label: "Done", th: "เสร็จสิ้น" },
];

export default function Reports() {
  const [rows, setRows] = useState<Rep[]>([]);
  const [f, setF] = useState("");
  const [wt, setWt] = useState("");
  const [detail, setDetail] = useState<(Rep & { repairs: { id: number; action: string; cost: number; repaired_at: string; technician_name: string }[] }) | null>(null);
  const [msg, setMsg] = useState("");
  const [points, setPoints] = useState<PointOpt[]>([]);
  const [reporting, setReporting] = useState(false);
  const user = getUser();
  const canTriage = !!user && (user.role === "admin" || user.role === "technician");

  const load = async () => setRows(await api<Rep[]>("/api/reports"));
  useEffect(() => { load().catch((e) => setMsg(String(e))); }, []);
  /* The report-fault form needs the point list only when it is opened. */
  const openReportFault = async () => {
    setReporting(true);
    if (points.length === 0) {
      try { setPoints(await api<PointOpt[]>("/api/points")); }
      catch (e) { setMsg(String(e)); }
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { "": rows.length };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);
  const shown = rows.filter((r) =>
    (!f || r.status === f) && (!wt || (r.work_type || "") === (wt === "__none" ? "" : wt)));

  /* ใบแจ้งเก่ายังไม่มีประเภทงาน — โชว์เป็น "ไม่ระบุ" ให้เลือกกรองได้เหมือนกัน */
  const wtCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) {
      const k = r.work_type || "";
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [rows]);

  const open = async (id: number) => setDetail(await api<typeof detail>(`/api/reports/${id}`));
  const advance = async (status: string) => {
    if (!detail) return;
    await api(`/api/reports/${detail.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setMsg(`Report ${detail.code || "#" + detail.id} → ${status}`);
    open(detail.id); load();
  };
  const onPhoto = async (file: File) => {
    if (!detail) return;
    const r = await upload(`/api/reports/${detail.id}/photo`, file);
    setMsg(`Photo saved: ${r.photo}`);
    open(detail.id); load();
  };
  /* File (Quotation) and P/R — moved here from the Repair Records screen. */
  const onQuotation = async (file: File) => {
    if (!detail) return;
    await upload(`/api/reports/${detail.id}/quotation`, file);
    setMsg(`แนบไฟล์ใบเสนอราคา + P/R แล้ว · quotation saved`);
    open(detail.id); load();
  };

  return (
    <div className="space-y-6">
      <PageHead
        icon={ClipboardList}
        title="Fault Reports"
        sub="ติดตามสถานะ ปกติ → แจ้งเสีย → รอซ่อม → กำลังซ่อม → เสร็จสิ้น · Track every reported fault"
      >
        <button type="button" className="btn btn-primary" onClick={openReportFault}
          title="แจ้งเสียใหม่ · report a fault from this screen">
          <Plus size={14} aria-hidden /> แจ้งเสีย · Report fault
        </button>
      </PageHead>

      {reporting && (
        <ReportFault
          points={points}
          onClose={() => setReporting(false)}
          onDone={(code) => { setMsg(`แจ้งเสียแล้ว · ${code}`); load().catch((e) => setMsg(String(e))); }}
        />
      )}

      {msg && (
        <Notice tone="accent">
          <span className="min-w-0 flex-1">{msg}</span>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setMsg("")} aria-label="Dismiss">
            <X size={13} />
          </button>
        </Notice>
      )}

      <Panel flush>
        <div className="tabbar" role="tablist" aria-label="Filter reports by status">
          {FILTERS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={f === t.value}
              className={`tab${f === t.value ? " is-active" : ""}`}
              onClick={() => setF(t.value)}
            >
              {t.label} <span className="text-xs opacity-70">{t.th}</span>
              <span className={`chip${f === t.value ? " chip-accent" : ""}`}>{counts[t.value] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-2 text-xs text-muted">
          <span className={`filter-pick${wt ? " is-set" : ""}`}>
            <Filter size={14} aria-hidden />
            <select aria-label="Filter by work type" value={wt}
              onChange={(e) => setWt(e.target.value)}>
              <option value="">ทุกประเภทงาน · All work types ({rows.length})</option>
              {WORK_TYPES.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label} ({wtCounts[w.value] ?? 0})
                </option>
              ))}
              {(wtCounts[""] ?? 0) > 0 && (
                <option value="__none">ยังไม่ระบุ · not set ({wtCounts[""]})</option>
              )}
            </select>
          </span>
          <span>แสดง <strong className="text-ink">{shown.length}</strong> / {rows.length} ใบ</span>
          {wt && (
            <button type="button" className="btn btn-quiet btn-sm ml-auto" onClick={() => setWt("")}>
              <X size={13} aria-hidden /> ล้างตัวกรอง · Clear
            </button>
          )}
        </div>

        <div className="tbl-wrap border-0 shadow-none">
          <table className="tbl tbl-dense">
            <colgroup>
              <col style={{ width: 104 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 78 }} />
              <col />
              <col style={{ width: 116 }} />
              <col style={{ width: 88 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 74 }} />
              <col style={{ width: 96 }} />
            </colgroup>
            <thead>
              <tr>
                <th title="เลขที่ใบแจ้งเสีย · REP-YYYY-NNNN รันต่อเนื่องตลอดปี">No.</th>
                <th>Point</th>
                <th title="ประเภทงานที่เลือกตอนแจ้งเสีย">ประเภทงาน · Work type</th>
                <th>Symptom · อาการ</th>
                <th>Reporter</th>
                <th>Date</th>
                <th>Status</th>
                <th title="รูปที่แนบตอนแจ้งเสีย">รูป · Photo</th>
                <th title="แนบไว้ที่ใบแจ้งนี้ — กดเปิดดูได้เลย">File (Quotation) and P/R</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="is-clickable" onClick={() => open(r.id)}>
                  <td className="truncate font-mono text-[11px]" title={`เลขที่ในระบบ · record #${r.id}`}>{r.code || "—"}</td>
                  <td className="code">{r.point_code}</td>
                  <td className="whitespace-nowrap">
                    {r.work_type
                      ? <span className="chip">{workTypeTh(r.work_type)}</span>
                      : <span className="text-soft">—</span>}
                  </td>
                  <td className="truncate" title={r.symptom}>{r.symptom}</td>
                  <td className="truncate text-muted" title={r.reporter_name}>{r.reporter_name || "—"}</td>
                  <td className="truncate font-mono text-[11px]">{(r.reported_at || "").slice(0, 10)}</td>
                  <td className="whitespace-nowrap">
                    <span className={STATUS_META[r.status]?.cls}>
                      {STATUS_META[r.status]?.label} · {STATUS_META[r.status]?.th}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    {r.photo
                      ? <a className="inline-flex items-center gap-1 font-semibold text-accent hover:text-accentdeep"
                          href={img(r.photo)} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}>
                          <Paperclip size={12} aria-hidden /> open
                        </a>
                      : <span className="text-soft">—</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    {r.quotation_attachment
                      ? <a className="inline-flex items-center gap-1 font-semibold text-accent hover:text-accentdeep"
                          href={img(r.quotation_attachment)} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}>
                          <Paperclip size={12} aria-hidden /> open
                        </a>
                      : <span className="text-soft">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <Empty icon={Inbox}>No reports found · ไม่พบใบแจ้งเสีย</Empty>}
        </div>
      </Panel>

      {detail && (
        <Modal onClose={() => setDetail(null)} labelledBy="report-title">
          <div className="sheet-head">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs text-soft">{detail.code || `Report #${detail.id}`} · {detail.point_code}</p>
              <h2 id="report-title" className="sheet-title mt-1">{detail.symptom}</h2>
              <p className="sheet-sub">by {detail.reporter_name} · {(detail.reported_at || "").slice(0, 16)} · {detail.note}</p>
            </div>
            <button type="button" className="btn btn-icon" aria-label="Close" onClick={() => setDetail(null)}>
              <X size={16} />
            </button>
          </div>

          <span className={STATUS_META[detail.status]?.cls}>
            {STATUS_META[detail.status]?.label} · {STATUS_META[detail.status]?.th}
          </span>
          <span className="chip ml-2">
            {detail.work_type ? workTypeTh(detail.work_type) : "ยังไม่ระบุประเภทงาน"}
          </span>

          {detail.photo
            ? <img src={img(detail.photo)} alt="Fault photo" className="mt-3 max-h-64 w-full rounded-control border border-rule object-contain" />
            : <p className="mt-3 flex items-center gap-2 rounded-control border border-dashed border-rulestrong px-3 py-3 text-xs text-soft">
              <ImagePlus size={15} aria-hidden /> No photo attached · ยังไม่มีรูป
            </p>}

          <label className="fld mt-3">
            <span>Attach photo · แนบรูป</span>
            <input type="file" accept="image/*" className="inp"
              onChange={(e) => e.target.files && onPhoto(e.target.files[0])} />
          </label>

          <label className="fld mt-3">
            <span>แนบไฟล์ · File (Quotation) and P/R</span>
            <input type="file" accept="image/*,.pdf" className="inp"
              onChange={(e) => e.target.files && onQuotation(e.target.files[0])} />
            <span className="fld-hint">แนบใบเสนอราคา + P/R ของงานนี้ (png / jpg / webp / pdf)</span>
          </label>
          {detail.quotation_attachment && (
            <p className="mt-1 text-xs">
              <a className="inline-flex items-center gap-1 font-semibold text-accent hover:text-accentdeep"
                href={img(detail.quotation_attachment)} target="_blank" rel="noreferrer">
                <Paperclip size={12} aria-hidden /> เปิดไฟล์ใบเสนอราคา + P/R · open
              </a>
            </p>
          )}

          <div className="mt-4">
            <p className="label">Repairs on this report · งานซ่อมในใบนี้</p>
            <ul className="mt-2 space-y-1.5 text-xs">
              {detail.repairs.map((x) => (
                <li key={x.id} className="rounded-input border border-rule px-2.5 py-1.5 text-ink2">
                  <span className="font-mono text-soft">{(x.repaired_at || "").slice(0, 10)}</span> · {x.action} ·{" "}
                  <span className="font-mono">฿{Number(x.cost).toLocaleString()}</span> · {x.technician_name}
                </li>
              ))}
              {detail.repairs.length === 0 && <li className="text-soft">No repairs yet · ยังไม่มีงานซ่อม</li>}
            </ul>
          </div>

          {canTriage && (
            <div className="mt-4 flex flex-wrap gap-2">
              {(["waiting", "repairing", "done"] as const).map((s) => (
                <button key={s} type="button" className="btn btn-primary btn-sm" onClick={() => advance(s)}>
                  → {STATUS_META[s].label} <span className="opacity-70">{STATUS_META[s].th}</span>
                </button>
              ))}
            </div>
          )}

          <button type="button" className="btn btn-secondary btn-block mt-4" onClick={() => setDetail(null)}>Close · ปิด</button>
        </Modal>
      )}
    </div>
  );
}
