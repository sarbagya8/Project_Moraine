"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { NearbyCarePanel } from "@/components/shared/nearby-care-panel";
import { DataCard, EmptyState, ErrorState, displayUserId, formatTime, LoadingState, PageHeading, relativeAge, StatusBadge } from "@/components/shared/portal-ui";
import { operationalPriority, portalRequest } from "@/lib/portal-api";
import type { PortalReading } from "@/lib/portal-api";

const SafetyMap = dynamic(() => import("@/components/shared/safety-map"), { ssr: false });

type CaseDetail = {
  caseWorkflowReady: boolean;
  sos: {
    id: string; trekkerId: string; trekkerName: string; status: string; source: string; activatedAt: string;
    acknowledgedAt: string | null; inProgressAt: string | null; resolvedAt: string | null;
    deviceId: string | null; notificationStatus: string; latitude: number | null; longitude: number | null;
    locationAccuracy: number | null; locationCapturedAt: string | null; locationIsStale: boolean;
    latestSensorReading: (PortalReading & { isStale: boolean }) | null;
    caseSensorSnapshot: { fallDetected: boolean | null; fallType: string | null } | null;
    wearable: { active: boolean; lastSeenAt: string | null } | null;
    symptom: string | null; symptomSeverity: string | null; symptomNotes: string | null;
    dateOfBirth: string | null; bloodGroup: string | null; allergies: string | null; knownConditions: string | null;
    currentMedications: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null;
    emergencyNotes: string | null; medicalNotes: string | null;
  };
  latestSymptom: { symptom: string; severity: string; duration?: string | null; notes: string | null; createdAt: string } | null;
  notificationAttempts: Array<{ provider: string | null; status: string; providerReference: string | null; failureReason: string | null; createdAt: string }>;
  timeline: Array<{ timestamp: string; type: string; message: string; actor?: string | null }>;
};

function sourceLabel(source: string) {
  if (source === "physical_button") return "Physical safety device SOS";
  if (source === "web_button") return "Trekker portal SOS";
  if (source === "manual") return "Responder-created case";
  return source.replaceAll("_", " ");
}

