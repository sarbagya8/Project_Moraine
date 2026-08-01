import { redirect } from "next/navigation";
import { LoginForm } from "@/components/shared/login-form";
import { currentSession } from "@/lib/portal-auth";

export default async function TrekkerLoginPage() {
  if ((await currentSession())?.role === "trekker") redirect("/trekker/dashboard");
  return <LoginForm kind="trekker" />;
}
