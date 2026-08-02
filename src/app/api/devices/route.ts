import { authorityAccessError } from "@/lib/api-auth";
import { failure, readJson, success } from "@/lib/api-response";
import { createPairingCode, hashPairingCode } from "@/lib/portal-auth";
import { databaseError } from "@/lib/api-route-support";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRequestContext("/api/devices", async (request, _route, context) => {
  const denied = authorityAccessError(request);
  if (denied) return denied;
  try {
    const { data, error } = await getSupabaseServer()
      .from("devices")
      .select(
        "id, trekker_id, is_active, last_seen_at, created_at, updated_at, trekkers(name)",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return success({
      devices: (data || []).map((device) => ({
        id: device.id,
        trekkerId: device.trekker_id,
        trekkerName:
          (device.trekkers as unknown as { name?: string } | null)?.name || null,
        isActive: device.is_active,
        lastSeenAt: device.last_seen_at,
        createdAt: device.created_at,
        updatedAt: device.updated_at,
      })),
    });
  } catch (error) {
    return databaseError(error, context, { name: "load devices", table: "devices" });
  }
});

export const POST = withRequestContext("/api/devices", async (request, _route, context) => {
  const denied = authorityAccessError(request);
  if (denied) return denied;
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as Record<string, unknown>;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const trekkerId =
    typeof body?.trekkerId === "string" && body.trekkerId.trim()
      ? body.trekkerId.trim()
      : null;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
    return failure(
      "VALIDATION_ERROR",
      "Device ID may contain letters, numbers, underscores, and hyphens.",
      400,
    );
  }
  const pairingCode = createPairingCode();
  try {
    const { data, error } = await getSupabaseServer()
      .from("devices")
      .insert({
        id,
        trekker_id: trekkerId,
        pairing_code_hash: hashPairingCode(pairingCode),
      })
      .select("id, trekker_id, is_active, created_at")
      .single();
    if (error) throw error;
    return success(
      {
        device: {
          id: data.id,
          trekkerId: data.trekker_id,
          isActive: data.is_active,
          createdAt: data.created_at,
        },
        pairingCode,
        warning: "Copy this pairing code now. It will not be shown again.",
      },
      201,
    );
  } catch (error) {
    return databaseError(error, context, { name: "create device", table: "devices" });
  }
});
