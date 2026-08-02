"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  idempotencyHeaders,
  portalRequest,
  type TrekkerEmergency,
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
import { deviceFreshnessState } from "@/lib/device-freshness";

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
  const sosSubmissionInFlight = useRef(false);
  const router = useRouter();
  const [data, setData] = useState<TrekkerOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [reportingSymptom, setReportingSymptom] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isActivatingSos, setIsActivatingSos] = useState(false);
  const [activeSos, setActiveSos] = useState<TrekkerEmergency | null>(null);
  const [sosError, setSosError] = useState("");
  const [sosResult, setSosResult] = useState<TrekkerEmergency | null>(null);

  const load = useCallback(async () => {
    try {
      const overview = await portalRequest<TrekkerOverview>("/api/trekker/me");
      setData(overview);
      setActiveSos(
        overview.emergencies.find((event) => event.status !== "resolved") ?? null,
      );
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
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await portalRequest("/api/auth/logout", { method: "POST" });
      router.replace("/trekker/login");
      router.refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Logout could not be completed.");
      setLoggingOut(false);
    }
  }

  async function reportSymptom(formData: FormData) {
    if (!data || reportingSymptom) return;
    setReportingSymptom(true);
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
    } finally {
      setReportingSymptom(false);
    }
  }

  async function shareLocation() {
    if (!data || !navigator.geolocation || sharingLocation) {
      setMessage("Location sharing is unavailable in this browser.");
      return;
    }
    setSharingLocation(true);
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
        } finally {
          setSharingLocation(false);
        }
      },
      () => {
        setMessage("Location permission was denied or no GPS fix was available.");
        setSharingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 10_000 },
    );
  }

  function openSosConfirmation() {
    if (activeSos || isActivatingSos || sosSubmissionInFlight.current) return;
    sosRequestId.current = crypto.randomUUID();
    setSosError("");
    setIsConfirmModalOpen(true);
  }

  function closeSosConfirmation() {
    if (isActivatingSos || sosSubmissionInFlight.current) return;
    sosRequestId.current = null;
    setSosError("");
    setIsConfirmModalOpen(false);
  }

  async function activateSos() {
    if (!data || activeSos || isActivatingSos || sosSubmissionInFlight.current) return;
    sosSubmissionInFlight.current = true;
    setIsActivatingSos(true);
    setSosError("");
    setMessage("");
    try {
      sosRequestId.current ??= crypto.randomUUID();
      const result = await portalRequest<{
        created: boolean;
        sos: TrekkerEmergency;
        notificationStatus: string;
      }>("/api/sos", {
        method: "POST",
        headers: idempotencyHeaders(sosRequestId.current),
        body: JSON.stringify({
          trekkerId: data.trekker.id,
          source: "web_button",
        }),
      });
      const confirmedSos = {
        ...result.sos,
        notificationStatus: result.notificationStatus,
      };
      setActiveSos(confirmedSos);
      setSosResult(confirmedSos);
      setData((current) => current ? {
        ...current,
        emergencies: [
          confirmedSos,
          ...current.emergencies.filter((event) => event.id !== confirmedSos.id),
        ],
      } : current);
      sosRequestId.current = null;
      setIsConfirmModalOpen(false);
      setMessage(
        result.notificationStatus === "sent"
          ? "Emergency activated and WhatsApp alert sent."
          : result.notificationStatus === "failed"
            ? "Emergency activated, but the WhatsApp alert failed. Authorities can retry it."
            : "Emergency activated.",
      );
      void load();
    } catch (reason) {
      setSosError(reason instanceof Error ? reason.message : "The SOS could not be activated.");
    } finally {
      sosSubmissionInFlight.current = false;
      setIsActivatingSos(false);
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
  const displayedSos = sosResult ?? activeSos;
  const state = data.device
    ? deviceFreshnessState(
        data.device.lastSeenAt,
        data.device.isActive,
        {
          onlineSeconds: data.freshness.deviceOnlineSeconds,
          offlineSeconds: data.freshness.deviceOfflineSeconds,
        },
        new Date(data.generatedAt).getTime(),
      )
    : "never_connected";

  return (
    <main className="trekker-page">
      <nav className="trekker-nav">
        <Link href="/" className="brand">ARGUS</Link>
        <div>
          <button className="secondary-button" onClick={() => void load()}>Refresh</button>
          <button className="secondary-button" disabled={loggingOut} onClick={() => void logout()}>{loggingOut ? "Logging out…" : "Logout"}</button>
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
        deviceId={data.device?.id ?? null}
        locationStaleSeconds={data.freshness.locationSeconds}
        onStoredData={() => void load()}
      />

      <section>
        <div className="section-heading"><div><p className="eyebrow">Current safety status</p><h2>Your latest information</h2></div></div>
        <div className="summary-grid">
          <DataCard label="Device" value={<StatusBadge value={state} />} detail={data.device ? `${data.device.id} · last seen ${relativeAge(data.device.lastSeenAt)}` : "No device assigned"} />
          <DataCard label="Stored heart rate" value={!data.latestReading ? "No stored reading yet" : data.latestReading.heartRate == null ? "Unavailable" : `${data.latestReading.heartRate} bpm`} detail={readingStale ? `Stale database reading from ${relativeAge(data.latestReading?.capturedAt)}` : `Persisted from ${data.latestReading?.deviceId || "assigned device"}`} />
          <DataCard label="Stored SpO₂" value={data.latestReading?.spo2 == null ? "Unavailable" : `${data.latestReading.spo2}%`} detail="Latest persisted reading; live BLE values appear in the wristband panel above." />
          <DataCard label="Stored reading time" value={data.latestReading ? formatTime(data.latestReading.capturedAt) : "No stored reading yet"} detail={data.latestReading ? `${readingStale ? "Stale" : "Recent"} · ${data.latestReading.deviceId || "Source device unavailable"}` : "Waiting for a successful wristband database write."} />
          <DataCard label="Ambient temperature" value={data.latestReading?.temperature == null ? "Unavailable" : `${data.latestReading.temperature} °C`} />
          <DataCard label="Altitude" value={data.latestReading?.altitude == null ? "Unavailable" : `${data.latestReading.altitude} m`} />
          <DataCard label="Pressure" value={data.latestReading?.pressure == null ? "Unavailable" : `${data.latestReading.pressure} hPa`} />
          <DataCard label="Average speed" value={data.latestReading?.averageSpeed == null ? "Unavailable" : `${data.latestReading.averageSpeed} m/s`} />
          <DataCard label="Distance" value={data.latestReading?.distance == null ? "Unavailable" : `${data.latestReading.distance} m`} />
          <DataCard label="AMS indicator" value={data.latestReading?.amsStatus ?? "Unavailable"} detail="Device-generated safety indicator; not a diagnosis." />
          <DataCard label="Fall state" value={!data.latestReading || data.latestReading.fallDetected == null ? "Unavailable" : data.latestReading.fallDetected ? `Detected${data.latestReading.fallType ? ` · ${data.latestReading.fallType}` : ""}` : "Clear"} />
          <DataCard label="Physical SOS" value={!data.latestReading || data.latestReading.physicalSos == null || data.latestReading.sosCountdown == null ? "Unavailable" : data.latestReading.physicalSos ? "Active" : data.latestReading.sosCountdown ? "Countdown" : "Inactive"} />
          <DataCard label="Location" value={<StatusBadge value={!data.latestLocation ? "unavailable" : locationStale ? "stale" : "recent"} />} detail={relativeAge(data.latestLocation?.capturedAt)} />
        </div>
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="section-heading"><div><p className="eyebrow">Your location</p><h2>Latest GPS position</h2></div><button className="secondary-button" disabled={sharingLocation} onClick={() => void shareLocation()}>{sharingLocation ? "Sharing location…" : "Share current location"}</button></div>
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
            <button className="primary-button" type="submit" disabled={reportingSymptom}>{reportingSymptom ? "Sending report…" : "Send report"}</button>
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
          {displayedSos ? <dl className="compact-details"><div><dt>Tracking ID</dt><dd>{displayedSos.id}</dd></div><div><dt>Created</dt><dd>{formatTime(displayedSos.createdAt)}</dd></div><div><dt>Notification</dt><dd>{displayedSos.notificationStatus}</dd></div><div><dt>Location</dt><dd>{displayedSos.locationIsStale ? "Stale or unavailable" : "Recent"}</dd></div></dl> : null}
        </div>
        {activeSos ? (
          <div className="sos-button" role="status" aria-live="polite">SOS ACTIVE</div>
        ) : (
          <button className="sos-button" type="button" disabled={isActivatingSos} onClick={openSosConfirmation}>
            ACTIVATE SOS
          </button>
        )}
      </section>

      {isConfirmModalOpen ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={closeSosConfirmation}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-sos-title" onMouseDown={(event) => event.stopPropagation()}>
            <p className="eyebrow">Confirm emergency</p>
            <h2 id="confirm-sos-title">Activate SOS now?</h2>
            <p>This will create an emergency record, preserve your latest available GPS and sensor data, and send configured WhatsApp alerts. Only continue for a real emergency or an authorized test.</p>
            {sosError ? <div className="inline-warning" role="alert">{sosError}</div> : null}
            <div className="button-row">
              <button className="secondary-button" type="button" disabled={isActivatingSos} onClick={closeSosConfirmation}>Cancel</button>
              <button className="danger-button" type="button" disabled={isActivatingSos || Boolean(activeSos)} onClick={() => void activateSos()}>{isActivatingSos ? "Activating SOS…" : activeSos ? "SOS is already active" : "Confirm and activate SOS"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
