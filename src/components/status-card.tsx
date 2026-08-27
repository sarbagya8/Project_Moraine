import type { ReactNode } from "react";

type StatusCardProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "slate" | "red" | "amber" | "green" | "blue";
};

const toneClasses = {
  slate: "rescue-status-neutral",
  red: "rescue-status-emergency",
  amber: "rescue-status-warning",
  green: "rescue-status-ready",
  blue: "rescue-status-signal",
} as const;

export function StatusCard({
  label,
  value,
  detail,
  tone = "slate",
}: StatusCardProps) {
  return (
    <section
      className={`rounded-2xl border p-4 shadow-sm ${toneClasses[tone]}`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black tracking-tight text-slate-950">
        {value}
      </p>
      {detail ? <p className="mt-1 text-sm text-slate-600">{detail}</p> : null}
    </section>
  );
}
