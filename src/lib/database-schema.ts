import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  databaseErrorFields,
  isHealthProfileMigrationError,
  isHardwareMigrationError,
  type DatabaseLikeError,
} from "./database-error";
import type { RequestContext } from "./request-context";
import { logWarning } from "./request-context";

export { databaseErrorFields, isHardwareMigrationError, isHealthProfileMigrationError, isCaseWorkflowMigrationError } from "./database-error";

type QueryResult<T> = {
  data: T | null;
  error: DatabaseLikeError | null;
};

const LEGACY_SENSOR_FIELDS = new Set([
  "sensor_state",
  "device_uptime_ms",
  "temperature_kind",
  "pressure",
  "start_altitude",
  "current_altitude",
  "average_speed",
  "distance",
  "ams_status",
  "fall_detected",
  "fall_type",
  "sos_countdown",
  "sos_active",
]);

export async function withHardwareSchemaFallback<TFull, TLegacy>(input: {
  enriched: () => PromiseLike<QueryResult<TFull>>;
  legacy: () => PromiseLike<QueryResult<TLegacy>>;
  adaptLegacy: (data: TLegacy | null) => TFull | null;
  context?: RequestContext;
  operation: string;
  table: string;
}) {
  const enriched = await input.enriched();
  if (!enriched.error) {
    return { data: enriched.data, hardwareSchemaReady: true };
  }
  if (!isHardwareMigrationError(enriched.error)) throw enriched.error;

  if (input.context) {
    logWarning(input.context, "database.hardware_schema_fallback", {
      operation: input.operation,
      table: input.table,
      ...databaseErrorFields(enriched.error),
    });
  }

  const legacy = await input.legacy();
  if (legacy.error) throw legacy.error;
  return {
    data: input.adaptLegacy(legacy.data),
    hardwareSchemaReady: false,
  };
}

export async function withHealthProfileSchemaFallback<TFull, TLegacy>(input: {
  enriched: () => PromiseLike<QueryResult<TFull>>;
  legacy: () => PromiseLike<QueryResult<TLegacy>>;
  adaptLegacy: (data: TLegacy | null) => TFull | null;
  context?: RequestContext;
  operation: string;
  table: string;
}) {
  const enriched = await input.enriched();
  if (!enriched.error) return { data: enriched.data, healthProfileSchemaReady: true };
  if (!isHealthProfileMigrationError(enriched.error)) throw enriched.error;
  if (input.context) {
    logWarning(input.context, "database.health_profile_schema_fallback", {
      operation: input.operation,
      table: input.table,
      ...databaseErrorFields(enriched.error),
    });
  }
  const legacy = await input.legacy();
  if (legacy.error) throw legacy.error;
  return { data: input.adaptLegacy(legacy.data), healthProfileSchemaReady: false };
}

export async function updateWithHardwareSchemaFallback(input: {
  enriched: () => PromiseLike<QueryResult<unknown>>;
  legacy?: () => PromiseLike<QueryResult<unknown>>;
  context?: RequestContext;
  operation: string;
  table: string;
}) {
  const enriched = await input.enriched();
  if (!enriched.error) return { hardwareSchemaReady: true };
  if (!isHardwareMigrationError(enriched.error)) throw enriched.error;

  if (input.context) {
    logWarning(input.context, "database.hardware_schema_fallback", {
      operation: input.operation,
      table: input.table,
      ...databaseErrorFields(enriched.error),
    });
  }

  if (input.legacy) {
    const legacy = await input.legacy();
    if (legacy.error) throw legacy.error;
  }
  return { hardwareSchemaReady: false };
}

export async function insertSensorReadingCompatible(
  db: SupabaseClient,
  payload: Record<string, unknown> & {
    heart_rate: number | null;
    spo2: number | null;
    sensor_state: string;
  },
) {
  const enriched = await db.from("sensor_readings").insert(payload).select("id").single();
  if (!enriched.error) {
    return { data: enriched.data as { id: string }, error: null, hardwareSchemaReady: true };
  }
  if (!isHardwareMigrationError(enriched.error)) {
    return { data: null, error: enriched.error, hardwareSchemaReady: true };
  }

  // Before migration 010, vitals are NOT NULL and there is no sensor-state
  // column. Valid readings remain safely persistable; unavailable readings
  // require the migration so they are never converted into fake zero values.
  if (
    payload.sensor_state !== "valid" ||
    payload.heart_rate == null ||
    payload.spo2 == null
  ) {
    return { data: null, error: enriched.error, hardwareSchemaReady: false };
  }

  const legacyPayload = Object.fromEntries(
    Object.entries(payload).filter(([key]) => !LEGACY_SENSOR_FIELDS.has(key)),
  );
  const legacy = await db
    .from("sensor_readings")
    .insert(legacyPayload)
    .select("id")
    .single();
  return {
    data: legacy.data as { id: string } | null,
    error: legacy.error,
    hardwareSchemaReady: false,
  };
}
