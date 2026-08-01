export function universalMapUrl(latitude: number, longitude: number) {
  const query = encodeURIComponent(`${latitude},${longitude}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function rescueUrl(eventId: string, appUrl?: string) {
  const baseUrl = (
    appUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
  return `${baseUrl}/rescue/${encodeURIComponent(eventId)}`;
}

export function ageSeconds(timestamp: string) {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor((Date.now() - parsed) / 1_000));
}
