import { redirect } from "next/navigation";
import { LoginForm } from "@/components/shared/login-form";
import { currentSession } from "@/lib/portal-auth";

export default async function UserLoginPage({ searchParams }: { searchParams: Promise<{ confirmed?: string }> }) {
  const session = await currentSession();
  if (session?.role === "trekker") redirect("/user/dashboard");
  const { confirmed } = await searchParams;
  return <LoginForm kind="trekker" notice={confirmed === "1" ? "Email confirmed. Sign in to continue." : ""} />;
}
