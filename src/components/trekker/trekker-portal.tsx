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
  displayUserId,
  ErrorState,
  formatTime,
  LoadingState,
  relativeAge,
  StatusBadge,
} from "@/components/shared/portal-ui";
import { DeviceConnectionPanel } from "@/components/trekker/device-connection-panel";
import { deviceFreshnessState } from "@/lib/device-freshness";
import { freshnessState } from "@/lib/telemetry";
import { NearbyCarePanel } from "@/components/shared/nearby-care-panel";

const SafetyMap = dynamic(() => import("@/components/shared/safety-map"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map…</div>,
});

const symptomOptions = [
  "Headache",
  "Dizziness",
  "Nausea",
  "Shortness of breath",
  "Fever or feeling feverish",
  "Weakness",
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

  const load = useCallback(async () => {
    try {
      const overview = await portalRequest<TrekkerOverview>("/api/trekker/me");
      setData(overview);
      setActiveSos(
        overview.emergencies.find((event) => !["resolved", "cancelled"].includes(event.status)) ?? null,
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
      router.replace("/user/login");
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
          duration: formData.get("duration"),
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
            ? "Emergency activated, but the WhatsApp alert failed. Responders can retry it."
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

  if (loading) return <LoadingState label="Loading Trekker cockpit" />;
  if (error && !data) return <ErrorState message={error} retry={() => void load()} />;
  if (!data) return null;

  const locationStale =
    !data.latestLocation ||
    data.latestLocation.ageSeconds > data.freshness.locationSeconds;
  const readingStale =
    !data.latestReading ||
    (data.latestReading.ageSeconds || 0) > data.freshness.readingSeconds;
  const readingState = freshnessState(data.latestReading?.capturedAt, data.freshness.readingSeconds);
  const locationState = freshnessState(data.latestLocation?.capturedAt, data.freshness.locationSeconds);
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
  const profileValues = [data.trekker.mobileNumber, data.trekker.dateOfBirth, data.trekker.address, data.trekker.bloodGroup, data.trekker.emergencyContactPhone, data.trekker.allergies, data.trekker.knownConditions, data.trekker.currentMedications, data.trekker.emergencyNotes];
  const profileCompletion = Math.round((profileValues.filter(Boolean).length / profileValues.length) * 100);

  return (
    <main className="min-h-screen bg-[#f7f5f0] topo-contour-cream pb-16 px-4 sm:px-6 lg:px-8">
      {/* Top Mobile/Desktop Expedition Navigation */}
      <nav className="max-w-6xl mx-auto flex items-center justify-between py-4 border-b border-[#d8ded4] sticky top-0 z-20 bg-[#f7f5f0]/90 backdrop-blur-md">
        <Link href="/" className="brand font-black text-xl text-[#0a2e1c]">
          <span className="flex items-center justify-center w-7 h-7 rounded bg-[#0a2e1c] text-[#f7f5f0] text-xs font-bold">▲</span>
          <span>ARGUS</span>
        </Link>
        <div className="hidden md:flex items-center gap-5 text-xs font-bold uppercase tracking-wider text-[#405b4a]">
          <a href="#cockpit" className="hover:text-[#0a2e1c]">Cockpit</a>
          <a href="#device" className="hover:text-[#0a2e1c]">Device</a>
          <a href="#location" className="hover:text-[#0a2e1c]">Map</a>
          <a href="#checkin" className="hover:text-[#0a2e1c]">Check-in</a>
          <a href="#emergency" className="hover:text-[#0a2e1c]">Emergency</a>
          <Link href="/user/profile" className="text-[#0a2e1c] hover:underline">Profile ({profileCompletion}%)</Link>
        </div>
        <div className="flex items-center gap-2">
          <button className="secondary-button text-xs py-1.5 px-3" onClick={() => void load()}>Refresh</button>
          <button className="secondary-button text-xs py-1.5 px-3" disabled={loggingOut} onClick={() => void logout()}>
            {loggingOut ? "Logging out…" : "Logout"}
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto mt-6 space-y-6">
        {/* Expedition Cockpit Header Banner (Matching Reference Image 4) */}
        <header className="bg-[#0a2e1c] text-[#f7f5f0] border border-[#14462c] rounded-2xl p-6 sm:p-8 shadow-lg relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#14462c] text-[#92b8a0] border border-[#1b5c3b]">
                  <span className={`w-2 h-2 rounded-full ${state === "online" ? "bg-[#4ade80]" : "bg-[#f59e0b]"}`} />
                  {state === "online" ? "Device Connected (BLE)" : state === "never_connected" ? "Device Ready (BLE)" : "Signal Stale (BLE)"}
                </span>
                <span className="text-xs text-[#92b8a0]">⚡ Field Telemetry</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Welcome, {data.trekker.name.split(" ")[0]}.
              </h1>
              <p className="text-sm text-[#cbd7ce] mt-1">
                {data.trekker.route || "Annapurna Circuit Route"} &middot; {displayUserId(data.trekker.id)} &middot; Signal {relativeAge(data.generatedAt)}
              </p>
            </div>
            <div className="flex flex-col sm:items-end gap-2">
              <StatusBadge value={activeSos ? "SOS Active" : "Safety Monitoring"} tone={activeSos ? "red" : "green"} />
              <button
                onClick={() => void shareLocation()}
                disabled={sharingLocation}
                className="text-xs font-bold text-[#92b8a0] hover:text-white underline pt-1"
              >
                {sharingLocation ? "Updating GPS…" : "📍 Sync GPS Fix"}
              </button>
            </div>
          </div>
        </header>

        {error ? <div className="bg-[#fee2e2] border border-[#fca5a5] text-[#b91c1c] p-4 rounded-xl text-sm" role="alert">{error}</div> : null}
        {message ? <div className="bg-[#edf4ed] border border-[#b8cfbc] text-[#21573b] p-4 rounded-xl text-sm font-semibold" aria-live="polite">{message}</div> : null}

        {/* Bento Telemetry Grid (Matching Reference Image 4) */}
        <section id="cockpit" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Real-Time Expedition Telemetry</p>
              <h2 className="text-xl font-bold text-[#0a2e1c]">Instrument Readings</h2>
            </div>
            <StatusBadge value={readingState} tone={readingStale ? "amber" : "green"} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Altitude Card */}
            <div className="bg-white border border-[#d8ded4] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-[#576b5d]">
                <span className="text-xs font-bold uppercase tracking-wider">Altitude</span>
                <span className="text-lg">▲</span>
              </div>
              <div className="my-3">
                <div className="text-3xl font-black text-[#0a2e1c] tabular-nums">
                  {data.latestReading?.altitude != null ? `${data.latestReading.altitude}m` : "—"}
                </div>
                <div className="text-xs text-[#576b5d] mt-1">Barometric Elevation</div>
              </div>
            </div>

            {/* Heart Rate Card */}
            <div className="bg-white border border-[#d8ded4] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-[#576b5d]">
                <span className="text-xs font-bold uppercase tracking-wider">Heart Rate</span>
                <span className="text-lg text-[#b91c1c]">♥</span>
              </div>
              <div className="my-3">
                <div className="text-3xl font-black text-[#0a2e1c] tabular-nums">
                  {data.latestReading?.heartRate != null ? `${data.latestReading.heartRate} BPM` : "—"}
                </div>
                <div className="text-xs text-[#576b5d] mt-1">Live BLE Sensor</div>
              </div>
            </div>

            {/* SpO2 Card */}
            <div className="bg-white border border-[#d8ded4] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-[#576b5d]">
                <span className="text-xs font-bold uppercase tracking-wider">SpO₂</span>
                <span className="text-lg text-[#0284c7]">💧</span>
              </div>
              <div className="my-3">
                <div className="text-3xl font-black text-[#0a2e1c] tabular-nums">
                  {data.latestReading?.spo2 != null ? `${data.latestReading.spo2}%` : "—"}
                </div>
                <div className="text-xs text-[#576b5d] mt-1">Blood Oxygen</div>
              </div>
            </div>

            {/* Distance Card */}
            <div className="bg-white border border-[#d8ded4] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-[#576b5d]">
                <span className="text-xs font-bold uppercase tracking-wider">Distance</span>
                <span className="text-lg">📍</span>
              </div>
              <div className="my-3">
                <div className="text-3xl font-black text-[#0a2e1c] tabular-nums">
                  {data.latestReading?.distance != null ? `${(data.latestReading.distance / 1000).toFixed(1)} km` : "—"}
                </div>
                <div className="text-xs text-[#576b5d] mt-1">Expedition Progress</div>
              </div>
            </div>

            {/* Secondary Instrument Row */}
            <div className="bg-white border border-[#d8ded4] rounded-2xl p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-[#576b5d] block">Avg Speed</span>
              <div className="text-xl font-bold text-[#0a2e1c] mt-1">
                {data.latestReading?.averageSpeed != null ? `${data.latestReading.averageSpeed} m/s` : "—"}
              </div>
            </div>

            <div className="bg-white border border-[#d8ded4] rounded-2xl p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-[#576b5d] block">Ambient Temp</span>
              <div className="text-xl font-bold text-[#0a2e1c] mt-1">
                {data.latestReading?.temperature != null ? `${data.latestReading.temperature} °C` : "—"}
              </div>
            </div>

            <div className="bg-white border border-[#d8ded4] rounded-2xl p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-[#576b5d] block">Pressure</span>
              <div className="text-xl font-bold text-[#0a2e1c] mt-1">
                {data.latestReading?.pressure != null ? `${data.latestReading.pressure} hPa` : "—"}
              </div>
            </div>

            <div className="bg-white border border-[#d8ded4] rounded-2xl p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-[#576b5d] block">Fall &amp; AMS</span>
              <div className="text-sm font-bold text-[#0a2e1c] mt-1">
                {data.latestReading?.fallDetected ? "Fall Detected" : "Fall Clear"} &middot; {data.latestReading?.amsStatus || "Normal"}
              </div>
            </div>
          </div>
        </section>

        {/* SOS Action Banner (Matching Reference Image 4) */}
        <section id="emergency" className="sos-panel">
          <div className="space-y-1">
            <p className="eyebrow text-[#b91c1c]">Emergency Response</p>
            <h2>{activeSos ? "SOS Signal Active" : "Emergency Assistance"}</h2>
            <p className="text-sm text-[#7f1d1d] max-w-xl">
              {activeSos
                ? `Active Case Tracking ID: ${activeSos.id}. Responders & WhatsApp alerts notified.`
                : "Press to package your latest GPS coordinates, sensor telemetry, and notify authorized emergency responders."}
            </p>
          </div>

          {activeSos ? (
            <div className="sos-button sos-button-active flex items-center justify-center" role="status" aria-live="polite">
              SOS ACTIVE
            </div>
          ) : (
            <button
              className="sos-button"
              type="button"
              disabled={isActivatingSos}
              onClick={openSosConfirmation}
            >
              {isActivatingSos ? "ACTIVATING…" : "Trigger SOS"}
            </button>
          )}
        </section>

        {/* Map & Position Section */}
        <section id="location" className="bg-white border border-[#d8ded4] rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Expedition Map &amp; Tracking</p>
              <h2 className="text-xl font-bold text-[#0a2e1c]">Route &amp; Position</h2>
            </div>
            <StatusBadge value={locationState} />
          </div>

          <SafetyMap
            points={data.latestLocation ? [{
              id: data.trekker.id,
              latitude: data.latestLocation.latitude,
              longitude: data.latestLocation.longitude,
              accuracyMeters: data.latestLocation.accuracyMeters,
              capturedAt: data.latestLocation.capturedAt,
              label: data.trekker.name,
              detail: locationStale ? "Last known location" : "Live GPS position",
              status: locationStale ? "stale" : activeSos ? "active" : "normal",
            }] : []}
            route={data.routeCoordinates}
            height="26rem"
          />

          <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-[#576b5d] pt-2 border-t border-[#d8ded4]">
            <div>
              Coordinates: {data.latestLocation ? `${data.latestLocation.latitude.toFixed(5)}, ${data.latestLocation.longitude.toFixed(5)}` : "Unavailable"}
              {data.latestLocation?.accuracyMeters ? ` (±${Math.round(data.latestLocation.accuracyMeters)}m)` : ""}
            </div>
            {data.latestLocation ? (
              <a
                className="text-link"
                href={`https://www.google.com/maps?q=${data.latestLocation.latitude},${data.latestLocation.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Open Google Maps &rarr;
              </a>
            ) : null}
          </div>

          <NearbyCarePanel latitude={data.latestLocation?.latitude} longitude={data.latestLocation?.longitude} userLabel={data.trekker.name} />
        </section>

        {/* Device Bluetooth Bridge Panel */}
        <section id="device">
          <DeviceConnectionPanel
            deviceId={data.device?.id ?? null}
            displayName={data.device?.displayName}
            locationStaleSeconds={data.freshness.locationSeconds}
            onStoredData={() => void load()}
          />
        </section>

        {/* Field Check-In Form */}
        <section id="checkin" className="bg-white border border-[#d8ded4] rounded-2xl p-6 shadow-sm space-y-4">
          <p className="eyebrow">Field Check-in</p>
          <h2 className="text-xl font-bold text-[#0a2e1c]">Report Condition or Symptoms</h2>

          {data.symptoms[0] ? (
            <div className="bg-[#f4efe6] border border-[#d5cebf] rounded-xl p-4 flex items-start justify-between">
              <div>
                <strong className="text-sm font-bold text-[#0a2e1c]">{data.symptoms[0].symptom}</strong>
                <p className="text-xs text-[#576b5d] mt-0.5">{data.symptoms[0].notes || "No additional note"}</p>
                <small className="text-[11px] text-[#718276] mt-1 block">Recorded: {formatTime(data.symptoms[0].createdAt)}</small>
              </div>
              <StatusBadge value={data.symptoms[0].severity} />
            </div>
          ) : null}

          <form className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2" action={(form) => void reportSymptom(form)}>
            <label>Symptom
              <select name="symptom" required>
                {symptomOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>Severity
              <select name="severity" required defaultValue="unspecified">
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
                <option value="unspecified">Not sure</option>
              </select>
            </label>
            <label className="sm:col-span-2">Duration
              <input name="duration" maxLength={100} placeholder="e.g. 2 hours" />
            </label>
            <label className="sm:col-span-2">Note for Response Team
              <textarea name="notes" maxLength={500} rows={2} placeholder="Add useful field context..." />
            </label>
            <div className="sm:col-span-2">
              <button className="primary-button" type="submit" disabled={reportingSymptom}>
                {reportingSymptom ? "Sending Report…" : "Submit Field Check-in"}
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* SOS Confirmation Dialog */}
      {isConfirmModalOpen ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={closeSosConfirmation}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-sos-title" onMouseDown={(event) => event.stopPropagation()}>
            <p className="eyebrow text-[#b91c1c]">Emergency Confirmation</p>
            <h2 id="confirm-sos-title" className="text-2xl font-black text-[#991b1b]">Activate Emergency SOS?</h2>
            <p className="text-sm text-[#576b5d] my-3 leading-relaxed">
              This will immediately package your latest available GPS position, barometric altitude, and wearable telemetry into a high-priority emergency snapshot and transmit WhatsApp alerts.
            </p>
            {sosError ? <div className="bg-[#fee2e2] text-[#b91c1c] p-3 rounded-lg text-xs mb-3" role="alert">{sosError}</div> : null}
            <div className="flex justify-end gap-3 mt-5">
              <button className="secondary-button" type="button" disabled={isActivatingSos} onClick={closeSosConfirmation}>
                Cancel
              </button>
              <button className="danger-button" type="button" disabled={isActivatingSos || Boolean(activeSos)} onClick={() => void activateSos()}>
                {isActivatingSos ? "Activating SOS…" : "Confirm and activate SOS"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
