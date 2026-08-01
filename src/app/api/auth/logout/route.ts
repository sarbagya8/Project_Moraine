import { success } from "@/lib/api-response";
import { SESSION_COOKIE } from "@/lib/portal-auth";
import { withRequestContext } from "@/lib/request-context";

export const POST = withRequestContext(
  "/api/auth/logout",
  async () => {
  const response = success({ signedOut: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
  },
);
