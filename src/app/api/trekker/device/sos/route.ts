import { databaseError, zodDetails, zodMessage } from "@/lib/api-route-support";
import { trekkerAccessError } from "@/lib/api-auth";
import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { SAFETY_DISCLAIMER } from "@/lib/disclaimer";
import { env } from "@/lib/env";
import { updateWithHardwareSchemaFallback } from "@/lib/database-schema";
import { suppliedIdempotencyKey } from "@/lib/idempotency";
import { checkRateLimit } from "@/lib/rate-limit";
import { logInfo, withRequestContext } from "@/lib/request-context";
import { processSos, SosWorkflowError } from "@/lib/sos-service";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  authorizedBridgeDevice,
  bridgeSosSchema,
  storeBridgeLocation,
} from "@/lib/trekker-device-bridge";

export const runtime = "nodejs";

export const POST = withRequestContext(
  "/api/trekker/device/sos",
  async (request, _routeContext, context) => {
    const limit = checkRateLimit(request, "trekker-device-sos", 10, 60_000);
    if (!limit.allowed) {
      return failure("RATE_LIMITED", `Retry in ${limit.retryAfter} seconds.`, 429);
    }
    const authError = trekkerAccessError(request);
    if (authError) return authError;
    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const input = bridgeSosSchema.safeParse(parsed.data);
    if (!input.success) {
      return validationFailure(zodMessage(input.error), zodDetails(input.error));
    }
    if (suppliedIdempotencyKey(request) !== input.data.eventId) {
      return failure("INVALID_EVENT_ID", "The SOS event ID must be used as the idempotency key.", 400);
    }

    try {
      const db = getSupabaseServer();
      const owner = await authorizedBridgeDevice(request, db, input.data.deviceId);
      if (!owner) {
        return failure("UNAUTHORIZED_DEVICE", "This device is not assigned to your account.", 403);
      }
      if (input.data.trekkerId && input.data.trekkerId !== owner.trekkerId) {
        return failure("DEVICE_IDENTITY_MISMATCH", "The wristband identity does not match its server assignment.", 403);
      }
      if (
        input.data.reading &&
        input.data.reading.deviceId !== owner.deviceId
      ) {
        return failure(
          "DEVICE_READING_MISMATCH",
          "The SOS reading does not belong to the verified wristband.",
          403,
        );
      }
      logInfo(context, "ble.sos_received", {
        deviceId: owner.deviceId,
        hardwareEventId: input.data.eventId,
        locationPresent: Boolean(input.data.location),
        readingPresent: Boolean(input.data.reading),
      });
      if (input.data.location) {
        await storeBridgeLocation(
          db,
          owner,
          {
            ...input.data.location,
            deviceId: owner.deviceId,
          },
          `${input.data.eventId.slice(0, 84)}:phone-location`,
        );
      }
      const result = await processSos(
        db,
        {
          trekkerId: owner.trekkerId,
          deviceId: owner.deviceId,
          source: "physical_button",
          reading: input.data.reading,
        },
        input.data.eventId,
        context,
      );
      const metadata = await updateWithHardwareSchemaFallback({
        enriched: () => db
          .from("sos_events")
          .update({
            device_id: owner.deviceId,
            hardware_event_id: input.data.eventId,
            device_pressed_at_ms: input.data.devicePressedAtMs ?? null,
          })
          .eq("id", result.event.id)
          .eq("hardware_event_id", input.data.eventId),
        context,
        operation: "store physical SOS metadata",
        table: "sos_events",
      });
      logInfo(context, "ble.sos_persisted", {
        deviceId: owner.deviceId,
        hardwareEventId: input.data.eventId,
        sosEventId: result.event.id,
        duplicate: result.duplicate,
        notificationStatus: result.event.notificationStatus,
        hardwareSchemaReady: metadata.hardwareSchemaReady,
      });
      return success(
        {
          ...result,
          created: !result.duplicate,
          sos: {
            ...result.event,
            trekkerId: owner.trekkerId,
          },
          notificationStatus: result.event.notificationStatus,
          eventId: input.data.eventId,
          databaseStatus: result.duplicate ? "existing" : "created",
          hardwareSchemaReady: metadata.hardwareSchemaReady,
          demoMode: env.demoMode,
          disclaimer: SAFETY_DISCLAIMER,
        },
        result.duplicate ? 200 : 201,
      );
    } catch (error) {
      if (error instanceof SosWorkflowError) {
        return failure(error.code, error.message, error.status);
      }
      return databaseError(error, context);
    }
  },
);
