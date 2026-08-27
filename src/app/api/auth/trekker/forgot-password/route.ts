import { z } from "zod";
import { readJson, success, validationFailure } from "@/lib/api-response";
import { zodDetails, zodMessage } from "@/lib/api-route-support";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseAuthClient } from "@/lib/supabase/server";

const schema = z.object({ email: z.email().max(254) }).strict();

export const POST = withRequestContext("/api/auth/trekker/forgot-password", async (request) => {
  const limit = checkRateLimit(request, "forgot-password", 5, 60 * 60_000);
  if (!limit.allowed) return success({ accepted: true });
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const input = schema.safeParse(parsed.data);
  if (!input.success) return validationFailure(zodMessage(input.error), zodDetails(input.error));
  await getSupabaseAuthClient().auth.resetPasswordForEmail(input.data.email.trim().toLowerCase(), {
    redirectTo: `${env.appUrl}/user/reset-password`,
  });
  return success({ accepted: true });
});
