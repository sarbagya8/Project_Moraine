"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AuthorityOverview,
  type PortalEmergency,
  type PortalTrekker,
  operationalPriority,
  portalRequest,
} from "@/lib/portal-api";
import {
  DataCard,
  DetailLink,
  displayDeviceId,
  displayUserId,
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
  | "history"
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

function PriorityDisplay({ event, explain = false }: { event: PortalEmergency; explain?: boolean }) {
  const priority = operationalPriority({ source: event.source, status: event.status, symptomSeverity: event.symptomSeverity, readingIsStale: event.readingIsStale, locationIsStale: event.locationIsStale });
  return <><StatusBadge value={priority.level} tone={priority.level === "high" ? "red" : priority.level === "medium" ? "amber" : "sage"} />{explain ? <small>{priority.explanation}</small> : null}</>;
}

function EmergencyTable({ events, emptyTitle = "No active cases" }: { events: PortalEmergency[]; emptyTitle?: string }) {
  if (!events.length) return <EmptyState title={emptyTitle} />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Trekker</th>
            <th>Operational Priority</th>
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
                <small>{displayUserId(event.trekkerId)}</small>
              </td>
              <td><PriorityDisplay event={event} explain /></td>
              <td><StatusBadge value={event.status} /></td>
              <td>
                <StatusBadge
                  value={event.locationIsStale || event.readingIsStale ? "stale" : "recent"}
                  tone={event.locationIsStale || event.readingIsStale ? "amber" : "green"}
                />
              </td>
              <td><StatusBadge value={event.notificationStatus} /></td>
              <td>{formatTime(event.createdAt)}</td>
              <td><DetailLink href={`/responder/cases/${event.id}`}>Open</DetailLink></td>
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
      setError(reason instanceof Error ? reason.message : "Responder data is unavailable.");
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
      setError(reason instanceof Error ? reason.message : "The case could not be updated.");
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

  if (loading) return <LoadingState label="Loading Responder Portal" />;
  if (error && !data) return <ErrorState message={error} retry={() => void load()} />;
  if (!data) return null;

  const activeEvents = data.emergencies.filter((event) => !["resolved", "cancelled"].includes(event.status));
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
          detail: "Latest shared location",
          status: emergency && ["active", "new"].includes(emergency.status)
            ? "active" as const
            : emergency?.status === "acknowledged"
              ? "acknowledged" as const
              : trekker.latestLocation!.ageSeconds > data.freshness.locationSeconds
                ? "stale" as const
                : "normal" as const,
          href: emergency
            ? `/responder/cases/${emergency.id}`
            : `/responder/users/${trekker.id}`,
        };
      });
    content = (
      <>
        <PageHeading
          eyebrow="Live operations"
          title="Command center"
          description={`Last signal refresh: ${relativeAge(data.generatedAt)}. Emergency and device data refresh every 5 seconds while this page is visible.`}
          action={<button className="secondary-button" onClick={() => void load()}>Refresh</button>}
        />
        <section className="summary-grid">
          <DataCard label="Trekkers monitored" value={data.trekkers.filter((row) => row.isActive).length} />
          <DataCard label="Active emergencies" value={activeEvents.length} />
          <DataCard label="Awaiting triage" value={activeEvents.filter((row) => ["active", "new"].includes(row.status)).length} />
          <DataCard label="Devices linked" value={onlineDevices.length} />
          <DataCard label="Signals stale / offline" value={staleDevices.length} />
          <DataCard label="Alert delivery failed" value={failedAttempts.length} />
        </section>
        <section className="content-grid wide-map">
          <article className="panel">
            <div className="section-heading">
              <div><p className="eyebrow">WHERE</p><h2>Last known locations</h2></div>
              <DetailLink href="/responder/users">All trekkers</DetailLink>
            </div>
            <SafetyMap points={mapPoints} />
          </article>
          <article className="panel">
            <div className="section-heading"><div><p className="eyebrow">FIELD NETWORK</p><h2>Device connections</h2></div></div>
            <div className="stack-list">
              {data.devices.slice(0, 8).map((device) => {
                const state = deviceState(device.lastSeenAt, device.isActive, data.freshness);
                return (
                  <div className="list-row" key={device.id}>
                    <div><strong>{displayDeviceId(device.id)}</strong><small>{device.trekkerName || "Unassigned"}</small></div>
                    <div className="align-right"><StatusBadge value={state} /><small>{relativeAge(device.lastSeenAt)}</small></div>
                  </div>
                );
              })}
              {!data.devices.length ? <EmptyState title="No devices are registered yet" /> : null}
            </div>
          </article>
        </section>
        <section className="panel">
          <div className="section-heading"><div><p className="eyebrow">WHAT NEEDS ATTENTION</p><h2>Priority queue</h2></div><DetailLink href="/responder/cases">View all cases</DetailLink></div>
          <EmergencyTable events={activeEvents.slice(0, 8)} />
        </section>
        <section className="content-grid">
          <article className="panel">
            <div className="section-heading"><div><p className="eyebrow">AVAILABLE SIGNAL</p><h2>Latest field activity</h2></div></div>
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
                    <div><strong>{trekker.name}</strong><small>{displayUserId(trekker.id)}</small></div>
                    <div className="align-right"><StatusBadge value={trekker.isActive ? "active" : "inactive"} /><small>{relativeAge(trekker.latestReading?.capturedAt || trekker.latestLocation?.capturedAt)}</small></div>
                  </div>
                ))}
              {!data.trekkers.some((trekker) => trekker.latestReading || trekker.latestLocation) ? <EmptyState title="No recent field signals" /> : null}
            </div>
          </article>
          <article className="panel">
            <div className="section-heading"><div><p className="eyebrow">ALERT DELIVERY</p><h2>Recent notification attempts</h2></div><DetailLink href="/responder/notifications">View all</DetailLink></div>
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
        <PageHeading eyebrow="Response operations" title="Active cases" description="Review urgent-case context, freshness, and notification state before opening the full response record." />
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
          description={`${displayUserId(event.trekkerId)} · ${sourceLabel(event.source)}`}
          action={<StatusBadge value={event.status} />}
        />
        <section className="summary-grid">
          <DataCard label="Operational Priority" value={<PriorityDisplay event={event} />} detail="Based on SOS source, acknowledgement and data freshness; not a diagnosis." />
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
              status: event.status === "acknowledged" ? "acknowledged" : ["active", "new"].includes(event.status) ? "active" : "normal",
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
              <Link className="secondary-button" href={`/rescue/${event.id}`}>Open response brief</Link>
              {["active", "new"].includes(event.status) ? <button className="warning-button" disabled={pending === event.id} onClick={() => void updateEmergency(event.id, "acknowledged")}>Acknowledge case</button> : null}
              {!["resolved", "cancelled"].includes(event.status) ? <button className="danger-button" disabled={pending === event.id} onClick={() => void updateEmergency(event.id, "resolved")}>Resolve case</button> : null}
              {["resolved", "cancelled"].includes(event.status) ? <button className="secondary-button" disabled={pending === event.id} onClick={() => void updateEmergency(event.id, "active")}>Reopen</button> : null}
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
    ) : <ErrorState message="Could not load this case." />;
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
  } else if (view === "history") {
    content = <><PageHeading eyebrow="Response record" title="Case history" description="Resolved and cancelled cases retained from real system activity." /><section className="panel"><EmergencyTable events={data.emergencies.filter((event) => ["resolved", "cancelled"].includes(event.status))} emptyTitle="No previous cases" /></section></>;
  } else {
    content = (
      <>
        <PageHeading eyebrow="Portal configuration" title="Settings" description="Operational settings remain server-controlled so credentials and safety limits never enter the browser bundle." />
        <section className="panel prose-panel">
          <h2>Server-managed configuration</h2>
          <p>Responder credentials, session signing, Supabase access, device authentication, SOS cooldowns, and WhatsApp credentials are configured through environment variables.</p>
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
    const matches = `${trekker.name} ${trekker.email || ""} ${trekker.mobileNumber || ""} ${trekker.id}`.toLowerCase().includes(query.toLowerCase());
    if (!matches) return false;
    if (state === "active" && !trekker.isActive) return false;
    if (state === "inactive" && trekker.isActive) return false;
    if (state === "sos" && !emergencies.some((event) => event.trekkerId === trekker.id)) return false;
    return true;
  }), [emergencies, query, state, trekkers]);
  return (
    <>
      <PageHeading eyebrow="Trekker registry" title="Trekkers" description="Search expedition profiles, review device state, and open the latest authorized safety context." />
      <section className="filter-bar">
        <label>Search <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email or phone" /></label>
        <label>Filter <select value={state} onChange={(event) => setState(event.target.value)}><option value="all">All trekkers</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="sos">Active case</option></select></label>
      </section>
      <section className="card-list">
        {filtered.map((trekker) => {
          const emergency = emergencies.find((event) => event.trekkerId === trekker.id);
          const stateLabel = trekker.device ? deviceState(trekker.device.lastSeenAt, trekker.device.isActive, freshness) : "never_connected";
          return (
            <article className="person-card" key={trekker.id}>
              <div className="section-heading"><div><p className="eyebrow">{displayUserId(trekker.id)}</p><h2>{trekker.name}</h2></div>{emergency ? <StatusBadge value="active SOS" tone="red" /> : <StatusBadge value={trekker.isActive ? "active" : "inactive"} />}</div>
              <p>Registered trekker</p>
              <dl className="compact-details">
                <div><dt>Email</dt><dd>{trekker.email || "Not provided"}</dd></div>
                <div><dt>Phone</dt><dd>{trekker.mobileNumber || "Not provided"}</dd></div>
                <div><dt>Blood group</dt><dd>{trekker.bloodGroup || "Not provided"}</dd></div>
                <div><dt>Device</dt><dd>{displayDeviceId(trekker.device?.id)} · <StatusBadge value={stateLabel} /></dd></div>
                <div><dt>Location</dt><dd>{relativeAge(trekker.latestLocation?.capturedAt)}</dd></div>
                <div><dt>Reading</dt><dd>{relativeAge(trekker.latestReading?.capturedAt)}</dd></div>
              </dl>
              <DetailLink href={`/responder/users/${trekker.id}`}>Open profile</DetailLink>
            </article>
          );
        })}
        {!filtered.length ? <EmptyState title={trekkers.length ? "No trekkers match these filters" : "No connected trekkers"} /> : null}
      </section>
    </>
  );
}

