"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PortalApiError, portalRequest } from "@/lib/portal-api";

type UserMode = "login" | "signup" | "forgot" | "legacy";

export function LoginForm({ kind, notice = "" }: { kind: "authority" | "trekker"; notice?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<UserMode>("login");
  const [error, setError] = useState("");
  const [message, setMessage] = useState(notice);
  const [pending, setPending] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function changeMode(next: UserMode) {
    setMode(next);
    setError("");
    setMessage("");
  }

  async function submit(formData: FormData) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      if (kind === "authority") {
        await portalRequest("/api/auth/authority/login", { method: "POST", body: JSON.stringify({ username: formData.get("username"), password: formData.get("password") }) });
        router.replace("/responder/dashboard");
      } else if (mode === "signup") {
        const result = await portalRequest<{ confirmationRequired: boolean }>("/api/auth/trekker/signup", {
          method: "POST",
          body: JSON.stringify({ email: formData.get("email"), password: formData.get("password"), confirmPassword: formData.get("confirmPassword"), name: formData.get("name"), phone: formData.get("phone") || undefined }),
        });
        if (result.confirmationRequired) {
          setMessage("Check your email to confirm the account, then sign in.");
          setMode("login");
          return;
        }
        router.replace("/user/dashboard");
      } else if (mode === "forgot") {
        await portalRequest("/api/auth/trekker/forgot-password", { method: "POST", body: JSON.stringify({ email: formData.get("email") }) });
        setMessage("If an account exists for that email, a password reset link has been sent.");
        return;
      } else if (mode === "legacy") {
        await portalRequest("/api/auth/trekker/login", { method: "POST", body: JSON.stringify({ trekkerId: formData.get("trekkerId"), pairingCode: formData.get("pairingCode") }) });
        router.replace("/user/dashboard");
      } else {
        await portalRequest("/api/auth/trekker/login", { method: "POST", body: JSON.stringify({ email: formData.get("email"), password: formData.get("password") }) });
        router.replace("/user/dashboard");
      }
      router.refresh();
    } catch (reason) {
      setError(reason instanceof PortalApiError ? reason.message : "Could not reach the server. Check your connection and try again.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  const title = kind === "authority" ? "Responder sign in" : mode === "signup" ? "Create your Trekker account" : mode === "forgot" ? "Reset your password" : mode === "legacy" ? "Legacy device access" : "Trekker sign in";

  return (
    <main className="login-page">
      <section className="login-card">
        <Link href="/" className="brand">ARGUS</Link>
        <p className="eyebrow">{kind === "authority" ? "Responder command center" : "Trekker portal"}</p>
        <h1>{title}</h1>
        <p>{kind === "authority" ? "Use the responder account configured by the ARGUS administrator." : mode === "signup" ? "Create a private trekker account. Emergency contacts and response details are always optional." : mode === "forgot" ? "Enter your account email to receive a secure reset link." : mode === "legacy" ? "Existing device accounts can continue using their Trekker ID and pairing code." : "Sign in with the email and password used for your Trekker account."}</p>
        <form action={(data) => void submit(data)}>
          {kind === "authority" ? (
            <><label htmlFor="username">Username</label><input id="username" name="username" autoComplete="username" required /><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></>
          ) : mode === "legacy" ? (
            <><label htmlFor="trekkerId">Trekker ID</label><input id="trekkerId" name="trekkerId" autoComplete="username" required /><label htmlFor="pairingCode">Device pairing code</label><input id="pairingCode" name="pairingCode" type="password" autoComplete="one-time-code" required /></>
          ) : (
            <>
              {mode === "signup" ? <><label htmlFor="name">Full name</label><input id="name" name="name" autoComplete="name" required maxLength={120} /></> : null}
              <label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
              {mode === "signup" ? <><label htmlFor="phone">Phone <span className="muted">(optional)</span></label><input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={40} /></> : null}
              {mode !== "forgot" ? <><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} maxLength={128} />{mode === "signup" ? <><label htmlFor="confirmPassword">Confirm password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /></> : null}</> : null}
            </>
          )}
          {error ? <p ref={errorRef} className="form-error" role="status" aria-live="polite" tabIndex={-1}>{error}</p> : null}
          {message ? <p className="form-message" role="status">{message}</p> : null}
          <button className="primary-button" type="submit" disabled={pending}>{pending ? "Please wait…" : kind === "authority" || mode === "login" || mode === "legacy" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</button>
        </form>
        {kind === "trekker" ? <div className="login-links">{mode !== "login" ? <button className="text-button" type="button" onClick={() => changeMode("login")}>Back to sign in</button> : <><button className="text-button" type="button" onClick={() => changeMode("signup")}>Create account</button><button className="text-button" type="button" onClick={() => changeMode("forgot")}>Forgot password?</button><button className="text-button" type="button" onClick={() => changeMode("legacy")}>Use legacy pairing access</button></>}</div> : null}
        <Link className="text-link" href={kind === "authority" ? "/user/login" : "/responder/login"}>{kind === "authority" ? "Open Trekker Login" : "Open Responder Login"}</Link>
      </section>
    </main>
  );
}
