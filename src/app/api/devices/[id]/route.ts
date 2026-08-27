import { authorityAccessError } from "@/lib/api-auth";
import { failure, readJson, success } from "@/lib/api-response";
import { createPairingCode, hashPairingCode } from "@/lib/portal-auth";
import { databaseError } from "@/lib/api-route-support";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withRequestContext<RouteContext>(
  "/api/devices/[id]",
  async (request, routeContext, context) => {
  const authError = authorityAccessError(request);
  if (authError) return authError;
  const { id } = await routeContext.params;
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as Record<string, unknown>;
  const regeneratePairingCode = body?.regeneratePairingCode === true;
  const update: Record<string, unknown> = {};
  if ("trekkerId" in body) {
    update.trekker_id =
      typeof body.trekkerId === "string" && body.trekkerId.trim()
        ? body.trekkerId.trim()
        : null;
  }
  if (typeof body?.isActive === "boolean") update.is_active = body.isActive;
  if ("displayName" in body) {
    if (body.displayName !== null && typeof body.displayName !== "string") return failure("VALIDATION_ERROR", "Display name must be text.", 400);
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (displayName.length > 120) return failure("VALIDATION_ERROR", "Display name must be 120 characters or fewer.", 400);
    update.display_name = displayName || null;
  }
  let pairingCode: string | undefined;
  if (regeneratePairingCode) {
    pairingCode = createPairingCode();
    update.pairing_code_hash = hashPairingCode(pairingCode);
  }
  if (!Object.keys(update).length) {
    return failure("VALIDATION_ERROR", "No supported device changes were provided.", 400);
  }
  try {
    const db = getSupabaseServer();
    if (typeof update.trekker_id === "string") {
      const { data: user, error: userError } = await db.from("trekkers").select("id").eq("id", update.trekker_id).eq("is_active", true).maybeSingle<{ id: string }>();
      if (userError) throw userError;
      if (!user) return failure("USER_NOT_FOUND", "Select an active User account.", 404);
    }
    const { data, error } = await db
      .from("devices")
      .update(update)
      .eq("id", id)
      .select("id, trekker_id, is_active, last_seen_at, updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) return failure("DEVICE_NOT_FOUND", "The device was not found.", 404);
    return success({
      device: {
        id: data.id,
        trekkerId: data.trekker_id,
        isActive: data.is_active,
        lastSeenAt: data.last_seen_at,
        updatedAt: data.updated_at,
      },
      ...(pairingCode
        ? {
            pairingCode,
            warning: "Copy this pairing code now. It will not be shown again.",
          }
        : {}),
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") return failure("USER_ALREADY_ASSIGNED", "That User already has an assigned wearable. Unassign it before reassigning this device.", 409);
    return databaseError(error, context, { name: "update device", table: "devices" });
  }
  },
);
