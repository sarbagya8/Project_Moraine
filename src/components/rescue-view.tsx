"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { formatAge, type RescueRecord } from "@/lib/rescue-data";
import { SensorCharts } from "./sensor-charts";
import { StatusCard } from "./status-card";
import { operationalPriority } from "@/lib/portal-api";
import { BrandLogo } from "@/components/shared/brand-logo";

const EmergencyMap = dynamic(() => import("./emergency-map"), {
  ssr: false,
  loading: () => <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />,
});

type RescueViewProps = { sosId: string };

export function RescueView({ sosId }: RescueViewProps) {
  const [record, setRecord] = useState<RescueRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [passportUrl, setPassportUrl] = useState(`/rescue/${sosId}`);
  const isDemo = record?.sos.source === "demo";

  const loadRecord = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(`/api/rescue/${encodeURIComponent(sosId)}?view=limited`, {
          cache: "no-store",
          signal,
          credentials: "include",
        });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error?.message || "Emergency response brief not found.");
        }
        setRecord(json.data as RescueRecord);
        setError("");
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(
          reason instanceof Error
            ? reason.message
            : "The emergency response brief could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [sosId],
  );

  useEffect(() => {
    const updateUrl = window.setTimeout(
      () => setPassportUrl(`${window.location.origin}/rescue/${sosId}`),
      0,
    );
    const controller = new AbortController();
    const initialLoad = window.setTimeout(
      () => void loadRecord(controller.signal),
      0,
    );
    const timer = window.setInterval(() => void loadRecord(), 20_000);

    return () => {
      controller.abort();
      window.clearTimeout(updateUrl);
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadRecord, sosId]);

  if (loading) {
    return (
      <main className="rescue-shell mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="space-y-4" aria-label="Loading emergency response brief">
          <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
          <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      </main>
    );
  }

  if (error || !record) {
    return (
      <main className="rescue-shell mx-auto max-w-xl px-6 py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-red-700">
          Response brief unavailable
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">
          The emergency response brief could not be loaded.
        </h1>
        <p className="mt-3 text-slate-600">{error}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void loadRecord();
            }}
            className="rounded-xl bg-slate-950 px-4 py-2 font-bold text-white"
          >
            Retry
          </button>
          <Link
            href="/responder/cases"
            className="rounded-xl border border-slate-300 px-4 py-2 font-bold"
          >
            Responder cases
          </Link>
        </div>
      </main>
    );
  }

  const { sos } = record;
  const sensor = sos.latestSensorReading;
  const priority = operationalPriority({ source: sos.source, status: sos.status, symptomSeverity: sos.symptomSeverity, readingIsStale: sensor?.isStale ?? true, locationIsStale: sos.locationIsStale });
  const locationDetail = sos.locationCapturedAt
    ? `${formatAge(sos.locationAgeSeconds || 0)} · ±${Math.round(
        sos.locationAccuracy || 0,
      )} m`
    : "No location recorded";

  return (
    <main className="rescue-shell mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <nav className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <BrandLogo subtitle="Rescue" size="md" />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadRecord()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold"
          >
            Refresh
          </button>
          <Link
            href="/responder/cases"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold"
          >
            All cases
          </Link>
        </div>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p
            className={`mb-2 inline-flex rounded-full px-3 py-1 text-xs font-black tracking-wide ${
              isDemo
                ? "bg-amber-100 text-amber-900"
                : "bg-red-100 text-red-800"
            }`}
          >
            {isDemo ? "DEMO CASE" : "LIMITED EMERGENCY RESPONSE BRIEF"}
          </p>
          <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            {sos.trekkerName}
          </h1>
          <p className="mt-1 text-slate-600">
            Emergency case activated{" "}
            {new Date(sos.activatedAt).toLocaleString()}
          </p>
          <p className="mt-3 font-mono text-xs text-slate-500">ID: {sos.id}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <QRCodeSVG value={passportUrl} size={112} aria-label="Emergency response brief QR code" />
          <p className="mt-1 text-center text-xs font-semibold text-slate-500">
            Authorized emergency view
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard label="SOS status" value={sos.status} tone="red" />
        <StatusCard
          label="Operational Priority"
          value={priority.level}
          detail={`${priority.explanation}. Not a diagnosis.`}
          tone="red"
        />
        <StatusCard
          label="WhatsApp status"
          value={sos.notificationStatus}
          detail={
            sos.notificationStatus === "simulated"
              ? "Meta was not contacted"
              : `${record.notificationAttempts.length} notification attempt(s)`
          }
          tone="amber"
        />
        <StatusCard
          label="Location"
          value={sos.locationIsStale ? "Last known" : "Recent"}
          detail={locationDetail}
          tone={sos.locationIsStale ? "amber" : "green"}
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black text-slate-950">Emergency response context</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-bold text-slate-500">Blood group</dt>
              <dd className="text-lg font-black text-slate-950">
                {sos.bloodGroup || "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-500">Medical notes</dt>
              <dd className="mt-1 text-slate-700">
                {sos.medicalNotes || "No notes provided."}
              </dd>
            </div>
            <div><dt className="font-bold text-slate-500">Date of birth</dt><dd className="mt-1 text-slate-700">{sos.dateOfBirth || "Not provided"}</dd></div>
            <div><dt className="font-bold text-slate-500">Allergies</dt><dd className="mt-1 text-slate-700">{sos.allergies || "Not provided"}</dd></div>
            <div><dt className="font-bold text-slate-500">Known conditions</dt><dd className="mt-1 text-slate-700">{sos.knownConditions || "Not provided"}</dd></div>
            <div><dt className="font-bold text-slate-500">Current medications</dt><dd className="mt-1 text-slate-700">{sos.currentMedications || "Not provided"}</dd></div>
            <div><dt className="font-bold text-slate-500">Emergency contact</dt><dd className="mt-1 text-slate-700">{[sos.emergencyContactName, sos.emergencyContactPhone].filter(Boolean).join(" · ") || "Not provided"}</dd></div>
            <div><dt className="font-bold text-slate-500">Emergency notes</dt><dd className="mt-1 text-slate-700">{sos.emergencyNotes || "Not provided"}</dd></div>
            <div>
              <dt className="font-bold text-slate-500">Latest symptom notes</dt>
              <dd className="mt-1 text-slate-700">
                {sos.symptomNotes || "No notes provided."}
              </dd>
            </div>
            {sos.mapUrl ? (
              <div>
                <a
                  href={sos.mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-lg bg-teal-700 px-4 py-2 font-bold text-white"
                >
                  Open coordinates
                </a>
              </div>
            ) : null}
          </dl>
        </div>

        {sos.latitude != null && sos.longitude != null ? (
          <EmergencyMap
            latitude={sos.latitude}
            longitude={sos.longitude}
            accuracyMeters={sos.locationAccuracy ?? undefined}
            locations={record.routeCoordinates}
            sosTime={sos.locationCapturedAt ?? undefined}
            isStale={sos.locationIsStale}
            isDemo={isDemo}
          />
        ) : (
          <div className="flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-600">
            Location unavailable. Continue refreshing this response brief for updates.
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-black text-slate-950">
              Recent device trend
            </h2>
            <p className="text-sm text-slate-600">
              Latest available device readings; missing values remain unavailable.
            </p>
          </div>
          {sensor ? (
            <p className="text-sm font-semibold text-slate-600">
              Latest: {sensor.heartRate ?? "—"} bpm · {sensor.spo2 ?? "—"}% SpO₂
            </p>
          ) : null}
        </div>
        <SensorCharts readings={record.sensorHistory} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black text-slate-950">Case timeline</h2>
        <ol className="mt-5 space-y-4 border-l-2 border-teal-200 pl-5">
          {record.timeline.map((entry) => (
            <li key={`${entry.timestamp}-${entry.type || entry.message}`}>
              <p className="font-bold text-slate-800">{entry.message}</p>
              <time className="text-sm text-slate-500">
                {new Date(entry.timestamp).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      </section>

      <p className="rounded-xl border border-slate-200 bg-slate-100 p-4 text-sm text-slate-700">
        {record.disclaimer ||
          "MORAINE supports emergency response and does not replace professional medical evaluation or emergency services."}
      </p>
    </main>
  );
}