export function CaseDetails({ caseId }: { caseId: string }) {
  const [data, setData] = useState<CaseDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await portalRequest<CaseDetail>(`/api/rescue/${encodeURIComponent(caseId)}`));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The case could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 8_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  async function update(status: string, responseNote?: string) {
    if (pending) return;
    setPending(status);
    try {
      await portalRequest(`/api/rescue/${encodeURIComponent(caseId)}`, { method: "PATCH", body: JSON.stringify({ status, note: responseNote || undefined }) });
      setNote("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The case could not be updated.");
    } finally {
      setPending("");
    }
  }

  if (loading) return <LoadingState label="Loading case details" />;
  if (error && !data) return <ErrorState message={error} retry={() => void load()} />;
  if (!data) return null;
  const item = data.sos;
  const reading = item.latestSensorReading;
  const priority = operationalPriority({ source: item.source, status: item.status, fallDetected: reading?.fallDetected ?? item.caseSensorSnapshot?.fallDetected, symptomSeverity: item.symptomSeverity, readingIsStale: reading?.isStale ?? true, locationIsStale: item.locationIsStale });
  const open = !["resolved", "cancelled"].includes(item.status);
  const mapPoints = item.latitude != null && item.longitude != null ? [{ id: item.id, latitude: item.latitude, longitude: item.longitude, accuracyMeters: item.locationAccuracy, capturedAt: item.locationCapturedAt || undefined, label: item.trekkerName, detail: item.locationIsStale ? "Stale case location" : "Recent case location", status: open ? "active" as const : "normal" as const }] : [];
  const passport = [
    ["Blood group", item.bloodGroup], ["Allergies", item.allergies], ["Known conditions", item.knownConditions],
    ["Medications", item.currentMedications], ["Emergency notes", item.emergencyNotes || item.medicalNotes],
    ["Emergency contact", [item.emergencyContactName, item.emergencyContactPhone].filter(Boolean).join(" · ")],
  ];

  return (
    <>
      {error ? <div className="inline-warning" role="alert">{error}</div> : null}
      <PageHeading eyebrow={`Case ${item.id}`} title={item.trekkerName} description={`${displayUserId(item.trekkerId)} · ${sourceLabel(item.source)}`} action={<StatusBadge value={item.status} />} />
      {!data.caseWorkflowReady ? <div className="inline-warning">Case notes and the in-progress state will be available after the pending focused database migration. Existing case viewing and core status handling remain available.</div> : null}
      <section className="summary-grid">
        <DataCard label="Operational Priority" value={<StatusBadge value={priority.level} tone={priority.level === "high" ? "red" : priority.level === "medium" ? "amber" : "sage"} />} detail={priority.explanation} />
        <DataCard label="Created" value={formatTime(item.activatedAt)} />
        <DataCard label="Acknowledged" value={item.acknowledgedAt ? formatTime(item.acknowledgedAt) : "Not acknowledged"} />
        <DataCard label="Emergency source" value={sourceLabel(item.source)} />
        <DataCard label="Safety device" value={<StatusBadge value={!item.wearable ? "unavailable" : item.wearable.active ? "active" : "offline"} />} detail={item.wearable ? `Last seen ${relativeAge(item.wearable.lastSeenAt)}` : "No linked device state"} />
        <DataCard label="Notification" value={<StatusBadge value={item.notificationStatus} />} />
      </section>

      <section className="panel">
        <div className="section-heading"><div><p className="eyebrow">Response controls</p><h2>Case workflow</h2></div></div>
        <div className="button-row">
          {item.status === "new" ? <button className="warning-button" disabled={Boolean(pending)} onClick={() => void update("acknowledged")}>Acknowledge</button> : null}
          {item.status === "acknowledged" ? <button className="primary-button" disabled={Boolean(pending) || !data.caseWorkflowReady} onClick={() => void update("in_progress")}>Mark In Progress</button> : null}
          {open && item.status !== "new" ? <button className="danger-button" disabled={Boolean(pending)} onClick={() => void update("resolved")}>Resolve</button> : null}
          {open ? <button className="secondary-button" disabled={Boolean(pending)} onClick={() => { if (window.confirm("Cancel this emergency case?")) void update("cancelled"); }}>Cancel case</button> : null}
        </div>
        {open ? <form className="inline-form case-note-form" onSubmit={(event) => { event.preventDefault(); if (note.trim()) void update(item.status, note.trim()); }}><label>Response note<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={2} placeholder="Record an action or handoff" /></label><button className="secondary-button" type="submit" disabled={!note.trim() || Boolean(pending) || !data.caseWorkflowReady}>Add note</button></form> : null}
      </section>

      <section className="panel">
        <div className="section-heading"><div><p className="eyebrow">AVAILABLE TELEMETRY</p><h2>Persisted device information</h2></div><StatusBadge value={!reading ? "unavailable" : reading.isStale ? "stale" : "recent"} /></div>
        <div className="summary-grid">
          <DataCard label="Heart rate" value={reading?.heartRate == null ? "Unavailable" : `${reading.heartRate} bpm`} />
          <DataCard label="SpO₂" value={reading?.spo2 == null ? "Unavailable" : `${reading.spo2}%`} />
          <DataCard label="Sensor state" value={reading?.sensorState ? reading.sensorState.replaceAll("_", " ") : "Unavailable"} />
          <DataCard label="Fall state" value={reading?.fallDetected == null ? "Unavailable" : reading.fallDetected ? `Detected${reading.fallType ? ` · ${reading.fallType}` : ""}` : "Clear"} />
          <DataCard label="Ambient temperature" value={reading?.temperature == null ? "Unavailable" : `${reading.temperature} °C`} />
          <DataCard label="Latest reading" value={reading ? formatTime(reading.capturedAt) : "Unavailable"} />
        </div>
      </section>

      <section className="content-grid">
        <article className="panel"><p className="eyebrow">RESPONSE PROFILE</p><h2>Voluntary emergency details</h2><dl className="detail-list">{passport.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not provided"}</dd></div>)}</dl></article>
        <article className="panel"><p className="eyebrow">FIELD CHECK-IN</p><h2>Reported context</h2>{data.latestSymptom ? <dl className="detail-list"><div><dt>Condition</dt><dd>{data.latestSymptom.symptom}</dd></div><div><dt>Severity</dt><dd>{data.latestSymptom.severity}</dd></div><div><dt>Duration</dt><dd>{data.latestSymptom.duration || "Not provided"}</dd></div><div><dt>Note</dt><dd>{data.latestSymptom.notes || "Not provided"}</dd></div><div><dt>Reported</dt><dd>{formatTime(data.latestSymptom.createdAt)}</dd></div></dl> : <EmptyState title="No field check-in available" />}</article>
      </section>

      <section className="panel"><div className="section-heading"><div><p className="eyebrow">Location</p><h2>Latest case position</h2></div><StatusBadge value={!item.locationCapturedAt ? "unavailable" : item.locationIsStale ? "stale" : "recent"} /></div><SafetyMap points={mapPoints} /><dl className="compact-details"><div><dt>Coordinates</dt><dd>{item.latitude == null || item.longitude == null ? "Unavailable" : `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`}</dd></div><div><dt>Accuracy</dt><dd>{item.locationAccuracy == null ? "Unavailable" : `±${Math.round(item.locationAccuracy)} m`}</dd></div><div><dt>Updated</dt><dd>{formatTime(item.locationCapturedAt)}</dd></div></dl><NearbyCarePanel latitude={item.latitude} longitude={item.longitude} userLabel={item.trekkerName} /></section>

      <section className="content-grid">
        <article className="panel"><p className="eyebrow">Communication</p><h2>WhatsApp notification</h2>{data.notificationAttempts.length ? data.notificationAttempts.map((attempt, index) => <div className="list-row" key={`${attempt.createdAt}-${index}`}><div><strong>{attempt.provider || "WhatsApp"}</strong><small>{formatTime(attempt.createdAt)}{attempt.failureReason ? ` · ${attempt.failureReason}` : ""}</small></div><StatusBadge value={attempt.status} /></div>) : <EmptyState title="No notification attempts yet" />}</article>
        <article className="panel"><p className="eyebrow">Case timeline</p><h2>Recorded activity</h2>{data.timeline.length ? <ol className="case-timeline">{data.timeline.map((event, index) => <li key={`${event.timestamp}-${event.type}-${index}`}><span>{formatTime(event.timestamp)}</span><strong>{event.message}</strong>{event.actor ? <small>{event.actor}</small> : null}</li>)}</ol> : <EmptyState title="No case activity recorded" />}</article>
      </section>
    </>
  );
}
