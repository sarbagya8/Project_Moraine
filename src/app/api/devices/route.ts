import { authorityAccessError } from "@/lib/api-auth";
import { failure, readJson, success } from "@/lib/api-response";
import { createPairingCode, hashPairingCode } from "@/lib/portal-auth";
import { databaseError } from "@/lib/api-route-support";
import { isHardwareMigrationError, withHardwareSchemaFallback } from "@/lib/database-schema";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeviceRow = { id: string; display_name: string | null; trekker_id: string | null; is_active: boolean; last_seen_at: string | null; created_at: string; updated_at: string; trekkers: unknown };
type LegacyDeviceRow = Omit<DeviceRow, "display_name">;

export const GET = withRequestContext("/api/devices", async (request, _route, context) => {
  const denied = authorityAccessError(request);
  if (denied) return denied;
  try {
    const db = getSupabaseServer();
    const result = await withHardwareSchemaFallback<DeviceRow[], LegacyDeviceRow[]>({
      enriched: () => db.from("devices").select("id, display_name, trekker_id, is_active, last_seen_at, created_at, updated_at, trekkers(name)").order("created_at", { ascending: false }),
      legacy: () => db.from("devices").select("id, trekker_id, is_active, last_seen_at, created_at, updated_at, trekkers(name)").order("created_at", { ascending: false }),
      adaptLegacy: (rows) => (rows || []).map((row) => ({ ...row, display_name: null })),
      context,
      operation: "load devices",
      table: "devices",
    });
    const data = result.data || [];
    return success({
      devices: (data || []).map((device) => ({
        id: device.id,
        displayName: device.display_name,
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
  const displayName = typeof body?.displayName === "string" && body.displayName.trim() ? body.displayName.trim() : null;
  if (displayName && displayName.length > 120) return failure("VALIDATION_ERROR", "Display name must be 120 characters or fewer.", 400);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
    return failure(
      "VALIDATION_ERROR",
      "Device ID may contain letters, numbers, underscores, and hyphens.",
      400,
    );
  }
  const pairingCode = createPairingCode();
  try {
    const db = getSupabaseServer();
    if (trekkerId) {
      const { data: user, error: userError } = await db.from("trekkers").select("id").eq("id", trekkerId).eq("is_active", true).maybeSingle<{ id: string }>();
      if (userError) throw userError;
      if (!user) return failure("USER_NOT_FOUND", "Select an active User account.", 404);
    }
    let result = await db
      .from("devices")
      .insert({
        id,
        display_name: displayName,
        trekker_id: trekkerId,
        pairing_code_hash: hashPairingCode(pairingCode),
      })
      .select("id, trekker_id, is_active, created_at")
      .single();
    if (result.error && isHardwareMigrationError(result.error)) {
      result = await db.from("devices").insert({ id, trekker_id: trekkerId, pairing_code_hash: hashPairingCode(pairingCode) }).select("id, trekker_id, is_active, created_at").single();
    }
    if (result.error) throw result.error;
    const data = result.data;
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
    if ((error as { code?: string })?.code === "23505") return failure("DEVICE_OR_ASSIGNMENT_EXISTS", "The device ID already exists or that User already has an assigned wearable.", 409);
    return databaseError(error, context, { name: "create device", table: "devices" });
  }
});
