"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SensorReading } from "@/lib/rescue-data";

type SensorChartsProps = { readings: SensorReading[] };

const charts = [
  { key: "heartRate", label: "Heart rate", unit: " bpm", color: "#dc2626" },
  { key: "spo2", label: "SpO₂", unit: "%", color: "#2563eb" },
  { key: "altitude", label: "Altitude", unit: " m", color: "#0f766e" },
] as const;

export function SensorCharts({ readings }: SensorChartsProps) {
  if (readings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
        No sensor history is available for this rescue record.
      </div>
    );
  }

  const data = readings.map((reading) => ({
    ...reading,
    time: new Date(reading.capturedAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {charts.map(({ key, label, unit, color }) => (
        <section
          key={key}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h3 className="font-bold text-slate-900">{label}</h3>
          <div className="mt-2 h-44" aria-label={`${label} trend chart`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" fontSize={10} minTickGap={20} />
                <YAxis width={38} fontSize={10} domain={["auto", "auto"]} />
                <Tooltip
                  formatter={(value) => [`${value}${unit}`, label]}
                  labelFormatter={(value) => `Time: ${value}`}
                />
                <Line
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      ))}
    </div>
  );
}