function TrekkerDetail({ trekker, history, attempts, freshness }: { trekker: PortalTrekker; history: PortalEmergency[]; attempts: AuthorityOverview["notificationAttempts"]; freshness: AuthorityOverview["freshness"] }) {
  const readingStale = !trekker.latestReading || (trekker.latestReading.ageSeconds || 0) > freshness.readingSeconds;
  const locationStale = !trekker.latestLocation || trekker.latestLocation.ageSeconds > freshness.locationSeconds;
  return (
    <>
      <PageHeading eyebrow={displayUserId(trekker.id)} title={trekker.name} description="Authorized expedition safety and emergency context" action={<StatusBadge value={trekker.isActive ? "active" : "inactive"} />} />
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
        <article className="panel"><p className="eyebrow">LAST KNOWN POSITION</p><h2>Location</h2><SafetyMap points={trekker.latestLocation ? [{ id: trekker.id, latitude: trekker.latestLocation.latitude, longitude: trekker.latestLocation.longitude, accuracyMeters: trekker.latestLocation.accuracyMeters, capturedAt: trekker.latestLocation.capturedAt, label: trekker.name, detail: locationStale ? "Last known location" : "Recent location", status: locationStale ? "stale" : "normal" }] : []} /></article>
        <article className="panel"><p className="eyebrow">TREKKER RESPONSE PROFILE</p><h2>Available details</h2><dl className="detail-list"><div><dt>Email</dt><dd>{trekker.email || "Not provided"}</dd></div><div><dt>Phone</dt><dd>{trekker.mobileNumber || "Not provided"}</dd></div><div><dt>Date of birth</dt><dd>{trekker.dateOfBirth || "Not provided"}</dd></div><div><dt>Address</dt><dd>{trekker.address || "Not provided"}</dd></div><div><dt>Safety device</dt><dd>{trekker.device?.displayName || displayDeviceId(trekker.device?.id)}</dd></div><div><dt>Blood group</dt><dd>{trekker.bloodGroup || "Not provided"}</dd></div><div><dt>Emergency contact</dt><dd>{[trekker.emergencyContactName, trekker.emergencyContactPhone, trekker.emergencyContactRelationship].filter(Boolean).join(" · ") || "Not provided"}</dd></div><div><dt>Allergies</dt><dd>{trekker.allergies || "Not provided"}</dd></div><div><dt>Relevant conditions</dt><dd>{trekker.knownConditions || "Not provided"}</dd></div><div><dt>Medications</dt><dd>{trekker.currentMedications || "Not provided"}</dd></div><div><dt>Emergency notes</dt><dd>{trekker.emergencyNotes || "Not provided"}</dd></div><div><dt>Latest field check-in</dt><dd>{trekker.latestSymptom ? `${trekker.latestSymptom.symptom} (${trekker.latestSymptom.severity})` : "None reported"}</dd></div></dl></article>
      </section>
      <section className="panel"><p className="eyebrow">Safety notice</p><p>Sensor readings provide available expedition context; missing values remain unavailable and must not be inferred.</p></section>
      <section className="panel">
        <div className="section-heading"><div><p className="eyebrow">Telemetry</p><h2>Recent readings</h2></div></div>
        {trekker.readingHistory.length ? (
          <div className="table-wrap"><table><thead><tr><th>Captured</th><th>State</th><th>Heart rate</th><th>SpO₂</th><th>Ambient temp.</th><th>Altitude</th></tr></thead><tbody>
            {[...trekker.readingHistory].reverse().map((reading) => <tr key={`${reading.capturedAt}-${reading.sensorState}`}><td>{formatTime(reading.capturedAt)}</td><td>{reading.sensorState ? reading.sensorState.replaceAll("_", " ") : "Unavailable"}</td><td>{reading.heartRate == null ? "Unavailable" : `${reading.heartRate} bpm`}</td><td>{reading.spo2 == null ? "Unavailable" : `${reading.spo2}%`}</td><td>{reading.temperature == null ? "Unavailable" : `${reading.temperature} °C`}</td><td>{reading.altitude == null ? "Unavailable" : `${reading.altitude} m`}</td></tr>)}
          </tbody></table></div>
        ) : <EmptyState title="No device readings yet" />}
      </section>
      <section className="panel">
        <div className="section-heading"><div><p className="eyebrow">FIELD CHECK-INS</p><h2>Reported context</h2></div></div>
        {trekker.symptoms.length ? trekker.symptoms.map((symptom) => <div className="list-row" key={`${symptom.createdAt}-${symptom.symptom}`}><div><strong>{symptom.symptom}</strong><small>{symptom.notes || "No note provided"}</small></div><div className="align-right"><StatusBadge value={symptom.severity} /><small>{formatTime(symptom.createdAt)}</small></div></div>) : <EmptyState title="No field check-ins" />}
      </section>
      <section className="panel"><div className="section-heading"><div><p className="eyebrow">History</p><h2>Recent cases</h2></div></div><EmergencyTable events={history} emptyTitle="No previous cases" /></section>
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
      const result = await portalRequest<{ pairingCode: string; warning: string }>("/api/devices", { method: "POST", body: JSON.stringify({ id: formData.get("id"), displayName: formData.get("displayName") || null, trekkerId: formData.get("trekkerId") || null }) });
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
      <PageHeading eyebrow="Safety device registry" title="Devices" description="Register hardware, assign a trekker, and monitor the last connection received by ARGUS." />
      <section className="panel">
        <h2>Add a device</h2>
        <form className="inline-form" action={(form) => void createDevice(form)}>
          <label>Device ID<input name="id" required pattern="[A-Za-z0-9_-]{1,100}" /></label>
          <label>Display name<input name="displayName" maxLength={120} placeholder="ARGUS Safety Device 01" /></label>
          <label>Assign trekker<select name="trekkerId" defaultValue=""><option value="">Unassigned</option>{data.trekkers.filter((row) => row.isActive).map((row) => <option key={row.id} value={row.id}>{row.name} ({displayUserId(row.id)})</option>)}</select></label>
          <button className="primary-button" type="submit" disabled={Boolean(pendingAction)}>{pendingAction === "create" ? "Adding device…" : "Add device"}</button>
        </form>
        {pairingCode ? <div className="secret-once"><strong>Pairing code — shown once</strong><code>{pairingCode}</code><button type="button" onClick={() => void navigator.clipboard.writeText(pairingCode)}>Copy</button></div> : null}
        {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
        {pendingAction ? <p className="muted" aria-live="polite">Saving device changes…</p> : null}
      </section>
      <section className="card-list">
        {data.devices.map((device) => {
          const state = deviceState(device.lastSeenAt, device.isActive, data.freshness);
          return <article className="person-card" key={device.id}><div className="section-heading"><div><p className="eyebrow">Connected safety device</p><h2>{device.displayName || displayDeviceId(device.id)}</h2></div><StatusBadge value={state} /></div><label>Assigned trekker<select value={device.trekkerId || ""} disabled={Boolean(pendingAction)} onChange={(event) => void update(device.id, { trekkerId: event.target.value || null })}><option value="">Unassigned</option>{data.trekkers.filter((row) => row.isActive).map((row) => <option key={row.id} value={row.id}>{row.name}{row.email ? ` · ${row.email}` : ""}</option>)}</select></label><p className="muted">Firmware: {device.firmwareVersion || "Not verified"} · Last seen: {relativeAge(device.lastSeenAt)}</p><div className="button-row"><button className="secondary-button" onClick={() => void update(device.id, { isActive: !device.isActive })}>{device.isActive ? "Deactivate" : "Activate"}</button><button className="secondary-button" disabled={!device.trekkerId} onClick={() => void update(device.id, { trekkerId: null })}>Unassign</button><button className="secondary-button" onClick={() => void update(device.id, { regeneratePairingCode: true })}>New pairing code</button></div></article>;
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
      <section className="filter-bar"><label>Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Trekker or case ID" /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{["simulated","pending","accepted","sent","delivered","read","failed","not_configured"].map((value) => <option key={value}>{value}</option>)}</select></label></section>
      <section className="panel">
        {attempts.length ? <div className="table-wrap"><table><thead><tr><th>Case / trekker</th><th>Recipient</th><th>Provider</th><th>Status</th><th>Time</th><th>Provider reference</th></tr></thead><tbody>{attempts.map((attempt) => <tr key={attempt.id}><td><Link className="text-link" href={`/responder/cases/${attempt.sosEventId}`}>{attempt.sosEventId.slice(0, 8)}…</Link><small>{attempt.trekkerId ? displayUserId(attempt.trekkerId) : "Unknown trekker"}</small></td><td>{attempt.recipient}</td><td>{attempt.provider}</td><td><StatusBadge value={attempt.status} /></td><td>{formatTime(attempt.createdAt)}</td><td>{attempt.providerMessageId || attempt.error || "Unavailable"}</td></tr>)}</tbody></table></div> : <EmptyState title="No notification attempts yet" />}</section>
    </>
  );
}
