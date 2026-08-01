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
import {
  routePositions,
  validCoordinate,
  type RoutePoint,
} from "@/lib/rescue-data";

export type EmergencyMapProps = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  locations?: RoutePoint[];
  sosTime?: string;
  isStale?: boolean;
  isDemo?: boolean;
};

const markerIcon = L.divIcon({
  className: "argus-map-marker",
  html: '<span aria-hidden="true"></span>',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
  popupAnchor: [0, -34],
});

function FitRoute({ positions }: { positions: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [28, 28], maxZoom: 16 });
    } else if (positions.length === 1) {
      map.setView(positions[0], 15);
    }
  }, [map, positions]);

  return null;
}

export default function EmergencyMap({
  latitude,
  longitude,
  accuracyMeters,
  locations = [],
  sosTime,
  isStale,
  isDemo,
}: EmergencyMapProps) {
  const positions = useMemo(() => routePositions(locations), [locations]);

  if (!validCoordinate(latitude, longitude)) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
        Map unavailable: a valid last-known location has not been recorded.
      </div>
    );
  }

  const position: [number, number] = [latitude, longitude];
  const fittedPositions = positions.length ? positions : [position];

  return (
    <div className="h-80 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
      <MapContainer
        center={position}
        zoom={15}
        className="h-full w-full"
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitRoute positions={fittedPositions} />
        {positions.length > 1 ? (
          <Polyline
            positions={positions}
            pathOptions={{ color: "#0f766e", weight: 4, opacity: 0.9 }}
          />
        ) : null}
        {accuracyMeters != null && accuracyMeters > 0 ? (
          <Circle
            center={position}
            radius={accuracyMeters}
            pathOptions={{ color: "#d97706", fillOpacity: 0.12 }}
          />
        ) : null}
        <Marker position={position} icon={markerIcon}>
          <Popup>
            <strong>
              {isDemo ? "Demo SOS position" : "Last-known SOS position"}
            </strong>
            <br />
            {sosTime ? new Date(sosTime).toLocaleString() : "Timestamp unavailable"}
            <br />
            {isStale ? "Stale location — not live." : "Recent location."}
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
