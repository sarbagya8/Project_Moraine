"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AuthorityOverview,
  type PortalEmergency,
  type PortalTrekker,
  portalRequest,
} from "@/lib/portal-api";
import {
  DataCard,
  DetailLink,
  EmptyState,
  ErrorState,
  formatTime,
  LoadingState,
  PageHeading,
  relativeAge,
  StatusBadge,
} from "@/components/shared/portal-ui";
import { deviceFreshnessState } from "@/lib/device-freshness";

const SafetyMap = dynamic(() => import("@/components/shared/safety-map"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map…</div>,
});

export type AuthorityView =
  | "dashboard"
  | "emergencies"
  | "emergency"
  | "trekkers"
  | "trekker"
  | "devices"
  | "notifications"
  | "settings";

function deviceState(
  lastSeenAt: string | null,
  isActive: boolean,
  freshness: AuthorityOverview["freshness"],
) {
  return deviceFreshnessState(lastSeenAt, isActive, {
    onlineSeconds: freshness.deviceOnlineSeconds,
    offlineSeconds: freshness.deviceOfflineSeconds,
  });
}

function sourceLabel(source: string) {
  return source.replaceAll("_", " ");
}

function EmergencyTable({ events }: { events: PortalEmergency[] }) {
  if (!events.length) return <EmptyState title="No active emergencies" />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Trekker</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Freshness</th>
            <th>Notification</th>
            <th>Created</th>
            <th><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>
                <strong>{event.trekkerName}</strong>
                <small>{event.trekkerId} · {event.route || "Route unavailable"}</small>
              </td>
              <td>
                <strong>{event.severityScore ?? "Insufficient data"}</strong>
                <small>{event.severityLabel || "unavailable"}</small>
              </td>
              <td><StatusBadge value={event.status} /></td>
              <td>
                <StatusBadge
                  value={event.locationIsStale || event.readingIsStale ? "stale" : "recent"}
                  tone={event.locationIsStale || event.readingIsStale ? "amber" : "green"}
                />
              </td>
              <td><StatusBadge value={event.notificationStatus} /></td>
              <td>{formatTime(event.createdAt)}</td>
              <td><DetailLink href={`/authority/emergencies/${event.id}`}>Open</DetailLink></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AuthorityPortal({
  view,
  recordId,
}: {
  view: AuthorityView;
  recordId?: string;
}) {
  const [data, setData] = useState<AuthorityOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await portalRequest<AuthorityOverview>("/api/authority/overview"));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authority data is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  async function updateEmergency(id: string, status: string) {
    setPending(id);
    try {
      await portalRequest(`/api/rescue/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The emergency could not be updated.");
    } finally {
      setPending("");
    }
  }

  async function retryNotification(id: string) {
    setPending(`retry:${id}`);
    try {
      await portalRequest(`/api/rescue/${encodeURIComponent(id)}/retry-notification`, {
        method: "POST",
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The notification could not be retried.");
    } finally {
      setPending("");
    }
  }

  if (loading) return <LoadingState label="Loading authority portal" />;
  if (error && !data) return <ErrorState message={error} retry={() => void load()} />;
  if (!data) return null;

  const activeEvents = data.emergencies.filter((event) => event.status !== "resolved");
  const failedAttempts = data.notificationAttempts.filter((attempt) => attempt.status === "failed");
  const onlineDevices = data.devices.filter((device) => deviceState(device.lastSeenAt, device.isActive, data.freshness) === "online");
  const staleDevices = data.devices.filter((device) => deviceState(device.lastSeenAt, device.isActive, data.freshness) !== "online");

  let content: React.ReactNode;
  if (view === "dashboard") {
    const mapPoints = data.trekkers
      .filter((trekker) => trekker.latestLocation)
      .map((trekker) => {
        const emergency = activeEvents.find((event) => event.trekkerId === trekker.id);
        return {
          id: trekker.id,
          latitude: trekker.latestLocation!.latitude,
          longitude: trekker.latestLocation!.longitude,
          accuracyMeters: trekker.latestLocation!.accuracyMeters,
          capturedAt: trekker.latestLocation!.capturedAt,
          label: trekker.name,
          detail: trekker.route || "Route unavailable",
          status: emergency?.status === "active"
            ? "active" as const
            : emergency?.status === "acknowledged"
              ? "acknowledged" as const
              : trekker.latestLocation!.ageSeconds > data.freshness.locationSeconds
                ? "stale" as const
                : "normal" as const,
          href: emergency
            ? `/authority/emergencies/${emergency.id}`
            : `/authority/trekkers/${trekker.id}`,
        };
      });
    content = (
      <>
        <PageHeading
          eyebrow="Operational overview"
          title="Authority dashboard"
          description={`Last update: ${relativeAge(data.generatedAt)}. Emergency and device data refresh every 5 seconds while this page is visible.`}
          action={<button className="secondary-button" onClick={() => void load()}>Refresh</button>}
        />
        <section className="summary-grid">
          <DataCard label="Active trekkers" value={data.trekkers.filter((row) => row.isActive).length} />
          <DataCard label="Active SOS events" value={activeEvents.length} />
          <DataCard label="Unacknowledged" value={activeEvents.filter((row) => row.status === "active").length} />
          <DataCard label="Devices online" value={onlineDevices.length} />
          <DataCard label="Stale / offline" value={staleDevices.length} />
          <DataCard label="Failed notifications" value={failedAttempts.length} />
        </section>
        <section className="content-grid wide-map">
          <article className="panel">
            <div className="section-heading">
              <div><p className="eyebrow">Authorized locations</p><h2>Current trekker map</h2></div>
              <DetailLink href="/authority/trekkers">All trekkers</DetailLink>
            </div>
            <SafetyMap points={mapPoints} />
          </article>
          <article className="panel">
            <div className="section-heading"><div><p className="eyebrow">Device health</p><h2>Latest connections</h2></div></div>
            <div className="stack-list">
              {data.devices.slice(0, 8).map((device) => {
                const state = deviceState(device.lastSeenAt, device.isActive, data.freshness);
                return (
                  <div className="list-row" key={device.id}>
                    <div><strong>{device.id}</strong><small>{device.trekkerName || "Unassigned"}</small></div>
                    <div className="align-right"><StatusBadge value={state} /><small>{relativeAge(device.lastSeenAt)}</small></div>
                  </div>
                );
              })}
              {!data.devices.length ? <EmptyState title="No devices are registered yet" /> : null}
            </div>
          </article>
        </section>
        <section className="panel">
          <div className="section-heading"><div><p className="eyebrow">Priority queue</p><h2>Active emergencies</h2></div><DetailLink href="/authority/emergencies">View all</DetailLink></div>
          <EmergencyTable events={activeEvents.slice(0, 8)} />
        </section>
        <section className="content-grid">
          <article className="panel">
            <div className="section-heading"><div><p className="eyebrow">Recent telemetry</p><h2>Latest trekker activity</h2></div></div>
            <div className="stack-list">
              {data.trekkers
                .filter((trekker) => trekker.latestReading || trekker.latestLocation)
                .sort((left, right) => {
                  const leftTime = left.latestReading?.capturedAt || left.latestLocation?.capturedAt || "";
                  const rightTime = right.latestReading?.capturedAt || right.latestLocation?.capturedAt || "";
                  return rightTime.localeCompare(leftTime);
                })
                .slice(0, 6)
                .map((trekker) => (
                  <div className="list-row" key={trekker.id}>
                    <div><strong>{trekker.name}</strong><small>{trekker.id} · {trekker.route || "Route unavailable"}</small></div>
                    <div className="align-right"><StatusBadge value={trekker.isActive ? "active" : "inactive"} /><small>{relativeAge(trekker.latestReading?.capturedAt || trekker.latestLocation?.capturedAt)}</small></div>
                  </div>
                ))}
              {!data.trekkers.some((trekker) => trekker.latestReading || trekker.latestLocation) ? <EmptyState title="No recent trekker activity" /> : null}
            </div>
          </article>
          <article className="panel">
            <div className="section-heading"><div><p className="eyebrow">WhatsApp audit</p><h2>Recent notification attempts</h2></div><DetailLink href="/authority/notifications">View all</DetailLink></div>
            <div className="stack-list">
              {data.notificationAttempts.slice(0, 6).map((attempt) => (
                <div className="list-row" key={attempt.id}>
                  <div><strong>{attempt.recipient}</strong><small>{attempt.sosEventId.slice(0, 8)}… · {relativeAge(attempt.createdAt)}</small></div>
                  <StatusBadge value={attempt.status} />
                </div>
              ))}
              {!data.notificationAttempts.length ? <EmptyState title="No notification attempts yet" /> : null}
            </div>
          </article>
        </section>
      </>
    );
  } else if (view === "emergencies") {
    content = (
      <>
        <PageHeading eyebrow="Rescue operations" title="Active emergencies" description="Review SOS severity, freshness, and notification state before opening the full response record." />
        <section className="panel"><EmergencyTable events={activeEvents} /></section>
        {data.emergencies.some((event) => event.status === "resolved") ? (
          <section className="panel">
            <div className="section-heading"><div><p className="eyebrow">History</p><h2>Recently resolved</h2></div></div>
            <EmergencyTable events={data.emergencies.filter((event) => event.status === "resolved").slice(0, 20)} />
          </section>
        ) : null}
      </>
    );
  } else if (view === "emergency") {
    const event = data.emergencies.find((item) => item.id === recordId);
    const attempts = data.notificationAttempts.filter((item) => item.sosEventId === recordId);
    content = event ? (
      <>
        <PageHeading
          eyebrow={`SOS tracking ID ${event.id}`}
          title={event.trekkerName}
          description={`${event.trekkerId} · ${event.route || "Route unavailable"} · ${sourceLabel(event.source)}`}
          action={<StatusBadge value={event.status} />}
        />
        <section className="summary-grid">
          <DataCard label="Severity" value={event.severityScore == null ? "Insufficient data" : `${event.severityScore}/100`} detail={event.severityLabel || "Unavailable"} />
          <DataCard label="Heart rate" value={event.heartRate == null ? "Unavailable" : `${event.heartRate} bpm`} />
          <DataCard label="SpO₂" value={event.spo2 == null ? "Unavailable" : `${event.spo2}%`} />
          <DataCard label="Ambient temperature" value={event.temperature == null ? "Unavailable" : `${event.temperature} °C`} />
          <DataCard label="Altitude" value={event.altitude == null ? "Unavailable" : `${event.altitude} m`} />
          <DataCard label="Notification" value={<StatusBadge value={event.notificationStatus} />} />
        </section>
        <section className="content-grid">
          <article className="panel">
            <div className="section-heading"><div><p className="eyebrow">Last known position</p><h2>Emergency map</h2></div></div>
            <SafetyMap points={event.latitude != null && event.longitude != null ? [{
              id: event.id,
              latitude: event.latitude,
              longitude: event.longitude,
              accuracyMeters: event.locationAccuracy,
              capturedAt: event.locationCapturedAt || undefined,
              label: event.trekkerName,
              detail: event.locationIsStale ? "Stale emergency location" : "Recent emergency location",
              status: event.status === "acknowledged" ? "acknowledged" : event.status === "active" ? "active" : "normal",
            }] : []} />
          </article>
          <article className="panel">
            <p className="eyebrow">Snapshot</p><h2>Emergency context</h2>
            <dl className="detail-list">
              <div><dt>Created</dt><dd>{formatTime(event.createdAt)}</dd></div>
              <div><dt>ARGUS device</dt><dd>{event.deviceId || "Unavailable"}</dd></div>
              <div><dt>Hardware event ID</dt><dd>{event.hardwareEventId || "Unavailable"}</dd></div>
              <div><dt>Source</dt><dd>{sourceLabel(event.source)}</dd></div>
              <div><dt>Sensor validity</dt><dd><StatusBadge value={(event.sensorState || "unavailable").replaceAll("_", " ")} /></dd></div>
              <div><dt>Location freshness</dt><dd><StatusBadge value={event.locationIsStale ? "stale" : "recent"} /></dd></div>
              <div><dt>GPS accuracy</dt><dd>{event.locationAccuracy == null ? "Unavailable" : `±${Math.round(event.locationAccuracy)} m`}</dd></div>
              <div><dt>GPS captured</dt><dd>{event.locationCapturedAt ? formatTime(event.locationCapturedAt) : "Unavailable"}</dd></div>
              <div><dt>Reading freshness</dt><dd><StatusBadge value={event.readingIsStale ? "stale" : "recent"} /></dd></div>
              <div><dt>Symptom</dt><dd>{event.symptom || "None reported"}</dd></div>
              <div><dt>Symptom severity</dt><dd>{event.symptomSeverity || "Unspecified"}</dd></div>
              <div><dt>Notes</dt><dd>{event.symptomNotes || "No notes provided"}</dd></div>
            </dl>
            <div className="button-row">
              {event.mapUrl ? <a className="secondary-button" href={event.mapUrl} target="_blank" rel="noreferrer">Open map</a> : null}
              <Link className="secondary-button" href={`/rescue/${event.id}`}>Open Rescue Passport</Link>
              {event.status === "active" ? <button className="warning-button" disabled={pending === event.id} onClick={() => void updateEmergency(event.id, "acknowledged")}>Acknowledge SOS</button> : null}
              {event.status !== "resolved" ? <button className="danger-button" disabled={pending === event.id} onClick={() => void updateEmergency(event.id, "resolved")}>Mark resolved</button> : null}
              {event.status === "resolved" ? <button className="secondary-button" disabled={pending === event.id} onClick={() => void updateEmergency(event.id, "active")}>Reopen</button> : null}
              {["failed", "not_configured"].includes(event.notificationStatus) ? <button className="secondary-button" disabled={pending === `retry:${event.id}`} onClick={() => void retryNotification(event.id)}>{pending === `retry:${event.id}` ? "Retrying notification…" : "Retry WhatsApp"}</button> : null}
            </div>
          </article>
        </section>
        <section className="panel">
          <div className="section-heading"><div><p className="eyebrow">Meta WhatsApp Cloud API</p><h2>Notification attempts</h2></div></div>
          {attempts.length ? (
            <div className="stack-list">
              {attempts.map((attempt) => (
                <div className="list-row" key={attempt.id}>
                  <div><strong>{attempt.recipient}</strong><small>{attempt.providerMessageId || "No provider reference"}</small></div>
                  <div className="align-right"><StatusBadge value={attempt.status} /><small>{formatTime(attempt.createdAt)}</small></div>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No notification attempts yet" />}
        </section>
      </>
    ) : <ErrorState message="Could not load this emergency." />;
  } else if (view === "trekkers") {
    content = <TrekkersList trekkers={data.trekkers} emergencies={activeEvents} freshness={data.freshness} />;
  } else if (view === "trekker") {
    const trekker = data.trekkers.find((item) => item.id === recordId);
    const history = data.emergencies.filter((event) => event.trekkerId === recordId);
    const attempts = data.notificationAttempts.filter((attempt) => attempt.trekkerId === recordId);
    content = trekker ? <TrekkerDetail trekker={trekker} history={history} attempts={attempts} freshness={data.freshness} /> : <ErrorState message="Could not load this trekker." />;
  } else if (view === "devices") {
    content = <DeviceManager data={data} refresh={load} />;
  } else if (view === "notifications") {
    content = <NotificationList data={data} />;
  } else {
    content = (
      <>
        <PageHeading eyebrow="Portal configuration" title="Settings" description="Operational settings remain server-controlled so credentials and safety limits never enter the browser bundle." />
        <section className="panel prose-panel">
          <h2>Server-managed configuration</h2>
          <p>Authority credentials, session signing, Supabase access, device authentication, SOS cooldowns, and WhatsApp credentials are configured through environment variables.</p>
          <p>Use the deployment checklist to change these values. This page intentionally does not reveal their current contents.</p>
          <Link className="primary-button" href="/setup">Open setup status</Link>
        </section>
      </>
    );
  }

  return (
    <>
      {error ? <div className="inline-warning" role="alert">{error}</div> : null}
      {content}
    </>
  );
}

function TrekkersList({ trekkers, emergencies, freshness }: { trekkers: PortalTrekker[]; emergencies: PortalEmergency[]; freshness: AuthorityOverview["freshness"] }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const filtered = useMemo(() => trekkers.filter((trekker) => {
    const matches = `${trekker.name} ${trekker.id}`.toLowerCase().includes(query.toLowerCase());
    if (!matches) return false;
    if (state === "active" && !trekker.isActive) return false;
    if (state === "inactive" && trekker.isActive) return false;
    if (state === "sos" && !emergencies.some((event) => event.trekkerId === trekker.id)) return false;
    return true;
  }), [emergencies, query, state, trekkers]);
  return (
    <>
      <PageHeading eyebrow="Registered people" title="Trekkers" description="Search profiles, review device state, and open current safety information." />
      <section className="filter-bar">
        <label>Search <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or trekker ID" /></label>
        <label>Filter <select value={state} onChange={(event) => setState(event.target.value)}><option value="all">All trekkers</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="sos">Active SOS</option></select></label>
      </section>
      <section className="card-list">
        {filtered.map((trekker) => {
          const emergency = emergencies.find((event) => event.trekkerId === trekker.id);
          const stateLabel = trekker.device ? deviceState(trekker.device.lastSeenAt, trekker.device.isActive, freshness) : "never_connected";
          return (
            <article className="person-card" key={trekker.id}>
              <div className="section-heading"><div><p className="eyebrow">{trekker.id}</p><h2>{trekker.name}</h2></div>{emergency ? <StatusBadge value="active SOS" tone="red" /> : <StatusBadge value={trekker.isActive ? "active" : "inactive"} />}</div>
              <p>{trekker.route || "Route unavailable"}</p>
              <dl className="compact-details">
                <div><dt>Device</dt><dd>{trekker.device?.id || "Unassigned"} · <StatusBadge value={stateLabel} /></dd></div>
                <div><dt>Location</dt><dd>{relativeAge(trekker.latestLocation?.capturedAt)}</dd></div>
                <div><dt>Reading</dt><dd>{relativeAge(trekker.latestReading?.capturedAt)}</dd></div>
              </dl>
              <DetailLink href={`/authority/trekkers/${trekker.id}`}>Open profile</DetailLink>
            </article>
          );
        })}
        {!filtered.length ? <EmptyState title="No trekkers match these filters" /> : null}
      </section>
    </>
  );
}

function TrekkerDetail({ trekker, history, attempts, freshness }: { trekker: PortalTrekker; history: PortalEmergency[]; attempts: AuthorityOverview["notificationAttempts"]; freshness: AuthorityOverview["freshness"] }) {
  const readingStale = !trekker.latestReading || (trekker.latestReading.ageSeconds || 0) > freshness.readingSeconds;
  const locationStale = !trekker.latestLocation || trekker.latestLocation.ageSeconds > freshness.locationSeconds;
  return (
    <>
      <PageHeading eyebrow={trekker.id} title={trekker.name} description={trekker.route || "Route unavailable"} action={<StatusBadge value={trekker.isActive ? "active" : "inactive"} />} />
      <section className="summary-grid">
        <DataCard label="Heart rate" value={trekker.latestReading?.heartRate == null ? "Unavailable" : `${trekker.latestReading.heartRate} bpm`} detail={readingStale ? "Stale or unavailable" : relativeAge(trekker.latestReading?.capturedAt)} />
        <DataCard label="SpO₂" value={trekker.latestReading?.spo2 == null ? "Unavailable" : `${trekker.latestReading.spo2}%`} />
        <DataCard label="Ambient temperature" value={trekker.latestReading?.temperature == null ? "Unavailable" : `${trekker.latestReading.temperature} °C`} />
        <DataCard label="Sensor state" value={trekker.latestReading?.sensorState ? <StatusBadge value={trekker.latestReading.sensorState.replaceAll("_", " ")} /> : "Unavailable"} />
        <DataCard label="Altitude" value={trekker.latestReading?.altitude == null ? "Unavailable" : `${trekker.latestReading.altitude} m`} />
        <DataCard label="Pressure" value={trekker.latestReading?.pressure == null ? "Unavailable" : `${trekker.latestReading.pressure} hPa`} />
        <DataCard label="AMS indicator" value={trekker.latestReading?.amsStatus ?? "Unavailable"} detail="Device-generated; not a diagnosis." />
        <DataCard label="Fall state" value={!trekker.latestReading || trekker.latestReading.fallDetected == null ? "Unavailable" : trekker.latestReading.fallDetected ? `Detected${trekker.latestReading.fallType ? ` · ${trekker.latestReading.fallType}` : ""}` : "Clear"} />
        <DataCard label="Physical SOS" value={!trekker.latestReading || trekker.latestReading.physicalSos == null || trekker.latestReading.sosCountdown == null ? "Unavailable" : trekker.latestReading.physicalSos ? "Active" : trekker.latestReading.sosCountdown ? "Countdown" : "Inactive"} />
      </section>
      <section className="content-grid">
        <article className="panel"><p className="eyebrow">Latest GPS</p><h2>Location</h2><SafetyMap points={trekker.latestLocation ? [{ id: trekker.id, latitude: trekker.latestLocation.latitude, longitude: trekker.latestLocation.longitude, accuracyMeters: trekker.latestLocation.accuracyMeters, capturedAt: trekker.latestLocation.capturedAt, label: trekker.name, detail: locationStale ? "Stale location" : "Recent location", status: locationStale ? "stale" : "normal" }] : []} /></article>
        <article className="panel"><p className="eyebrow">Profile</p><h2>Safety details</h2><dl className="detail-list"><div><dt>Device</dt><dd>{trekker.device?.id || "Unassigned"}</dd></div><div><dt>Blood group</dt><dd>{trekker.bloodGroup || "Not provided"}</dd></div><div><dt>Emergency contact</dt><dd>{trekker.emergencyContact || "Not provided"}</dd></div><div><dt>Guide contact</dt><dd>{trekker.guideMobile || "Not provided"}</dd></div><div><dt>Medical notes</dt><dd>{trekker.medicalNotes || "No notes provided"}</dd></div><div><dt>Latest symptom</dt><dd>{trekker.latestSymptom ? `${trekker.latestSymptom.symptom} (${trekker.latestSymptom.severity})` : "No symptom report"}</dd></div></dl></article>
      </section>
      <section className="panel"><p className="eyebrow">Safety notice</p><p>Sensor readings support safety monitoring and are not a medical diagnosis.</p></section>
      <section className="panel">
        <div className="section-heading"><div><p className="eyebrow">Telemetry</p><h2>Recent readings</h2></div></div>
        {trekker.readingHistory.length ? (
          <div className="table-wrap"><table><thead><tr><th>Captured</th><th>State</th><th>Heart rate</th><th>SpO₂</th><th>Ambient temp.</th><th>Altitude</th></tr></thead><tbody>
            {[...trekker.readingHistory].reverse().map((reading) => <tr key={`${reading.capturedAt}-${reading.sensorState}`}><td>{formatTime(reading.capturedAt)}</td><td>{reading.sensorState ? reading.sensorState.replaceAll("_", " ") : "Unavailable"}</td><td>{reading.heartRate == null ? "Unavailable" : `${reading.heartRate} bpm`}</td><td>{reading.spo2 == null ? "Unavailable" : `${reading.spo2}%`}</td><td>{reading.temperature == null ? "Unavailable" : `${reading.temperature} °C`}</td><td>{reading.altitude == null ? "Unavailable" : `${reading.altitude} m`}</td></tr>)}
          </tbody></table></div>
        ) : <EmptyState title="No recent readings" />}
      </section>
      <section className="panel">
        <div className="section-heading"><div><p className="eyebrow">Wellbeing</p><h2>Recent symptoms</h2></div></div>
        {trekker.symptoms.length ? trekker.symptoms.map((symptom) => <div className="list-row" key={`${symptom.createdAt}-${symptom.symptom}`}><div><strong>{symptom.symptom}</strong><small>{symptom.notes || "No notes provided"}</small></div><div className="align-right"><StatusBadge value={symptom.severity} /><small>{formatTime(symptom.createdAt)}</small></div></div>) : <EmptyState title="No symptoms reported" />}
      </section>
      <section className="panel"><div className="section-heading"><div><p className="eyebrow">History</p><h2>Recent SOS events</h2></div></div><EmergencyTable events={history} /></section>
      <section className="panel"><div className="section-heading"><div><p className="eyebrow">Delivery history</p><h2>Recent notifications</h2></div></div>{attempts.length ? attempts.map((attempt) => <div className="list-row" key={attempt.id}><div><strong>{attempt.recipient}</strong><small>{formatTime(attempt.createdAt)}</small></div><StatusBadge value={attempt.status} /></div>) : <EmptyState title="No notification attempts yet" />}</section>
    </>
  );
}

function DeviceManager({ data, refresh }: { data: AuthorityOverview; refresh: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  async function createDevice(formData: FormData) {
    if (pendingAction) return;
    setPendingAction("create");
    setMessage("");
    try {
      const result = await portalRequest<{ pairingCode: string; warning: string }>("/api/devices", { method: "POST", body: JSON.stringify({ id: formData.get("id"), trekkerId: formData.get("trekkerId") || null }) });
      setPairingCode(result.pairingCode);
      setMessage(result.warning);
      await refresh();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "The device could not be created."); }
    finally { setPendingAction(null); }
  }
  async function update(id: string, changes: Record<string, unknown>) {
    if (pendingAction) return;
    setPendingAction(`update:${id}`);
    setMessage("");
    try {
      const result = await portalRequest<{ pairingCode?: string; warning?: string }>(`/api/devices/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) });
      if (result.pairingCode) setPairingCode(result.pairingCode);
      setMessage(result.warning || "Device updated.");
      await refresh();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "The device could not be updated."); }
    finally { setPendingAction(null); }
  }
  return (
    <>
      <PageHeading eyebrow="ESP32 registry" title="Devices" description="Register hardware, assign a trekker, and monitor the last connection received by ARGUS." />
      <section className="panel">
        <h2>Add a device</h2>
        <form className="inline-form" action={(form) => void createDevice(form)}>
          <label>Device ID<input name="id" required pattern="[A-Za-z0-9_-]{1,100}" /></label>
          <label>Assign trekker<select name="trekkerId" defaultValue=""><option value="">Unassigned</option>{data.trekkers.filter((row) => row.isActive).map((row) => <option key={row.id} value={row.id}>{row.name} ({row.id})</option>)}</select></label>
          <button className="primary-button" type="submit" disabled={Boolean(pendingAction)}>{pendingAction === "create" ? "Adding device…" : "Add device"}</button>
        </form>
        {pairingCode ? <div className="secret-once"><strong>Pairing code — shown once</strong><code>{pairingCode}</code><button type="button" onClick={() => void navigator.clipboard.writeText(pairingCode)}>Copy</button></div> : null}
        {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
        {pendingAction ? <p className="muted" aria-live="polite">Saving device changes…</p> : null}
      </section>
      <section className="card-list">
        {data.devices.map((device) => {
          const state = deviceState(device.lastSeenAt, device.isActive, data.freshness);
          return <article className="person-card" key={device.id}><div className="section-heading"><div><p className="eyebrow">Device</p><h2>{device.id}</h2></div><StatusBadge value={state} /></div><p>{device.trekkerName || "Unassigned"}</p><p className="muted">Firmware: {device.firmwareVersion || "Not verified"} · Last seen: {relativeAge(device.lastSeenAt)}</p><div className="button-row"><button className="secondary-button" onClick={() => void update(device.id, { isActive: !device.isActive })}>{device.isActive ? "Deactivate" : "Activate"}</button><button className="secondary-button" onClick={() => void update(device.id, { trekkerId: null })}>Unassign</button><button className="secondary-button" onClick={() => void update(device.id, { regeneratePairingCode: true })}>New pairing code</button></div></article>;
        })}
        {!data.devices.length ? <EmptyState title="No devices are registered yet" /> : null}
      </section>
    </>
  );
}

