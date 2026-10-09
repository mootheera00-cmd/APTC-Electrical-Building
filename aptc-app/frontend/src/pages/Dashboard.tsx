import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TriangleAlert, CircleCheck, Clock, Wallet, LayoutDashboard, Banknote, Activity } from "lucide-react";
import { api } from "../lib/api";
import { PageHead, Kpi, Panel, Notice } from "../components/ui";

interface Dash {
  faulty_points: number; open_jobs: number; month_cost: number; total_points: number;
  by_status: Record<string, number>;
  cost_by_category: { code: string; name: string; total: number }[];
  pending: { id: number; point_code: string; symptom: string; status: string; reported_at: string }[];
  recent: { id: number; point_code: string; action: string; cost: number; repaired_at: string }[];
}

const thb = (n: number) => `฿${Number(n || 0).toLocaleString()}`;

export default function Dashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState("");
  const nav = useNavigate();
  useEffect(() => { api<Dash>("/api/dashboard").then(setD).catch((e) => setErr(String(e))); }, []);

  if (err) {
    return (
      <div className="space-y-6">
        <PageHead icon={LayoutDashboard} title="Dashboard" sub="ภาพรวมอุปกรณ์เสีย งานค้าง และค่าใช้จ่าย" />
        <Notice tone="danger">Load failed: {err} — is the API running on :8000?</Notice>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="space-y-6">
        <PageHead icon={LayoutDashboard} title="Dashboard" sub="ภาพรวมอุปกรณ์เสีย งานค้าง และค่าใช้จ่าย" />
        <p className="text-sm text-soft">Loading dashboard… · กำลังโหลด</p>
      </div>
    );
  }

  const maxCost = Math.max(1, ...d.cost_by_category.map((c) => c.total));
  const total = Math.max(1, d.total_points);

  return (
    <div className="space-y-6">
      <PageHead
        icon={LayoutDashboard}
        title="Dashboard"
        sub="ภาพรวมอุปกรณ์เสีย งานค้าง และค่าใช้จ่าย · Overview of faults, open jobs and spend"
      />

      <div className="kpi-row">
        <Kpi icon={TriangleAlert} value={d.faulty_points} label="Faulty points" th="จุดที่เสีย" tone="wait" />
        <Kpi icon={Clock} value={d.open_jobs} label="Open jobs" th="งานค้าง" tone="work" />
        <Kpi icon={Wallet} value={thb(d.month_cost)} label="Cost this month" th="ค่าใช้จ่ายเดือนนี้" tone="accent" />
        <Kpi icon={CircleCheck} value={d.total_points} label="Total points" th="จุดติดตั้งทั้งหมด" tone="ok" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr_0.85fr]">
        <Panel title="Status mix" th="สัดส่วนสถานะ">
          <div className="space-y-3">
            {Object.entries(d.by_status).map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 text-sm">
                <span className="w-20 shrink-0 capitalize text-muted">{k}</span>
                <div className="meter flex-1">
                  <span style={{ width: `${(v / total) * 100}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Cost by category" th="ค่าใช้จ่ายตามหมวด" action={<Banknote size={15} className="text-soft" aria-hidden />}>
          <div className="space-y-3">
            {d.cost_by_category.map((c) => (
              <div key={c.code} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 truncate text-muted" title={`${c.code} · ${c.name}`}>
                  {c.code} · {c.name}
                </span>
                <div className="meter is-work flex-1">
                  <span style={{ width: `${(c.total / maxCost) * 100}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums">{thb(c.total)}</span>
              </div>
            ))}
            {d.cost_by_category.length === 0 && <p className="text-sm text-soft">No spend recorded · ยังไม่มีค่าใช้จ่าย</p>}
          </div>
        </Panel>

        <Panel title="Pending jobs" th="งานที่รอ">
          <ul className="space-y-2">
            {d.pending.length === 0 && (
              <li className="flex items-center gap-2 text-sm text-soft">
                <Activity size={15} aria-hidden /> No pending jobs · ไม่มีงานค้าง
              </li>
            )}
            {d.pending.map((p) => (
              <li key={p.id}>
                <button
                  className="w-full rounded-control border border-rule bg-surface px-3 py-2 text-left transition-colors duration-fast ease-out hover:border-accentsoft hover:bg-accenttint"
                  onClick={() => nav("/reports")}
                >
                  <span className="font-mono text-xs font-semibold">{p.point_code}</span>
                  <span className="ml-2 text-xs text-ink2">{p.symptom}</span>
                  <span className="mt-1 block text-[11px] text-soft">{p.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Recent repairs" th="งานซ่อมล่าสุด" flush>
        <div className="tbl-wrap border-0 shadow-none">
          <table className="tbl">
            <thead>
              <tr>
                <th>Point</th>
                <th>Action · สิ่งที่ทำ</th>
                <th className="text-right">Cost</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {d.recent.map((r) => (
                <tr key={r.id}>
                  <td className="code">{r.point_code}</td>
                  <td>{r.action}</td>
                  <td className="num">{thb(r.cost)}</td>
                  <td className="font-mono text-xs">{(r.repaired_at || "").slice(0, 10)}</td>
                </tr>
              ))}
              {d.recent.length === 0 && (
                <tr><td colSpan={4} className="text-center text-soft">No repairs yet · ยังไม่มีงานซ่อม</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
