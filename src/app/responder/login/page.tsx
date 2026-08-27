import { redirect } from "next/navigation";
import { LoginForm } from "@/components/shared/login-form";
import { currentSession } from "@/lib/portal-auth";

export default async function ResponderLoginPage() {
  const session = await currentSession();
  if (session?.role === "authority") redirect("/responder/dashboard");
  return <LoginForm kind="authority" />;
}
