import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import {
  authorityAccessError,
  authorityOrTrekkerAccessError,
} from "@/lib/api-auth";
import { canonicalNepalMobile } from "@/lib/phone";
import {
  databaseError,
  zodDetails,
  zodMessage,
} from "@/lib/api-route-support";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";
import { trekkerId } from "@/lib/validation/shared-schema";
import { updateTrekkerSchema } from "@/lib/validation/trekker-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withRequestContext<RouteContext>(
  "/api/trekkers/[id]",
  async (request, routeContext, context) => {
    const { id } = await routeContext.params;
    const parsedId = trekkerId.safeParse(id);
    if (!parsedId.success) {
      return validationFailure(
        zodMessage(parsedId.error),
        zodDetails(parsedId.error),
      );
    }
    const authError = authorityOrTrekkerAccessError(request, parsedId.data);
    if (authError) return authError;

    try {
      const { data, error } = await getSupabaseServer()
        .from("trekkers")
        .select("id, name, route_name, is_active")
        .eq("id", parsedId.data)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return failure("UNKNOWN_TREKKER", "The trekker was not found.", 404);
      }
      return success({
        trekker: {
          id: data.id,
          name: data.name,
          route: data.route_name,
        },
      });
    } catch (error) {
      return databaseError(error, context);
    }
  },
);

export const PATCH = withRequestContext<RouteContext>(
  "/api/trekkers/[id]",
  async (request, routeContext, context) => {
    const authError = authorityAccessError(request);
    if (authError) return authError;

    const { id } = await routeContext.params;
    const parsedId = trekkerId.safeParse(id);
    if (!parsedId.success) {
      return validationFailure(
        zodMessage(parsedId.error),
        zodDetails(parsedId.error),
      );
    }

    const parsed = await readJson(request);
    if (parsed.error) return parsed.error;
    const input = updateTrekkerSchema.safeParse(parsed.data);
    if (!input.success) {
      return validationFailure(zodMessage(input.error), zodDetails(input.error));
    }

    const update = {
      ...(input.data.name === undefined ? {} : { name: input.data.name }),
      ...(input.data.mobileNumber === undefined
        ? {}
        : {
            mobile_number: input.data.mobileNumber
              ? canonicalNepalMobile(input.data.mobileNumber)
              : null,
          }),
      ...(input.data.emergencyContact === undefined
        ? {}
        : {
            emergency_contact: canonicalNepalMobile(
              input.data.emergencyContact,
            ),
          }),
      ...(input.data.guideMobile === undefined
        ? {}
        : {
            guide_mobile: input.data.guideMobile
              ? canonicalNepalMobile(input.data.guideMobile)
              : null,
          }),
      ...(input.data.routeName === undefined
        ? {}
        : { route_name: input.data.routeName || null }),
      ...(input.data.bloodGroup === undefined
        ? {}
        : { blood_group: input.data.bloodGroup || null }),
      ...(input.data.medicalNotes === undefined
        ? {}
        : { medical_notes: input.data.medicalNotes || null }),
      ...(input.data.isActive === undefined
        ? {}
        : { is_active: input.data.isActive }),
    };

    try {
      const { data, error } = await getSupabaseServer()
        .from("trekkers")
        .update(update)
        .eq("id", parsedId.data)
        .select("id, name, route_name, is_active, updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return failure("UNKNOWN_TREKKER", "The trekker was not found.", 404);
      }
      return success({ trekker: data });
    } catch (error) {
      return databaseError(error, context);
    }
  },
);