function NotificationList({ data }: { data: AuthorityOverview }) {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const attempts = data.notificationAttempts.filter((attempt) => (status === "all" || attempt.status === status) && `${attempt.trekkerId} ${attempt.sosEventId}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <PageHeading eyebrow="Meta WhatsApp Cloud API" title="Notification attempts" description="Accepted means Meta accepted the request. Sent, delivered, read, and failed come from verified webhook events." />
      <section className="filter-bar"><label>Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Trekker or SOS ID" /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{["simulated","pending","accepted","sent","delivered","read","failed","not_configured"].map((value) => <option key={value}>{value}</option>)}</select></label></section>
      <section className="panel">
        {attempts.length ? <div className="table-wrap"><table><thead><tr><th>SOS / trekker</th><th>Recipient</th><th>Provider</th><th>Status</th><th>Time</th><th>Provider reference</th></tr></thead><tbody>{attempts.map((attempt) => <tr key={attempt.id}><td><Link className="text-link" href={`/authority/emergencies/${attempt.sosEventId}`}>{attempt.sosEventId.slice(0, 8)}…</Link><small>{attempt.trekkerId || "Unknown trekker"}</small></td><td>{attempt.recipient}</td><td>{attempt.provider}</td><td><StatusBadge value={attempt.status} /></td><td>{formatTime(attempt.createdAt)}</td><td>{attempt.providerMessageId || attempt.error || "Unavailable"}</td></tr>)}</tbody></table></div> : <EmptyState title="No notification attempts yet" />}</section>
    </>
  );
}
