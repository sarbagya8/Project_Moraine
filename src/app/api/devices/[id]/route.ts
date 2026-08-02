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
  let pairingCode: string | undefined;
  if (regeneratePairingCode) {
    pairingCode = createPairingCode();
    update.pairing_code_hash = hashPairingCode(pairingCode);
  }
  if (!Object.keys(update).length) {
    return failure("VALIDATION_ERROR", "No supported device changes were provided.", 400);
  }
  try {
    const { data, error } = await getSupabaseServer()
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
    return databaseError(error, context, { name: "update device", table: "devices" });
  }
  },
);
