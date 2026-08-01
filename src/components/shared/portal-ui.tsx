import Link from "next/link";
import type { ReactNode } from "react";

export function StatusBadge({
  value,
  tone,
}: {
  value: string;
  tone?: "red" | "amber" | "green" | "sage";
}) {
  const inferred =
    tone ||
    (["active", "critical", "failed", "offline"].includes(value.toLowerCase())
      ? "red"
      : ["acknowledged", "stale", "pending", "high"].includes(value.toLowerCase())
        ? "amber"
        : ["resolved", "delivered", "read", "online"].includes(value.toLowerCase())
          ? "green"
          : "sage");
  return <span className={`status-badge status-${inferred}`}>{value.replaceAll("_", " ")}</span>;
}

export function DataCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <article className="data-card">
      <p className="eyebrow">{label}</p>
      <div className="data-value">{value}</div>
      {detail ? <p className="data-detail">{detail}</p> : null}
    </article>
  );
}

export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <strong>Could not load this information</strong>
      <p>{message}</p>
      {retry ? <button onClick={retry}>Try again</button> : null}
    </div>
  );
}

export function LoadingState({ label = "Loading information" }: { label?: string }) {
  return (
    <div className="loading-state" aria-label={label}>
      <span />
      <span />
      <span />
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export function DetailLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="text-link" href={href}>
      {children} <span aria-hidden="true">→</span>
    </Link>
  );
}

export function formatTime(value: string | null | undefined) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString();
}

export function relativeAge(value: string | null | undefined) {
  if (!value) return "No update received";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1_000));
  if (seconds < 60) return `${seconds} seconds ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)} hours ago`;
  return `${Math.floor(seconds / 86_400)} days ago`;
}
