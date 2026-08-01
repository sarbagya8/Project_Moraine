"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  idempotencyHeaders,
  portalRequest,
  type TrekkerOverview,
} from "@/lib/portal-api";
import {
  DataCard,
  EmptyState,
  ErrorState,
  formatTime,
  LoadingState,
  relativeAge,
  StatusBadge,
} from "@/components/shared/portal-ui";
import { DeviceConnectionPanel } from "@/components/trekker/device-connection-panel";

const SafetyMap = dynamic(() => import("@/components/shared/safety-map"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map…</div>,
});

const symptomOptions = [
  "Headache",
  "Dizziness",
  "Nausea",
  "Breathing difficulty",
  "Extreme tiredness",
  "Chest discomfort",
  "Injury",
  "Other",
  "No symptoms",
];

export function TrekkerPortal() {
  const sosRequestId = useRef<string | null>(null);
  const router = useRouter();
  const [data, setData] = useState<TrekkerOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [confirmingSos, setConfirmingSos] = useState(false);
  const [sendingSos, setSendingSos] = useState(false);
  const [sosResult, setSosResult] = useState<{
    id: string;
    createdAt: string;
    notificationStatus: string;
    locationIsStale: boolean;
    rescueUrl?: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await portalRequest<TrekkerOverview>("/api/trekker/me"));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your safety data is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  async function logout() {
    await portalRequest("/api/auth/logout", { method: "POST" });
    router.replace("/trekker/login");
    router.refresh();
  }

  async function reportSymptom(formData: FormData) {
    if (!data) return;
    setMessage("Sending your report…");
    try {
      await portalRequest("/api/symptoms", {
        method: "POST",
        headers: idempotencyHeaders(),
        body: JSON.stringify({
          trekkerId: data.trekker.id,
          symptom: formData.get("symptom"),
          severity: formData.get("severity"),
          notes: formData.get("notes"),
        }),
      });
      setMessage("Your symptom report was recorded.");
      await load();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Your report could not be sent.");
    }
  }

  async function shareLocation() {
    if (!data || !navigator.geolocation) {
      setMessage("Location sharing is unavailable in this browser.");
      return;
    }
    setMessage("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await portalRequest("/api/location", {
            method: "POST",
            headers: idempotencyHeaders(),
            body: JSON.stringify({
              trekkerId: data.trekker.id,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracyMeters: position.coords.accuracy,
              altitude: position.coords.altitude ?? undefined,
              source: "browser",
              capturedAt: new Date(position.timestamp).toISOString(),
            }),
          });
          setMessage("Your latest location was shared with ARGUS.");
          await load();
        } catch (reason) {
          setMessage(reason instanceof Error ? reason.message : "Location could not be shared.");
        }
      },
      () => setMessage("Location permission was denied or no GPS fix was available."),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 10_000 },
    );
  }

  async function activateSos() {
    if (!data || sendingSos) return;
    setSendingSos(true);
    setMessage("");
    try {
      sosRequestId.current ??= crypto.randomUUID();
      const result = await portalRequest<{
        event: {
          id: string;
          createdAt: string;
          notificationStatus: string;
          locationIsStale: boolean;
          rescueUrl?: string;
        };
      }>("/api/sos", {
        method: "POST",
        headers: idempotencyHeaders(sosRequestId.current),
        body: JSON.stringify({
          trekkerId: data.trekker.id,
          source: "web_button",
        }),
      });
      setSosResult(result.event);
      sosRequestId.current = null;
      setConfirmingSos(false);
      setMessage("Emergency alert sent.");
      await load();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "The SOS could not be activated.");
    } finally {
      setSendingSos(false);
    }
  }

  if (loading) return <LoadingState label="Loading trekker portal" />;
  if (error && !data) return <ErrorState message={error} retry={() => void load()} />;
  if (!data) return null;

  const locationStale =
    !data.latestLocation ||
    data.latestLocation.ageSeconds > data.freshness.locationSeconds;
  const readingStale =
    !data.latestReading ||
    (data.latestReading.ageSeconds || 0) > data.freshness.readingSeconds;
  const activeSos = data.emergencies.find((event) => event.status !== "resolved");
  const state = data.device?.isActive
    ? data.device.lastSeenAt &&
      new Date(data.generatedAt).getTime() -
          new Date(data.device.lastSeenAt).getTime() <
        5 * 60_000
      ? "online"
      : "stale"
    : "offline";

  return (
    <main className="trekker-page">
      <nav className="trekker-nav">
        <Link href="/" className="brand">ARGUS</Link>
        <div>
          <button className="secondary-button" onClick={() => void load()}>Refresh</button>
          <button className="secondary-button" onClick={() => void logout()}>Logout</button>
        </div>
      </nav>
      <header className="trekker-header">
        <div>
          <p className="eyebrow">Trekker portal · {data.trekker.id}</p>
          <h1>Welcome, {data.trekker.name}</h1>
          <p>{data.trekker.route || "No route has been assigned"} · Last update: {relativeAge(data.generatedAt)}</p>
        </div>
        <div className="header-status"><StatusBadge value={activeSos ? "SOS active" : "Monitoring"} tone={activeSos ? "red" : "green"} /></div>
      </header>

      {error ? <div className="inline-warning" role="alert">{error}</div> : null}
      {message ? <div className="form-message" aria-live="polite">{message}</div> : null}

      <DeviceConnectionPanel
        trekkerId={data.trekker.id}
        deviceId={data.device?.id ?? null}
      />

      <section>
        <div className="section-heading"><div><p className="eyebrow">Current safety status</p><h2>Your latest information</h2></div></div>
        <div className="summary-grid">
          <DataCard label="Device" value={<StatusBadge value={state} />} detail={data.device ? `${data.device.id} · last seen ${relativeAge(data.device.lastSeenAt)}` : "No device assigned"} />
          <DataCard label="Heart rate" value={data.latestReading ? `${data.latestReading.heartRate} bpm` : "Unavailable"} detail={readingStale ? `Last reading was received ${relativeAge(data.latestReading?.capturedAt)}` : "Recent reading"} />
          <DataCard label="SpO₂" value={data.latestReading ? `${data.latestReading.spo2}%` : "Unavailable"} />
          <DataCard label="Temperature" value={data.latestReading?.temperature == null ? "Unavailable" : `${data.latestReading.temperature} °C`} />
          <DataCard label="Altitude" value={data.latestReading?.altitude == null ? "Unavailable" : `${data.latestReading.altitude} m`} />
          <DataCard label="Location" value={<StatusBadge value={!data.latestLocation ? "unavailable" : locationStale ? "stale" : "recent"} />} detail={relativeAge(data.latestLocation?.capturedAt)} />
        </div>
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="section-heading"><div><p className="eyebrow">Your location</p><h2>Latest GPS position</h2></div><button className="secondary-button" onClick={() => void shareLocation()}>Share current location</button></div>
          <SafetyMap
            points={data.latestLocation ? [{
              id: data.trekker.id,
              latitude: data.latestLocation.latitude,
              longitude: data.latestLocation.longitude,
              accuracyMeters: data.latestLocation.accuracyMeters,
              capturedAt: data.latestLocation.capturedAt,
              label: data.trekker.name,
              detail: locationStale ? "Stale location — not live" : "Recent location",
              status: locationStale ? "stale" : activeSos ? "active" : "normal",
            }] : []}
            route={data.routeCoordinates}
          />
          {data.latestLocation ? <a className="text-link map-link" href={`https://www.google.com/maps?q=${data.latestLocation.latitude},${data.latestLocation.longitude}`} target="_blank" rel="noreferrer">Open in an external map</a> : null}
        </article>

        <article className="panel">
          <p className="eyebrow">Recent report</p>
          <h2>How you last felt</h2>
          {data.symptoms[0] ? (
            <div className="latest-report">
              <strong>{data.symptoms[0].symptom}</strong>
              <StatusBadge value={data.symptoms[0].severity} />
              <p>{data.symptoms[0].notes || "No note provided"}</p>
              <small>{formatTime(data.symptoms[0].createdAt)}</small>
            </div>
          ) : <EmptyState title="No symptom reports yet" />}
          <hr />
          <h3>Report how you are feeling</h3>
          <form className="stacked-form" action={(form) => void reportSymptom(form)}>
            <label>Symptom<select name="symptom" required>{symptomOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            <label>Severity<select name="severity" required defaultValue="unspecified"><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option><option value="unspecified">Not sure</option></select></label>
            <label>Optional note<textarea name="notes" maxLength={500} rows={3} placeholder="Add useful context for the rescue team" /></label>
            <button className="primary-button" type="submit">Send report</button>
          </form>
        </article>
      </section>

      <section className="safety-disclaimer">
        Sensor readings support safety monitoring and are not a medical diagnosis.
      </section>

      <section className="sos-panel">
        <div>
          <p className="eyebrow">Emergency assistance</p>
          <h2>{activeSos ? "SOS is active" : "Activate an emergency alert"}</h2>
          <p>{activeSos ? `Tracking ID: ${activeSos.id}. Notification state: ${activeSos.notificationStatus}.` : "ARGUS will create an emergency snapshot and alert configured trusted contacts. Contact local emergency services when possible."}</p>
          {sosResult ? <dl className="compact-details"><div><dt>Tracking ID</dt><dd>{sosResult.id}</dd></div><div><dt>Created</dt><dd>{formatTime(sosResult.createdAt)}</dd></div><div><dt>Notification</dt><dd>{sosResult.notificationStatus}</dd></div><div><dt>Location</dt><dd>{sosResult.locationIsStale ? "Stale or unavailable" : "Recent"}</dd></div></dl> : null}
        </div>
        <button className="sos-button" type="button" disabled={Boolean(activeSos) || sendingSos} onClick={() => setConfirmingSos(true)}>
          {activeSos ? "SOS ACTIVE" : "ACTIVATE SOS"}
        </button>
      </section>

      {confirmingSos ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => !sendingSos && setConfirmingSos(false)}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-sos-title" onMouseDown={(event) => event.stopPropagation()}>
            <p className="eyebrow">Confirm emergency</p>
            <h2 id="confirm-sos-title">Activate SOS now?</h2>
            <p>This will create an emergency record, preserve your latest available GPS and sensor data, and send configured WhatsApp alerts. Only continue for a real emergency or an authorized test.</p>
            <div className="button-row">
              <button className="secondary-button" disabled={sendingSos} onClick={() => setConfirmingSos(false)}>Cancel</button>
              <button className="danger-button" disabled={sendingSos} onClick={() => void activateSos()}>{sendingSos ? "Sending SOS…" : "Confirm and activate SOS"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
