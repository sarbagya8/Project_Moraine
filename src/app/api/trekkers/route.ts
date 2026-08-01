import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { isAdminAuthorized } from "@/lib/api-auth";
import { env } from "@/lib/env";
import { canonicalNepalMobile } from "@/lib/phone";
import {
  databaseError,
  zodDetails,
  zodMessage,
} from "@/lib/api-route-support";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import { createTrekkerSchema } from "@/lib/validation/trekker-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireAdmin(request: Request) {
  if (!env.administrativeAuthConfigured) {
    return failure(
      "ADMIN_AUTH_NOT_CONFIGURED",
      "Administrative authentication is not configured.",
      503,
    );
  }
  if (!isAdminAuthorized(request)) {
    return failure(
      "UNAUTHORIZED_ADMIN",
      "A valid administrative API key is required.",
      401,
    );
  }
  return null;
}

export const GET = withRequestContext(
  "/api/trekkers",
  async (request, _routeContext, context) => {
    const authError = requireAdmin(request);
    if (authError) return authError;

    try {
      const { data, error } = await getSupabaseServer()
        .from("trekkers")
        .select(
          "id, name, mobile_number, emergency_contact, guide_mobile, route_name, blood_group, medical_notes, is_active, created_at, updated_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return success({ trekkers: data || [] });
    } catch (error) {
      return databaseError(error, context);
    }
  },
);

export const POST = withRequestContext(
  "/api/trekkers",
  async (request, _routeContext, context) => {
    const authError = requireAdmin(request);
    if (authError) return authError;

    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const input = createTrekkerSchema.safeParse(parsed.data);
    if (!input.success) {
      return validationFailure(zodMessage(input.error), zodDetails(input.error));
    }

    try {
      const { data, error } = await getSupabaseServer()
        .from("trekkers")
        .insert({
          id: input.data.id,
          name: input.data.name,
          mobile_number: input.data.mobileNumber
            ? canonicalNepalMobile(input.data.mobileNumber)
            : null,
          emergency_contact: canonicalNepalMobile(
            input.data.emergencyContact,
          ),
          guide_mobile: input.data.guideMobile
            ? canonicalNepalMobile(input.data.guideMobile)
            : null,
          route_name: input.data.routeName || null,
          blood_group: input.data.bloodGroup || null,
          medical_notes: input.data.medicalNotes || null,
        })
        .select("id, name, route_name, is_active, created_at")
        .single();
      if (error) throw error;
      return success({ trekker: data }, 201);
    } catch (error) {
      return databaseError(error, context);
    }
  },
);
