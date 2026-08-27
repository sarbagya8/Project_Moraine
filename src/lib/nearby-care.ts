export type CareFacility = {
  id: string;
  name: string;
  type: "Hospital" | "Clinic" | "Health centre" | "Health post" | "Doctor";
  latitude: number;
  longitude: number;
  distanceMeters: number;
  address: string | null;
  mapsUrl: string;
};

type OverpassElement = {
  id: number;
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function radians(value: number) {
  return value * Math.PI / 180;
}

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadius = 6_371_000;
  const latitude = radians(lat2 - lat1);
  const longitude = radians(lon2 - lon1);
  const a = Math.sin(latitude / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(longitude / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function facilityType(tags: Record<string, string>) {
  const value = tags.healthcare || tags.amenity || "";
  if (value === "hospital") return "Hospital" as const;
  if (value === "clinic") return "Clinic" as const;
  if (["centre", "health_centre"].includes(value)) return "Health centre" as const;
  if (value === "health_post") return "Health post" as const;
  return "Doctor" as const;
}

function address(tags: Record<string, string>) {
  const parts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:place"], tags["addr:city"]].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function normalizeOverpassFacilities(elements: OverpassElement[], latitude: number, longitude: number) {
  const seen = new Set<string>();
  return elements.flatMap((element): CareFacility[] => {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (lat == null || lon == null || !element.tags) return [];
    const key = `${element.tags.name || ""}:${lat.toFixed(5)}:${lon.toFixed(5)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const type = facilityType(element.tags);
    return [{
      id: `${element.type}-${element.id}`,
      name: element.tags.name || `Unnamed ${type.toLowerCase()}`,
      type,
      latitude: lat,
      longitude: lon,
      distanceMeters: distanceMeters(latitude, longitude, lat, lon),
      address: address(element.tags),
      mapsUrl: `https://www.openstreetmap.org/directions?to=${lat},${lon}`,
    }];
  }).sort((left, right) => left.distanceMeters - right.distanceMeters).slice(0, 20);
}

export function overpassCareQuery(latitude: number, longitude: number, radius: number) {
  const around = `(around:${radius},${latitude},${longitude})`;
  return `[out:json][timeout:15];(nwr["amenity"~"^(hospital|clinic|doctors)$"]${around};nwr["healthcare"~"^(hospital|clinic|centre|health_centre|health_post|doctor)$"]${around};);out center tags;`;
}
