import { useMemo, useState, type ReactNode } from "react";
import { CircleCheck, ClipboardList, Paperclip, X } from "lucide-react";
import { api, getUser, upload, WORK_TYPES } from "../lib/api";
import { Modal, Notice } from "./ui";

/** A point as the picker needs it — /api/points rows satisfy this. */
export interface PointOpt {
  id: number;
  code: string;
  name_en?: string;
  room_code?: string;
  category_name?: string;
  /** Trade of the point's category — prefills the form so both screens agree. */
  work_type?: string;
}

const MAX_UPLOAD_MB = 500;
const todayIso = () => new Date().toISOString().slice(0, 10);

/** One "แจ้งเสีย · Report fault" form for the whole app: the Floor Plan opens it
    for the point in the detail drawer, the Reports screen opens it with a picker. */
export default function ReportFault({
  points = [],
  point,
  onClose,
  onDone,
}: {
  /** All selectable points — only needed when `point` is not fixed. */
  points?: PointOpt[];
  /** Fixes the target point and hides the picker (Floor Plan passes the open drawer). */
  point?: PointOpt;
  onClose: () => void;
  /** Fired after the report + its photo are stored; receives the new report code. */
  onDone?: (code: string) => void;
}) {
  const [form, setForm] = useState({ point_id: point ? String(point.id) : "", symptom: "", work_type: point?.work_type || "", reported_at: todayIso(), note: "" });
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const user = getUser();

  const chosen = useMemo(
    () => point ?? points.find((p) => String(p.id) === form.point_id),
    [point, points, form.point_id],
  );
  const ready = !!chosen && !!form.symptom.trim() && !!form.work_type && !!form.reported_at && !!file;

  const field = (label: string, hint: string, node: ReactNode, span?: boolean) => (
    <label className={`fld${span ? " sm:col-span-2" : ""}`}>
      <span>{label}</span>
      {node}
      <span className="fld-hint">{hint}</span>
    </label>
  );

  const submit = async () => {
    if (!chosen) { setErr("เลือกจุดติดตั้งก่อนส่ง · pick a point"); return; }
    if (!form.work_type) { setErr("เลือกประเภทงานก่อนส่ง · work type is required"); return; }
    if (!form.symptom.trim()) { setErr("กรอกอาการเสียก่อนส่ง · symptom is required"); return; }
    if (!form.reported_at) { setErr("เลือกวันที่แจ้งเสียก่อนส่ง · report date is required"); return; }
    if (!file) { setErr("แนบไฟล์หรือรูปถ่ายก่อนส่ง · attachment is required"); return; }
    setBusy(true);
    try {
      const made = await api<{ id: number; code?: string }>("/api/reports", {
        method: "POST", body: JSON.stringify({
          install_point_id: chosen.id, symptom: form.symptom.trim(), note: form.note,
          reporter_id: user?.id ?? null, reported_at: `${form.reported_at}T09:00:00`,
          work_type: form.work_type,
        }),
      });
      await upload(`/api/reports/${made.id}/photo`, file);
      onDone?.(made.code || `#${made.id}`);
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="rf-title" wide dismissOnBackdrop={false} dismissOnEscape={false}>
      <div className="sheet-head">
        <span className="kpi-icon is-accent"><ClipboardList size={17} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 id="rf-title" className="sheet-title">แจ้งเสีย · Report fault</h2>
          <p className="sheet-sub">
            {chosen
              ? `${chosen.code} · ${chosen.name_en || "ไม่ระบุชื่อ"} · ${chosen.room_code || ""} · ${chosen.category_name || ""}`
              : "เลือกจุดติดตั้งที่จะแจ้งเสีย · pick the point that failed"}
          </p>
        </div>
        <button type="button" className="btn btn-icon" aria-label="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {err && <Notice tone="danger">{err}</Notice>}

      <div className="grid gap-3">
        <p className="text-sm text-muted">
          {point
            ? "แจ้งเสียจุดนี้โดยไม่ต้องมีใบแจ้งก่อน — สถานะจุดจะเปลี่ยนเป็น “แจ้งเสีย” ทันที"
            : "แจ้งเสียได้จากหน้านี้เลย — เลือกจุด ประเภทงาน แล้วแนบรูป · สถานะจุดจะเปลี่ยนเป็น “แจ้งเสีย” ทันที"}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {!point && field("จุดติดตั้ง · Point *", "จุดที่เสีย — เลือกแล้วประเภทงานจะถูกเติมให้อัตโนมัติตามหมวดของจุดนั้น",
            <select className="inp" value={form.point_id}
              onChange={(e) => {
                const picked = points.find((p) => String(p.id) === e.target.value);
                setForm({ ...form, point_id: e.target.value, work_type: picked?.work_type || form.work_type });
              }}>
              <option value="">— เลือกจุดติดตั้ง —</option>
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.room_code ? `${p.room_code} · ` : ""}{p.name_en || ""}
                </option>
              ))}
            </select>, true)}
          {field("อาการเสีย · Symptom *", "อธิบายสิ่งที่เห็นจริง ยิ่งละเอียดช่างยิ่งเตรียมของถูก",
            <textarea className="inp" rows={2} placeholder="เช่น หลอดกระพริบทั้งแถว"
              value={form.symptom} onChange={(e) => setForm({ ...form, symptom: e.target.value })} />, true)}
          {field("ประเภทงาน · Work type *", "เลือกประเภทของงานที่ต้องซ่อม · pick the trade",
            <select className="inp" value={form.work_type}
              onChange={(e) => setForm({ ...form, work_type: e.target.value })}>
              <option value="">— เลือกประเภทงาน —</option>
              {WORK_TYPES.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>)}
          {field("วันที่แจ้งเสีย · Reported date *", "วันที่พบ/แจ้งเหตุ",
            <input type="date" className="inp" value={form.reported_at}
              onChange={(e) => setForm({ ...form, reported_at: e.target.value })} />)}
          {field("ผู้บันทึก · Recorded by", "ระบบใช้ชื่อผู้ใช้ที่ล็อกอินอยู่",
            <input className="inp" value={user?.name ?? ""} readOnly />)}
          {field("หมายเหตุ · Note", "บริบทเพิ่มเติม เช่น เกิดตอนไหน ใครพบ",
            <input className="inp" placeholder="เช่น พบตอนเปิดห้องเช้า" value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })} />, true)}
          {field(`แนบไฟล์หรือรูปถ่าย · Attachment *`, `ไม่เกิน ${MAX_UPLOAD_MB} MB · .png .jpg .jpeg .webp .pdf`,
            <input type="file" className="inp" accept=".png,.jpg,.jpeg,.webp,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />, true)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!ready || busy}>
            <ClipboardList size={14} aria-hidden /> ส่งแจ้งเสีย · Submit report
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>ยกเลิก · Cancel</button>
          {file && (
            <span className="inline-flex items-center gap-1 text-xs text-soft">
              <Paperclip size={12} aria-hidden /> {file.name}
            </span>
          )}
          {ready && (
            <span className="inline-flex items-center gap-1 text-xs text-ok">
              <CircleCheck size={13} aria-hidden /> พร้อมส่ง
            </span>
          )}
        </div>
        <p className="text-xs text-soft">
          ใบแจ้งเสียที่ส่งแล้วดูได้ที่เมนู “แจ้งเสีย” · submitted reports live in the Reports screen
        </p>
      </div>
    </Modal>
  );
}
