import { useEffect, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Tone = "accent" | "ok" | "warn" | "wait" | "work";

/** First letter of the first two words — ignores bracketed roles like "(Somchai)". */
export const initials = (name: string): string =>
  (name.match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

/** Page header — title + Thai/EN subtitle, with the page's primary actions on the right. */
export function PageHead({
  icon: Icon,
  title,
  sub,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="page-head-text">
        <h1 className="page-title">
          {Icon && <Icon size={20} className="shrink-0 text-accent" aria-hidden />}
          <span className="min-w-0">{title}</span>
        </h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

/** Stat tile — icon chip, big number, label pair. */
export function Kpi({
  icon: Icon,
  value,
  label,
  th,
  tone = "accent",
}: {
  icon: LucideIcon;
  value: ReactNode;
  label: string;
  th?: string;
  tone?: Tone;
}) {
  return (
    <div className="kpi">
      <span className={`kpi-icon is-${tone}`}>
        <Icon size={17} aria-hidden />
      </span>
      <div className="kpi-body">
        <p className="kpi-value">{value}</p>
        <p className="kpi-label">{label}</p>
        {th && <p className="kpi-label-th">{th}</p>}
      </div>
    </div>
  );
}

/** Card with an optional head row and a right-aligned action slot. */
export function Panel({
  title,
  th,
  action,
  children,
  flush,
}: {
  title?: string;
  th?: string;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="card">
      {title && (
        <div className="card-head">
          <h2 className="card-title">{title}</h2>
          {th && <span className="card-title-th">{th}</span>}
          {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={flush ? "" : "card-pad"}>{children}</div>
    </section>
  );
}

/** Empty state — a soft mark, one sentence, nothing else. */
export function Empty({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className="empty">
      {Icon && (
        <span className="empty-mark">
          <Icon size={22} aria-hidden />
        </span>
      )}
      <p>{children}</p>
    </div>
  );
}

export function Notice({ tone, children }: { tone?: "accent" | "warn" | "danger"; children: ReactNode }) {
  return <p className={`notice${tone ? ` notice-${tone}` : ""}`}>{children}</p>;
}

/** Modal sheet — closes on Escape, backdrop click, or the close button.
    A form worth protecting passes `dismissOnBackdrop={false} dismissOnEscape={false}`. */
export function Modal({
  onClose,
  labelledBy,
  wide,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
  children,
}: {
  onClose: () => void;
  labelledBy?: string;
  wide?: boolean;
  dismissOnBackdrop?: boolean;
  dismissOnEscape?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!dismissOnEscape) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, dismissOnEscape]);

  return (
    <div className="scrim" onClick={dismissOnBackdrop ? onClose : undefined} role="presentation">
      <div
        className={`sheet${wide ? " sheet-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
