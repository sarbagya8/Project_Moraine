import { z } from "zod";
import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { zodDetails, zodMessage } from "@/lib/api-route-support";
import { env } from "@/lib/env";
import { createSessionToken, sessionCookie } from "@/lib/portal-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseAuthClient, getSupabaseServer } from "@/lib/supabase/server";

const schema = z.object({
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
  confirmPassword: z.string().min(8, "Use at least 8 characters.").max(128),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
}).strict().refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export const POST = withRequestContext("/api/auth/trekker/signup", async (request) => {
  const limit = checkRateLimit(request, "user-signup", 5, 60 * 60_000);
  if (!limit.allowed) return failure("RATE_LIMITED", `Too many signup attempts. Try again in ${limit.retryAfter} seconds.`, 429);
  if (env.sessionSecret.length < 32) return failure("AUTH_NOT_CONFIGURED", "User signup is not configured.", 503);
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const input = schema.safeParse(parsed.data);
  if (!input.success) return validationFailure(zodMessage(input.error), zodDetails(input.error));

  const authClient = getSupabaseAuthClient();
  const { data: auth, error: authError } = await authClient.auth.signUp({
    email: input.data.email,
    password: input.data.password,
    options: {
      emailRedirectTo: `${env.appUrl}/user/login?confirmed=1`,
      data: { full_name: input.data.name, role: "user" },
    },
  });
  if (authError || !auth.user) {
    return failure("SIGNUP_FAILED", authError?.message || "The account could not be created.", 400);
  }

  const { error: profileError } = await getSupabaseServer().from("trekkers").insert({
    id: auth.user.id,
    auth_user_id: auth.user.id,
    email: input.data.email,
    role: "user",
    name: input.data.name,
    mobile_number: input.data.phone || null,
    emergency_contact: "",
  });
  if (profileError?.code === "23505") {
    const { data: existing } = await getSupabaseServer().from("trekkers").select("id").eq("auth_user_id", auth.user.id).maybeSingle<{ id: string }>();
    if (!existing) return failure("ACCOUNT_EXISTS", "An account already exists for this email. Sign in or reset the password.", 409);
  } else if (profileError) {
    await getSupabaseServer().auth.admin.deleteUser(auth.user.id);
    if (["42703", "PGRST204"].includes(profileError.code || "")) {
      return failure("ACCOUNT_SCHEMA_REQUIRED", "User accounts require the account migration. Existing portal access remains available.", 503);
    }
    return failure("PROFILE_CREATION_FAILED", "The account profile could not be created.", 503);
  }

  if (!auth.session) {
    return success({ confirmationRequired: true, email: input.data.email }, 201);
  }
  const response = success({ confirmationRequired: false, email: input.data.email }, 201);
  response.cookies.set(sessionCookie(createSessionToken("trekker", auth.user.id)));
  return response;
});
