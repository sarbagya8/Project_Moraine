import { failure, success, validationFailure } from "@/lib/api-response";
import { isAdminAuthorized, isTrekkerAuthorized } from "@/lib/api-auth";
import { env } from "@/lib/env";
import { ageSeconds } from "@/lib/map-links";
import {
  activeTrekker,
  databaseError,
  zodDetails,
  zodMessage,
} from "@/lib/api-route-support";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import { latestQuerySchema } from "@/lib/validation/query-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRequestContext(
  "/api/location/latest",
  async (request, _routeContext, context) => {
    const input = latestQuerySchema.safeParse({
      trekkerId: new URL(request.url).searchParams.get("trekkerId") || "",
    });
    if (!input.success) {
      return validationFailure(zodMessage(input.error), zodDetails(input.error));
    }
    if (
      !isAdminAuthorized(request) &&
      !isTrekkerAuthorized(request, input.data.trekkerId)
    ) {
      return failure("UNAUTHORIZED", "Access to this location is not allowed.", 401);
    }

    try {
      if (!(await activeTrekker(input.data.trekkerId))) {
        return failure("UNKNOWN_TREKKER", "The trekker was not found.", 404);
      }

      const { data, error } = await getSupabaseServer()
        .from("locations")
        .select(
          "id, latitude, longitude, accuracy_meters, altitude, source, captured_at",
        )
        .eq("trekker_id", input.data.trekkerId)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return failure(
          "NO_LOCATION",
          "No location is available for this trekker.",
          404,
        );
      }

      const age = ageSeconds(data.captured_at);
      return success({
        location: {
          id: data.id,
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          accuracyMeters:
            data.accuracy_meters == null ? null : Number(data.accuracy_meters),
          altitude: data.altitude == null ? null : Number(data.altitude),
          source: data.source,
          capturedAt: data.captured_at,
        },
        ageSeconds: age,
        isStale: age > env.locationStaleSeconds,
      });
    } catch (error) {
      return databaseError(error, context);
    }
  },
);
