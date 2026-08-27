"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { portalRequest } from "@/lib/portal-api";
import type { CareFacility } from "@/lib/nearby-care";
import { EmptyState, StatusBadge } from "./portal-ui";

const SafetyMap = dynamic(() => import("./safety-map"), { ssr: false });

function distanceLabel(meters: number) {
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function NearbyCarePanel({ latitude, longitude, userLabel }: { latitude?: number | null; longitude?: number | null; userLabel: string }) {
  const [facilities, setFacilities] = useState<CareFacility[]>([]);
  const [message, setMessage] = useState(latitude == null || longitude == null ? "A recent location is needed to find nearby care." : "Search OpenStreetMap for mapped hospitals, clinics and health posts near this location.");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search() {
    if (latitude == null || longitude == null || loading) return;
    setLoading(true);
    try {
      const result = await portalRequest<{ facilities: CareFacility[]; available: boolean; message: string | null }>(`/api/care/nearby?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`);
      setFacilities(result.facilities);
      setMessage(result.message || `${result.facilities.length} mapped care option${result.facilities.length === 1 ? "" : "s"} found.`);
      setSearched(true);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Nearby care could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  const points = [
    ...(latitude != null && longitude != null ? [{ id: "case-location", latitude, longitude, label: userLabel, status: "active" as const }] : []),
    ...facilities.map((facility) => ({ id: facility.id, latitude: facility.latitude, longitude: facility.longitude, label: facility.name, detail: `${facility.type} · ${distanceLabel(facility.distanceMeters)}`, href: facility.mapsUrl })),
  ];

  return (
    <div className="nearby-care">
      <div className="section-heading">
        <div><p className="eyebrow">Nearby care</p><h2>Hospitals, clinics and health posts</h2></div>
        <button className="secondary-button" type="button" disabled={latitude == null || longitude == null || loading} onClick={() => void search()}>{loading ? "Searching…" : "Find nearby care"}</button>
      </div>
      <p className="muted" aria-live="polite">{message}</p>
      {searched ? <SafetyMap points={points} height="20rem" /> : null}
      <div className="care-results">
        {facilities.map((facility) => (
          <article className="care-result" key={facility.id}>
            <div><strong>{facility.name}</strong><p>{facility.address || "Mapped location"}</p></div>
            <div className="align-right"><StatusBadge value={facility.type} /><small>{distanceLabel(facility.distanceMeters)}</small></div>
            <a className="text-link" href={facility.mapsUrl} target="_blank" rel="noreferrer">Open in Maps</a>
          </article>
        ))}
        {searched && !facilities.length ? <EmptyState title="No mapped care facilities found" /> : null}
      </div>
    </div>
  );
}
