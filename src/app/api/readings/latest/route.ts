import { failure, success, validationFailure } from "@/lib/api-response";
import { authorityOrTrekkerAccessError } from "@/lib/api-auth";
import { SENSOR_DISCLAIMER } from "@/lib/disclaimer";
import { env } from "@/lib/env";
import { withHardwareSchemaFallback } from "@/lib/database-schema";
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

type LatestReadingRow = {
  id: string;
  heart_rate: number | null;
  spo2: number | null;
  sensor_state: string | null;
  altitude: number | null;
  pressure: number | null;
  temperature: number | null;
  start_altitude: number | null;
  current_altitude: number | null;
  average_speed: number | null;
  distance: number | null;
  ams_status: string | null;
  fall_detected: boolean | null;
  fall_type: string | null;
  sos_countdown: boolean | null;
  sos_active: boolean | null;
  device_id: string;
  captured_at: string;
};
type LegacyLatestReadingRow = Pick<
  LatestReadingRow,
  "id" | "heart_rate" | "spo2" | "altitude" | "temperature" | "device_id" | "captured_at"
>;

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

      const db = getSupabaseServer();
      const result = await withHardwareSchemaFallback<LatestReadingRow, LegacyLatestReadingRow>({
        enriched: () => db.from("sensor_readings")
          .select("id, heart_rate, spo2, sensor_state, altitude, pressure, temperature, start_altitude, current_altitude, average_speed, distance, ams_status, fall_detected, fall_type, sos_countdown, sos_active, device_id, captured_at")
          .eq("trekker_id", input.data.trekkerId)
          .not("request_id", "like", "argus-demo-reading-%")
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        legacy: () => db.from("sensor_readings")
          .select("id, heart_rate, spo2, altitude, temperature, device_id, captured_at")
          .eq("trekker_id", input.data.trekkerId)
          .not("request_id", "like", "argus-demo-reading-%")
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        adaptLegacy: (row) => row ? {
          ...row,
          sensor_state: null,
          pressure: null,
          start_altitude: null,
          current_altitude: null,
          average_speed: null,
          distance: null,
          ams_status: null,
          fall_detected: null,
          fall_type: null,
          sos_countdown: null,
          sos_active: null,
        } : null,
        context,
        operation: "load latest sensor reading",
        table: "sensor_readings",
      });
      const data = result.data;
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
          heartRate: data.heart_rate == null ? null : Number(data.heart_rate),
          spo2: data.spo2 == null ? null : Number(data.spo2),
          sensorState: data.sensor_state,
          altitude: data.altitude == null ? null : Number(data.altitude),
          temperature: data.temperature == null ? null : Number(data.temperature),
          pressure: data.pressure == null ? null : Number(data.pressure),
          startAltitude: data.start_altitude == null ? null : Number(data.start_altitude),
          currentAltitude: data.current_altitude == null ? null : Number(data.current_altitude),
          averageSpeed: data.average_speed == null ? null : Number(data.average_speed),
          distance: data.distance == null ? null : Number(data.distance),
          amsStatus: data.ams_status,
          fallDetected: data.fall_detected == null ? null : Boolean(data.fall_detected),
          fallType: data.fall_type,
          sosCountdown: data.sos_countdown == null ? null : Boolean(data.sos_countdown),
          physicalSos: data.sos_active == null ? null : Boolean(data.sos_active),
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
