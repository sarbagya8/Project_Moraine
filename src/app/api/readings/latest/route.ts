import { failure, success, validationFailure } from "@/lib/api-response";
import { authorityOrTrekkerAccessError } from "@/lib/api-auth";
import { SENSOR_DISCLAIMER } from "@/lib/disclaimer";
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
  "/api/readings/latest",
  async (request, _routeContext, context) => {
    const input = latestQuerySchema.safeParse({
      trekkerId: new URL(request.url).searchParams.get("trekkerId") || "",
    });
    if (!input.success) {
      return validationFailure(zodMessage(input.error), zodDetails(input.error));
    }
    const authError = authorityOrTrekkerAccessError(
      request,
      input.data.trekkerId,
    );
    if (authError) return authError;

    try {
      if (!(await activeTrekker(input.data.trekkerId))) {
        return failure("UNKNOWN_TREKKER", "The trekker was not found.", 404);
      }

      const { data, error } = await getSupabaseServer()
        .from("sensor_readings")
        .select(
          "id, heart_rate, spo2, altitude, temperature, device_id, captured_at",
        )
        .eq("trekker_id", input.data.trekkerId)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return failure(
          "NO_SENSOR_READING",
          "No sensor reading is available for this trekker.",
          404,
        );
      }

      const age = ageSeconds(data.captured_at);
      return success({
        reading: {
          id: data.id,
          heartRate: Number(data.heart_rate),
          spo2: Number(data.spo2),
          altitude: data.altitude == null ? null : Number(data.altitude),
          temperature: data.temperature == null ? null : Number(data.temperature),
          deviceId: data.device_id,
          capturedAt: data.captured_at,
        },
        ageSeconds: age,
        isStale: age > env.readingStaleSeconds,
        disclaimer: SENSOR_DISCLAIMER,
      });
    } catch (error) {
      return databaseError(error, context);
    }
  },
);
