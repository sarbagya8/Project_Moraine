import "server-only";
import type { ZodError } from "zod";
import { failure } from "./api-response";
import { databaseErrorFields, isHardwareMigrationError } from "./database-error";
import type { RequestContext } from "./request-context";
import { logError } from "./request-context";
import { getSupabaseServer } from "./supabase/server";

export type TrekkerRow = {
  id: string;
  name: string;
  mobile_number: string | null;
  emergency_contact: string | null;
  guide_mobile: string | null;
  route_name: string | null;
  blood_group: string | null;
  medical_notes: string | null;
  is_active: boolean;
};

export function databaseError(
  error: unknown,
  context?: RequestContext,
  operation?: { name: string; table?: string },
) {
  const databaseError = error as { code?: string };
  if (context) {
    logError(context, "database.operation_failed", {
      operation: operation?.name || "unspecified",
      table: operation?.table || "unspecified",
      ...databaseErrorFields(error),
    });
  }

  if (error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED") {
    return failure(
      "DATABASE_NOT_CONFIGURED",
      "Database is not configured.",
      503,
    );
  }

  if (error instanceof Error && error.message === "SOS_RPC_REQUIRED") {
    return failure(
      "SOS_RPC_REQUIRED",
      "The required atomic SOS database function is not installed.",
      503,
    );
  }

  if (databaseError?.code === "23505") {
    return failure("CONFLICT", "A conflicting record already exists.", 409);
  }

  if (databaseError?.code === "23503") {
    return failure(
      "INVALID_REFERENCE",
      "A related record could not be found.",
      409,
    );
  }

  if (
    databaseError?.code === "PGRST205" ||
    databaseError?.code === "42P01" ||
    isHardwareMigrationError(error)
  ) {
    return failure(
      "DATABASE_MIGRATIONS_REQUIRED",
      "The ARGUS database migrations have not been applied.",
      503,
    );
  }

  return failure(
    "DATABASE_ERROR",
    "The database operation could not be completed.",
    500,
  );
}

export async function activeTrekker(trekkerId: string) {
  const { data, error } = await getSupabaseServer()
    .from("trekkers")
    .select(
      "id, name, mobile_number, emergency_contact, guide_mobile, route_name, blood_group, medical_notes, is_active",
    )
    .eq("id", trekkerId)
    .eq("is_active", true)
    .maybeSingle<TrekkerRow>();

  if (error) throw error;
  return data;
}

export function zodMessage(error: ZodError) {
  const issue = error.issues[0];
  if (!issue) return "Invalid request data.";
  const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

export function zodDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
