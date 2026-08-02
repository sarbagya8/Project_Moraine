"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type HealthData = {
  databaseConfigured: boolean;
  databaseStatus: "not_checked" | "not_configured" | "reachable" | "unavailable";
  deviceAuthConfigured: boolean;
  adminAuthConfigured: boolean;
  notificationConfigured: boolean;
  providerStatus: string;
  webhookConfigured: boolean;
  demoMode: boolean;
  timestamp: string;
};

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
};

type WhatsAppTestResult = {
  recipient: string;
  provider: string;
  status: string;
  accepted: boolean;
  providerMessageId: string | null;
  error: string | null;
  note: string;
};

function tone(ready: boolean) {
  return ready
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : "border-amber-200 bg-amber-50 text-amber-950";
}

export function SetupConsole() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthError, setHealthError] = useState("");
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<WhatsAppTestResult | null>(null);
  const [testError, setTestError] = useState("");

  const loadHealth = useCallback(async () => {
    setLoadingHealth(true);
    setHealthError("");
    try {
      const response = await fetch("/api/health?deep=true", {
        cache: "no-store",
      });
      const json = (await response.json()) as ApiEnvelope<HealthData>;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error?.message || "Health check failed.");
      }
      setHealth(json.data);
    } catch (error) {
      setHealthError(
        error instanceof Error ? error.message : "Health check failed.",
      );
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHealth();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadHealth]);

  async function testWhatsApp() {
    setTestResult(null);
    setTestError("");
    setTesting(true);
    try {
      const response = await fetch("/api/notifications/whatsapp/test", {
        method: "POST",
      });
      const json = (await response.json()) as ApiEnvelope<WhatsAppTestResult>;
      if (!json.data) {
        throw new Error(
          json.error?.message || "The WhatsApp connection test failed.",
        );
      }
      setTestResult(json.data);
      await loadHealth();
    } catch (error) {
      setTestError(
        error instanceof Error
          ? error.message
          : "The WhatsApp connection test failed.",
      );
    } finally {
      setTesting(false);
    }
  }

  const checks = health
    ? [
        {
          label: "Supabase",
          ready:
            health.databaseConfigured &&
            health.databaseStatus !== "unavailable",
          detail:
            health.databaseStatus === "reachable"
              ? "Connected and reachable"
              : "Not ready",
        },
        {
          label: "Device API key",
          ready: health.deviceAuthConfigured,
          detail: health.deviceAuthConfigured
            ? "ESP32 authentication is ready"
            : "Configure server-side device authentication",
        },
        {
          label: "Authority authentication",
          ready: health.adminAuthConfigured,
          detail: health.adminAuthConfigured
            ? "Operator actions are protected"
            : "Configure server-side authority authentication",
        },
        {
          label: health.demoMode ? "WhatsApp simulation" : "WhatsApp Cloud API",
          ready: health.notificationConfigured,
          detail: health.demoMode
            ? "Meta will not be contacted"
            : health.providerStatus === "configured"
              ? "Official Meta provider configured"
              : "Meta credentials are incomplete",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-teal-700">
              LIVE READINESS
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">
              Environment and provider status
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void loadHealth()}
            disabled={loadingHealth}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-black disabled:opacity-50"
          >
            {loadingHealth ? "Checking..." : "Check again"}
          </button>
        </div>
        {healthError ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
            {healthError}
          </p>
        ) : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {checks.map((check) => (
            <article
              key={check.label}
              className={`rounded-2xl border p-4 ${tone(check.ready)}`}
            >
              <h3 className="font-black">{check.label}</h3>
              <p className="mt-2 text-sm opacity-80">{check.detail}</p>
            </article>
          ))}
        </div>
        {health ? (
          <p className="mt-4 text-xs text-slate-500">
            Provider: {health.providerStatus} · webhook{" "}
            {health.webhookConfigured ? "configured" : "not configured"} ·
            checked {new Date(health.timestamp).toLocaleString()}
          </p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-black tracking-[0.16em] text-teal-700">
          CONTROLLED SMOKE TEST
        </p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">
          Verify the WhatsApp connection
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          The server sends Meta&apos;s hello_world template only to the fixed
          WHATSAPP_RECIPIENT_NUMBER. The browser cannot choose a recipient.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void testWhatsApp()}
            disabled={testing}
            className="rounded-xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-50"
          >
            {testing ? "Testing..." : "Send fixed-recipient test"}
          </button>
          <Link href="/authority/login" className="text-link">
            Authority sign-in is required
          </Link>
        </div>
        {testError ? (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {testError}
          </p>
        ) : null}
        {testResult ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-black">
              {testResult.provider} · {testResult.status}
            </p>
            <p className="mt-2">Recipient: {testResult.recipient}</p>
            <p className="mt-1">{testResult.note}</p>
            {testResult.error ? (
              <p className="mt-1 font-semibold text-red-800">
                {testResult.error}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
