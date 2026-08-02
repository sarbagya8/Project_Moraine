export type DatabaseLikeError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

const HARDWARE_COLUMNS = [
  "firmware_version",
  "last_verified_at",
  "sensor_state",
  "device_uptime_ms",
  "temperature_kind",
  "device_pressed_at_ms",
  "hardware_event_id",
  "notification_started_at",
  "locations.device_id",
  "sos_events.device_id",
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
] as const;

export function databaseErrorFields(error: unknown) {
  const candidate = error as DatabaseLikeError;
  return {
    databaseCode: candidate?.code || "unknown",
    databaseMessage: candidate?.message || "Unknown database error",
    databaseDetails: candidate?.details || null,
    databaseHint: candidate?.hint || null,
  };
}

export function isHardwareMigrationError(error: unknown) {
  const candidate = error as DatabaseLikeError;
  if (candidate?.code !== "42703" && candidate?.code !== "PGRST204") {
    return false;
  }

  const text = `${candidate.message || ""} ${candidate.details || ""}`.toLowerCase();
  return HARDWARE_COLUMNS.some((column) => {
    if (text.includes(column)) return true;
    const [table, columnName] = column.split(".");
    return (
      columnName &&
      text.includes(table) &&
      text.includes(columnName)
    );
  });
}
