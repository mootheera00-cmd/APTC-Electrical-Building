/* The API runs on its own port while the page may be opened as localhost,
   127.0.0.1, or the machine's LAN IP — so derive the API host from whatever
   served the page. That way a changed IP never breaks the app.
   Override with VITE_API_URL (full URL) or VITE_API_PORT. */
const API_PORT = (import.meta.env.VITE_API_PORT as string) || "8010";
export const API = (import.meta.env.VITE_API_URL as string)
  || `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;

export type Role = "admin" | "reporter" | "technician";

export interface User { id: number; username: string; name: string; role: Role; active: boolean }

let _user: User | null = null;
try { _user = JSON.parse(localStorage.getItem("aptc-user") || "null"); } catch { _user = null; }
export function getUser(): User | null { return _user; }
export function setUser(u: User | null) {
  _user = u;
  if (u) localStorage.setItem("aptc-user", JSON.stringify(u));
  else localStorage.removeItem("aptc-user");
}
export function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (_user) { h["X-User-Id"] = String(_user.id); h["X-User-Role"] = _user.role; }
  return h;
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: { ...headers(), ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status} ${txt.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}
/** Multipart upload — the browser must set Content-Type itself so the
    multipart boundary matches; `api()` would force application/json and the
    server would reject the file. */
export async function upload(path: string, file: File): Promise<Record<string, string>> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(API + path, {
    method: "POST",
    headers: _user ? { "X-User-Id": String(_user.id), "X-User-Role": _user.role } : undefined,
    body: fd,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status} ${txt.slice(0, 200)}`);
  }
  return res.json() as Promise<Record<string, string>>;
}
export const STATUS_META: Record<string, { label: string; th: string; cls: string; dot: string; edge: string }> = {
  normal: { label: "Normal", th: "ปกติ", cls: "chip chip-ok", dot: "bg-ok", edge: "border-ok" },
  reported: { label: "Reported", th: "แจ้งเสีย", cls: "chip chip-warn", dot: "bg-warn", edge: "border-warn" },
  waiting: { label: "Waiting", th: "รอซ่อม", cls: "chip chip-wait", dot: "bg-wait", edge: "border-wait" },
  repairing: { label: "Repairing", th: "กำลังซ่อม", cls: "chip chip-work", dot: "bg-work", edge: "border-work" },
  done: { label: "Done", th: "เสร็จสิ้น", cls: "chip chip-idle", dot: "bg-idle", edge: "border-idle" },
};
export const img = (p: string) => (p ? (p.startsWith("http") ? p : API + p) : "");
/** Trade of a fault report — value is what the API stores, label is what staff read. */
export const WORK_TYPES: { value: string; label: string; th: string }[] = [
  { value: "electrical", label: "ไฟฟ้า · Electrical", th: "ไฟฟ้า" },
  { value: "building", label: "งานอาคาร · Building", th: "งานอาคาร" },
  { value: "other", label: "อื่นๆ · Other", th: "อื่นๆ" },
];
export const workTypeLabel = (v: string) => WORK_TYPES.find((w) => w.value === v)?.label ?? "";
export const workTypeTh = (v: string) => WORK_TYPES.find((w) => w.value === v)?.th ?? "";
