import { failure, success } from "@/lib/api-response";
import { requestSession } from "@/lib/portal-auth";
import { withRequestContext } from "@/lib/request-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeOverpassFacilities, overpassCareQuery } from "@/lib/nearby-care";

export const GET = withRequestContext("GET /api/care/nearby", async (request) => {
  const session = requestSession(request);
  if (!session) return failure("UNAUTHENTICATED", "Sign in is required.", 401);
  const limit = checkRateLimit(request, "nearby-care", 20, 60_000);
  if (!limit.allowed) return failure("RATE_LIMITED", `Retry in ${limit.retryAfter} seconds.`, 429);
  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get("latitude"));
  const longitude = Number(url.searchParams.get("longitude"));
  const radius = Math.min(50_000, Math.max(1_000, Number(url.searchParams.get("radius")) || 20_000));
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return failure("INVALID_LOCATION", "A valid latitude and longitude are required.", 400);
  }
  try {
    const endpoint = process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "ARGUS-Remote-Health/1.0" },
      body: new URLSearchParams({ data: overpassCareQuery(latitude, longitude, radius) }),
      signal: AbortSignal.timeout(18_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    const payload = await response.json() as { elements?: [] };
    const facilities = normalizeOverpassFacilities(payload.elements || [], latitude, longitude);
    return success({ facilities, available: true, provider: "OpenStreetMap", message: facilities.length ? null : "No mapped health facilities were found within the search area." });
  } catch {
    return success({ facilities: [], available: false, provider: "OpenStreetMap", message: "Nearby care is temporarily unavailable. You can still open the latest location in Maps." });
  }
});
