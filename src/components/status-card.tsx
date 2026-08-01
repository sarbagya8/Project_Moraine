import type { ReactNode } from "react";

type StatusCardProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "slate" | "red" | "amber" | "green" | "blue";
};

const toneClasses = {
  slate: "border-slate-200 bg-white",
  red: "border-red-200 bg-red-50",
  amber: "border-amber-200 bg-amber-50",
  green: "border-emerald-200 bg-emerald-50",
  blue: "border-sky-200 bg-sky-50",
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
