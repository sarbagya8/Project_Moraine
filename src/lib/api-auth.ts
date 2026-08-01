import "server-only";
import { timingSafeEqual } from "node:crypto";
import { requestSession } from "./portal-auth";

export function isSecretEqual(
  supplied: string | null,
  expected: string | undefined,
) {
  if (!supplied || !expected) return false;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function isDeviceAuthorized(request: Request) {
  return isSecretEqual(
    request.headers.get("x-device-api-key")?.trim() || null,
    process.env.DEVICE_API_KEY?.trim(),
  );
}

export function isAdminAuthorized(request: Request) {
  const session = requestSession(request);
  return (
    session?.role === "authority" ||
    isSecretEqual(
      request.headers.get("x-admin-api-key")?.trim() || null,
      process.env.ADMIN_API_KEY?.trim(),
    )
  );
}

export function isTrekkerAuthorized(request: Request, trekkerId: string) {
  const session = requestSession(request);
  return session?.role === "trekker" && session.subject === trekkerId;
}
