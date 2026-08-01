"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

export type SafetyMapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  detail?: string;
  capturedAt?: string;
  accuracyMeters?: number | null;
  status?: "normal" | "stale" | "active" | "acknowledged";
  href?: string;
};

function valid(point: SafetyMapPoint) {
  return (
    Number.isFinite(point.latitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    Number.isFinite(point.longitude) &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

function icon(status: SafetyMapPoint["status"]) {
  return L.divIcon({
    className: `argus-map-marker map-marker-${status || "normal"}`,
    html: '<span aria-hidden="true"></span>',
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    popupAnchor: [0, -34],
  });
}

function FitMap({ points }: { points: SafetyMapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    const positions = points.map(
      (point) => [point.latitude, point.longitude] as [number, number],
    );
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [32, 32], maxZoom: 15 });
    } else if (positions[0]) {
      map.setView(positions[0], 15);
    }
  }, [map, points]);
  return null;
}

export default function SafetyMap({
  points,
  route = [],
  height = "24rem",
}: {
  points: SafetyMapPoint[];
  route?: Array<{ latitude: number; longitude: number }>;
  height?: string;
}) {
  const safePoints = useMemo(() => points.filter(valid), [points]);
  const routePositions = useMemo(
    () =>
      route
        .filter((point) =>
          valid({ ...point, id: "", label: "" }),
        )
        .map((point) => [point.latitude, point.longitude] as [number, number]),
    [route],
  );
  if (!safePoints.length) {
    return (
      <div className="map-unavailable" style={{ minHeight: height }}>
        <strong>Location data is unavailable</strong>
        <p>The map will appear after ARGUS receives a valid GPS location.</p>
      </div>
    );
  }
  return (
    <div className="safety-map" style={{ height }}>
      <MapContainer
        center={[safePoints[0].latitude, safePoints[0].longitude]}
        zoom={14}
        className="h-full w-full"
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitMap points={safePoints} />
        {routePositions.length > 1 ? (
          <Polyline
            positions={routePositions}
            pathOptions={{ color: "#1f5a45", weight: 4, opacity: 0.82 }}
          />
        ) : null}
        {safePoints.map((point) => (
          <Marker
            key={point.id}
            position={[point.latitude, point.longitude]}
            icon={icon(point.status)}
          >
            {point.accuracyMeters && point.accuracyMeters > 0 ? (
              <Circle
                center={[point.latitude, point.longitude]}
                radius={point.accuracyMeters}
                pathOptions={{ color: "#b7791f", fillOpacity: 0.08 }}
              />
            ) : null}
            <Popup>
              <strong>{point.label}</strong>
              {point.detail ? <><br />{point.detail}</> : null}
              {point.capturedAt ? (
                <><br />Last update: {new Date(point.capturedAt).toLocaleString()}</>
              ) : null}
              {point.href ? (
                <><br /><a href={point.href}>Open details</a></>
              ) : null}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
