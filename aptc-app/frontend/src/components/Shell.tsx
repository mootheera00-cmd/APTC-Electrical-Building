import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Map, Wrench, ClipboardList, Settings, LogOut, Truck, PanelTop,
  Sparkles, Menu, X, Search, Maximize, Minimize,
} from "lucide-react";
import { getUser, setUser } from "../lib/api";
import { useFullscreen } from "../lib/useFullscreen";
import { initials } from "./ui";

const links = [
  { to: "/", label: "Dashboard", th: "ภาพรวม", icon: LayoutDashboard, end: true },
  { to: "/plan", label: "Floor Plan", th: "แปลนอาคาร", icon: Map },
  { to: "/reports", label: "Reports", th: "แจ้งเสีย", icon: ClipboardList },
  { to: "/repairs", label: "Repairs", th: "งานซ่อม", icon: Wrench },
  { to: "/panels", label: "Panels", th: "ตู้ไฟ", icon: PanelTop },
  { to: "/maintenance", label: "Maintenance", th: "ล้าง/ทดสอบ", icon: Sparkles },
  { to: "/suppliers", label: "Suppliers", th: "ซัพพลายเออร์", icon: Truck },
  { to: "/manage", label: "Manage", th: "จัดการ", icon: Settings },
];



/** Quick-jump: filters the rail destinations and navigates on pick. */
function JumpSearch({ onDone }: { onDone: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return links;
    return links.filter((l) => `${l.label} ${l.th}`.toLowerCase().includes(needle));
  }, [q]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const pick = (to: string) => {
    setQ(""); setOpen(false); onDone(); nav(to);
  };

  return (
    <div className="search" ref={box}>
      <Search size={15} className="search-icon" aria-hidden />
      <input
        className="search-inp"
        type="search"
        value={q}
        placeholder="Search pages… · ค้นหาเมนู"
        aria-label="Search pages"
        onChange={(e) => { setQ(e.target.value); setCursor(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
          else if (e.key === "Enter" && hits[cursor]) { e.preventDefault(); pick(hits[cursor].to); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <div className="search-pop" role="listbox" aria-label="Pages">
          {hits.map((l, i) => (
            <button
              key={l.to}
              type="button"
              role="option"
              aria-selected={i === cursor}
              className={`search-item${i === cursor ? " is-cursor" : ""}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => pick(l.to)}
            >
              <l.icon size={15} aria-hidden />
              {l.label}
              <span className="text-xs text-soft">{l.th}</span>
            </button>
          ))}
          {hits.length === 0 && <p className="px-2 py-2 text-xs text-soft">No page matches · ไม่พบเมนู</p>}
        </div>
      )}
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const user = getUser();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [railOpen, setRailOpen] = useState(false);
  const fs = useFullscreen();

  useEffect(() => { setRailOpen(false); }, [pathname]);

  if (pathname === "/login") {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-paper px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </div>
    );
  }

  const here = links.find((l) => (l.end ? pathname === l.to : pathname.startsWith(l.to))) ?? links[0];

  return (
    <div className="app-shell">
      {railOpen && <div className="rail-scrim" onClick={() => setRailOpen(false)} aria-hidden />}

      <aside className={`rail${railOpen ? " is-open" : ""}`} aria-label="Main">
        <div className="rail-head">
          <div className="rail-brand">
            <img src="/header-logo.svg" alt="APTC" width={128} height={38} className="h-9 w-auto" />
            <button
              type="button"
              className="btn btn-icon only-mobile ml-auto"
              aria-label="Close menu"
              onClick={() => setRailOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <p className="font-display text-sm font-bold leading-tight">APTC · Electrical &amp; Building</p>
          <p className="text-xs leading-snug text-soft">ประวัติอุปกรณ์ในอาคาร · Room &amp; equipment history</p>
        </div>

        <nav className="rail-nav">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => `rail-link${isActive ? " is-active" : ""}`}
            >
              <l.icon size={17} aria-hidden />
              <span className="rail-link-label">
                <span>{l.label}</span>
                <span className="rail-link-th">{l.th}</span>
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="rail-foot">
          <p className="font-mono text-[11px] leading-relaxed">
            React 19 + FastAPI + MySQL<br />plan: APTC Layout.dwg
          </p>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="btn btn-icon only-mobile"
            aria-label={railOpen ? "Close menu" : "Open menu"}
            aria-expanded={railOpen}
            onClick={() => setRailOpen((v) => !v)}
          >
            {railOpen ? <X size={17} /> : <Menu size={17} />}
          </button>

          <div className="min-w-0">
            <p className="font-display text-md font-bold leading-tight">{here.label}</p>
            <p className="truncate text-xs text-soft">
              {user ? `ยินดีต้อนรับ, ${user.name}` : "ยังไม่ได้เข้าสู่ระบบ"}
            </p>
          </div>

          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
            <div className="hidden min-w-0 flex-1 justify-end sm:flex">
              <JumpSearch onDone={() => setRailOpen(false)} />
            </div>
            {fs.supported && (
              <button
                type="button"
                className="btn btn-icon"
                aria-pressed={fs.isFull}
                title={fs.isFull ? "Exit fullscreen · ออกจากเต็มจอ" : "Fullscreen · เต็มหน้าจอ"}
                aria-label={fs.isFull ? "Exit fullscreen" : "Enter fullscreen"}
                onClick={fs.toggle}
              >
                {fs.isFull ? <Minimize size={17} /> : <Maximize size={17} />}
              </button>
            )}
            {user ? (
              <>
                <span className="avatar" title={`${user.name} · ${user.role}`}>{initials(user.name)}</span>
                <button
                  type="button"
                  className="btn btn-icon"
                  title="Sign out · ออกจากระบบ"
                  aria-label="Sign out"
                  onClick={() => { setUser(null); nav("/login"); }}
                >
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => nav("/login")}>Sign in</button>
            )}
          </div>
        </header>

        <div className="app-scroll">
          <main className="content">{children}</main>
          <footer className="px-[var(--gutter)] pb-6 text-xs text-soft">
            <div className="hairline pt-3">
              APTC-Electrical and Building · ระบบติดตามอุปกรณ์ไฟฟ้าและอาคาร
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
