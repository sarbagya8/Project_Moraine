import { redirect } from "next/navigation";
import { LoginForm } from "@/components/shared/login-form";
import { currentSession } from "@/lib/portal-auth";

export default async function AuthorityLoginPage() {
  if ((await currentSession())?.role === "authority") redirect("/authority/dashboard");
  return <LoginForm kind="authority" />;
}
