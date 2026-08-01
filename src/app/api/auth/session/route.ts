import { failure, success } from "@/lib/api-response";
import { requestSession } from "@/lib/portal-auth";
import { withRequestContext } from "@/lib/request-context";

export const GET = withRequestContext(
  "/api/auth/session",
  async (request) => {
  const session = requestSession(request);
  if (!session) return failure("UNAUTHENTICATED", "Sign in is required.", 401);
  return success({ role: session.role, subject: session.subject });
  },
);
