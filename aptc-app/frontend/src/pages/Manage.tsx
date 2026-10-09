import { useEffect, useState } from "react";
import { Settings, Plus, RefreshCw, Upload, X } from "lucide-react";
import { api, getUser, upload } from "../lib/api";
import { PageHead, Panel, Notice } from "../components/ui";

function useList<T>(path: string) {
  const [rows, setRows] = useState<T[]>([]);
  const [msg, setMsg] = useState("");
  const load = async () => { try { setRows(await api<T[]>(path)); } catch (e) { setMsg(String(e)); } };
  useEffect(() => { load(); }, [path]);
  return { rows, msg, setMsg, load };
}

export default function Manage() {
  const user = getUser();
  const isAdmin = user?.role === "admin";
  const buildings = useList<{ id: number; name_en: string; name_th: string }>("/api/buildings");
  const floors = useList<{ id: number; building_id: number; name_en: string; plan_image: string }>("/api/floors");
  const rooms = useList<{ id: number; code: string; name_en: string; floor_id: number; width_m: number | null; length_m: number | null; height_m: number | null; floor_area_m2: number | null } & Record<string, unknown>>("/api/rooms");
  const cats = useList<{ id: number; code: string; name_en: string }>("/api/categories");
  const points = useList<{ id: number; code: string; room_id: number; category_id: number; x_pct: number; y_pct: number }>("/api/points");
  const users = useList<{ id: number; username: string; name: string; role: string }>("/api/users");
  const [msg, setMsg] = useState("");
  const [bForm, setBForm] = useState({ name_en: "", name_th: "" });
  const [rForm, setRForm] = useState({ code: "", name_en: "", name_th: "", width_m: "", length_m: "", height_m: "" });
  const [pForm, setPForm] = useState({ code: "", room_id: "", category_id: "", x_pct: "50", y_pct: "50" });
  const [repForm, setRepForm] = useState({ point_id: "", serial_no: "", brand_model: "" });

  const post = async (path: string, body: unknown) => {
    await api(path, { method: "POST", body: JSON.stringify(body) });
    setMsg("Saved · บันทึกแล้ว");
    buildings.load(); floors.load(); rooms.load(); cats.load(); points.load(); users.load();
  };

  const banner = msg || buildings.msg || floors.msg || rooms.msg || points.msg || users.msg;

  return (
    <div className="space-y-6">
      <PageHead
        icon={Settings}
        title="Management"
        sub="จัดการข้อมูลและเปลี่ยนอุปกรณ์ · Building, rooms, points, replacements"
      />

      {banner && (
        <Notice tone="accent">
          <span className="min-w-0 flex-1">{banner}</span>
          <button type="button" className="btn btn-quiet btn-sm" aria-label="Dismiss" onClick={() => {
            setMsg(""); buildings.setMsg(""); floors.setMsg(""); rooms.setMsg(""); points.setMsg(""); users.setMsg("");
          }}><X size={13} /></button>
        </Notice>
      )}
      {!isAdmin && (
        <Notice tone="warn">Read-only for role {user?.role} · ต้องเป็น admin จึงจะแก้ไขได้</Notice>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Single-storey site — one building, one plan. The floor row is the
            plan itself: rename the building, swap the plan image. */}
        <Panel title="Building & plan" th="อาคารและแปลน">
          <div className="space-y-3 text-sm">
            <ul className="space-y-1.5 text-xs">
              {buildings.rows.map((b) => (
                <li key={b.id} className="rounded-input border border-rule px-2.5 py-1.5">
                  {b.name_en} <span className="text-soft">{b.name_th}</span>
                </li>
              ))}
              {buildings.rows.length === 0 && <li className="text-soft">No buildings · ยังไม่มีอาคาร</li>}
            </ul>
            <ul className="space-y-1.5 text-xs">
              {floors.rows.map((f) => (
                <li key={f.id} className="flex items-center gap-2 rounded-input border border-rule px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate">แปลนอาคาร · {f.plan_image || "no plan"}</span>
                  {isAdmin && (
                    <label className="flex cursor-pointer items-center gap-1 whitespace-nowrap font-semibold text-accent hover:text-accentdeep">
                      <Upload size={12} aria-hidden /> upload plan
                      <input type="file" className="hidden" accept="image/*,.pdf"
                        onChange={async (e) => {
                          if (!e.target.files) return;
                          const r = await upload(`/api/floors/${f.id}/plan`, e.target.files[0]);
                          setMsg(`Plan updated: ${r.plan_image}`); floors.load();
                        }} />
                    </label>
                  )}
                </li>
              ))}
            </ul>
            {isAdmin && (
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input className="inp" placeholder="Building EN" value={bForm.name_en}
                  onChange={(e) => setBForm({ ...bForm, name_en: e.target.value })} />
                <input className="inp" placeholder="ชื่อไทย" value={bForm.name_th}
                  onChange={(e) => setBForm({ ...bForm, name_th: e.target.value })} />
                <button type="button" className="btn btn-primary"
                  onClick={() => post("/api/buildings", { name_en: bForm.name_en, name_th: bForm.name_th })}>
                  Add
                </button>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Rooms" th={`ห้อง (${rooms.rows.length})`}>
          <div className="space-y-3 text-sm">
            <ul className="max-h-52 space-y-1.5 overflow-y-auto text-xs">
              {rooms.rows.map((r) => (
                <li key={r.id} className="rounded-input border border-rule px-2.5 py-1.5 font-mono">
                  {r.code} · {r.name_en}
                  {(r.width_m || r.floor_area_m2) && (
                    <span className="font-body text-soft"> · {r.width_m ?? "?"}×{r.length_m ?? "?"}×{r.height_m ?? "?"} m · {r.floor_area_m2 ?? "?"} m²</span>
                  )}
                </li>
              ))}
              {rooms.rows.length === 0 && <li className="text-soft">No rooms · ยังไม่มีห้อง</li>}
            </ul>
            {isAdmin && floors.rows.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="inp" placeholder="code e.g. LAB3" value={rForm.code}
                  onChange={(e) => setRForm({ ...rForm, code: e.target.value })} />
                <input className="inp" placeholder="name EN" value={rForm.name_en}
                  onChange={(e) => setRForm({ ...rForm, name_en: e.target.value })} />
                <input className="inp" placeholder="ชื่อไทย" value={rForm.name_th}
                  onChange={(e) => setRForm({ ...rForm, name_th: e.target.value })} />
                <input className="inp" placeholder="W m · กว้าง" value={rForm.width_m}
                  onChange={(e) => setRForm({ ...rForm, width_m: e.target.value })} />
                <input className="inp" placeholder="L m · ยาว" value={rForm.length_m}
                  onChange={(e) => setRForm({ ...rForm, length_m: e.target.value })} />
                <input className="inp" placeholder="H m · สูง" value={rForm.height_m}
                  onChange={(e) => setRForm({ ...rForm, height_m: e.target.value })} />
                <button type="button" className="btn btn-primary sm:col-span-1"
                  onClick={() => post("/api/rooms", {
                    floor_id: floors.rows[0].id, code: rForm.code,
                    name_en: rForm.name_en, name_th: rForm.name_th,
                    width_m: rForm.width_m ? Number(rForm.width_m) : null,
                    length_m: rForm.length_m ? Number(rForm.length_m) : null,
                    height_m: rForm.height_m ? Number(rForm.height_m) : null,
                    floor_area_m2: rForm.width_m && rForm.length_m
                      ? Math.round(Number(rForm.width_m) * Number(rForm.length_m) * 10) / 10 : null,
                  })}>
                  <Plus size={14} /> Add room · เพิ่มห้อง
                </button>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Install points" th={`จุดติดตั้ง (${points.rows.length})`}>
          <div className="space-y-3 text-sm">
            <ul className="max-h-52 space-y-1.5 overflow-y-auto text-xs">
              {points.rows.map((p) => (
                <li key={p.id} className="rounded-input border border-rule px-2.5 py-1.5 font-mono">
                  {p.code} · ({Number(p.x_pct).toFixed(0)}%, {Number(p.y_pct).toFixed(0)}%)
                </li>
              ))}
              {points.rows.length === 0 && <li className="text-soft">No points · ยังไม่มีจุดติดตั้ง</li>}
            </ul>
            {isAdmin && (
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="inp" placeholder="code e.g. L-009" value={pForm.code}
                  onChange={(e) => setPForm({ ...pForm, code: e.target.value })} />
                <select className="inp" value={pForm.room_id} onChange={(e) => setPForm({ ...pForm, room_id: e.target.value })}>
                  <option value="">room… · ห้อง</option>
                  {rooms.rows.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
                </select>
                <select className="inp sm:col-span-2" value={pForm.category_id}
                  onChange={(e) => setPForm({ ...pForm, category_id: e.target.value })}>
                  <option value="">category… · หมวด</option>
                  {cats.rows.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name_en}</option>)}
                </select>
                <input className="inp" placeholder="x%" value={pForm.x_pct}
                  onChange={(e) => setPForm({ ...pForm, x_pct: e.target.value })} />
                <input className="inp" placeholder="y%" value={pForm.y_pct}
                  onChange={(e) => setPForm({ ...pForm, y_pct: e.target.value })} />
                <button type="button" className="btn btn-primary sm:col-span-2"
                  onClick={() => post("/api/points", {
                    code: pForm.code, room_id: Number(pForm.room_id), category_id: Number(pForm.category_id),
                    x_pct: Number(pForm.x_pct), y_pct: Number(pForm.y_pct),
                  })}>
                  <Plus size={14} /> Add point · เพิ่มจุด
                </button>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Replace equipment" th="เปลี่ยนอุปกรณ์ (keeps history)">
          <div className="space-y-4 text-sm">
            <p className="text-xs text-soft">
              Retires the old unit and activates the new one — the point code and its history stay.
              · ประวัติเดิมของจุดยังอยู่
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <select className="inp sm:col-span-2" value={repForm.point_id}
                onChange={(e) => setRepForm({ ...repForm, point_id: e.target.value })}>
                <option value="">point… · จุดติดตั้ง</option>
                {points.rows.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
              </select>
              <input className="inp" placeholder="serial no." value={repForm.serial_no}
                onChange={(e) => setRepForm({ ...repForm, serial_no: e.target.value })} />
              <input className="inp" placeholder="brand / model" value={repForm.brand_model}
                onChange={(e) => setRepForm({ ...repForm, brand_model: e.target.value })} />
              <button type="button" className="btn btn-primary sm:col-span-2" disabled={!isAdmin}
                onClick={async () => {
                  await api(`/api/points/${repForm.point_id}/replace`, {
                    method: "POST", body: JSON.stringify({ serial_no: repForm.serial_no, brand_model: repForm.brand_model }),
                  });
                  setMsg("Replaced · เปลี่ยนอุปกรณ์แล้ว ประวัติเดิมยังอยู่");
                  setRepForm({ point_id: "", serial_no: "", brand_model: "" });
                }}>
                <RefreshCw size={14} /> Replace unit · เปลี่ยนอุปกรณ์
              </button>
            </div>

            <div className="hairline pt-4">
              <p className="label">Users · ผู้ใช้ ({users.rows.length})</p>
              <ul className="mt-2 space-y-1.5 text-xs">
                {users.rows.map((u) => (
                  <li key={u.id} className="rounded-input border border-rule px-2.5 py-1.5 font-mono">
                    {u.username} · {u.name} · {u.role}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
