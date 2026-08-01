"use client";

import { useEffect, useState } from "react";

type HealthData = {
  status: string;
  databaseConfigured: boolean;
  databaseStatus: "not_checked" | "not_configured" | "reachable" | "unavailable";
  deviceAuthConfigured: boolean;
  adminAuthConfigured: boolean;
  notificationConfigured: boolean;
  providerStatus: string;
  demoMode: boolean;
};

export function SystemStatus() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health?deep=true", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error("Health check failed");
        setHealth(json.data as HealthData);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setFailed(true);
        }
      });
    return () => controller.abort();
  }, []);

  if (failed) {
    return (
      <div className="rounded-2xl border border-red-300/30 bg-red-400/10 p-4 text-sm text-red-100">
        API health check could not be reached.
      </div>
    );
  }

  if (!health) {
    return <div className="h-28 animate-pulse rounded-2xl bg-white/5" />;
  }

  const databaseReady =
    health.databaseConfigured && health.databaseStatus !== "unavailable";
  const notificationLabel = health.demoMode ? "Demo WhatsApp" : "WhatsApp";
  const items = [
    ["Database", databaseReady],
    ["Device auth", health.deviceAuthConfigured],
    ["Admin auth", health.adminAuthConfigured],
    [notificationLabel, health.notificationConfigured],
  ] as const;
  const readyCount = items.filter(([, ready]) => ready).length;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black tracking-[0.16em] text-slate-400">
          SYSTEM READINESS
        </p>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-black ${
            readyCount === items.length
              ? "bg-emerald-400/15 text-emerald-200"
              : "bg-amber-400/15 text-amber-100"
          }`}
        >
          {readyCount}/{items.length} READY
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {items.map(([label, ready]) => (
          <div key={label} className="flex items-center gap-2 text-sm text-slate-200">
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-full ${ready ? "bg-emerald-400" : "bg-amber-400"}`}
            />
            <span className="capitalize">{label}</span>
          </div>
        ))}
      </div>
      {health.demoMode ? (
        <p className="mt-3 text-xs text-amber-100/80">
          Simulation mode is active; Meta will not be contacted.
        </p>
      ) : null}
    </div>
  );
}
