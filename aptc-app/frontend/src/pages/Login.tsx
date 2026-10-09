import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { api, setUser, type User } from "../lib/api";
import { Notice, initials } from "../components/ui";

export default function Login() {
  const [users, setUsers] = useState<User[]>([]);
  const [err, setErr] = useState("");
  const nav = useNavigate();
  useEffect(() => { api<User[]>("/api/users").then(setUsers).catch((e) => setErr(String(e))); }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/header-logo.svg" alt="APTC" width={128} height={38} className="h-10 w-auto" />
        <div>
          <h1 className="font-display text-xl font-extrabold">Sign in</h1>
          <p className="text-sm text-soft">เลือกผู้ใช้เพื่อเข้าใช้งาน · Pick a user (MVP login, no password)</p>
        </div>
      </div>

      {err && (
        <Notice tone="danger">
          <ShieldAlert size={15} aria-hidden /> {err}
        </Notice>
      )}

      <div className="space-y-2">
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={async () => {
              const me = await api<User>("/api/login", { method: "POST", body: JSON.stringify({ username: u.username }) });
              setUser(me); nav("/plan");
            }}
            className="flex w-full items-center gap-3 rounded-card border border-rule bg-surface px-4 py-3 text-left shadow-card transition-colors duration-fast ease-out hover:border-accentsoft hover:bg-accenttint"
          >
            <span className="avatar">{initials(u.name)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display font-bold">{u.name}</span>
              <span className="block truncate text-xs text-soft">@{u.username} · {u.role}</span>
            </span>
            <ChevronRight size={17} className="shrink-0 text-soft" aria-hidden />
          </button>
        ))}
        {!err && users.length === 0 && <p className="py-6 text-center text-sm text-soft">Loading users… · กำลังโหลด</p>}
      </div>
    </div>
  );
}
