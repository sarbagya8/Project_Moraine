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
  "display_name",
] as const;

const HEALTH_PROFILE_COLUMNS = [
  "date_of_birth",
  "address",
  "allergies",
  "known_conditions",
  "current_medications",
  "emergency_contact_name",
  "emergency_contact_phone",
  "emergency_notes",
  "duration",
  "auth_user_id",
  "email",
  "preferred_language",
  "secondary_emergency_contact_name",
  "secondary_emergency_contact_phone",
  "emergency_contact_relationship",
] as const;

const CASE_WORKFLOW_FIELDS = [
  "acknowledged_at",
  "in_progress_at",
  "case_events",
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

export function isHealthProfileMigrationError(error: unknown) {
  const candidate = error as DatabaseLikeError;
  if (candidate?.code !== "42703" && candidate?.code !== "PGRST204") return false;
  const text = `${candidate.message || ""} ${candidate.details || ""}`.toLowerCase();
  return HEALTH_PROFILE_COLUMNS.some((column) => text.includes(column));
}

export function isCaseWorkflowMigrationError(error: unknown) {
  const candidate = error as DatabaseLikeError;
  if (!["42P01", "42703", "PGRST204", "PGRST205"].includes(candidate?.code || "")) return false;
  const text = `${candidate.message || ""} ${candidate.details || ""}`.toLowerCase();
  return CASE_WORKFLOW_FIELDS.some((field) => text.includes(field));
}
