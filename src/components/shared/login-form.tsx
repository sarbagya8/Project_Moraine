"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { portalRequest } from "@/lib/portal-api";

export function LoginForm({ kind }: { kind: "authority" | "trekker" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    try {
      if (kind === "authority") {
        await portalRequest("/api/auth/authority/login", {
          method: "POST",
          body: JSON.stringify({
            username: formData.get("username"),
            password: formData.get("password"),
          }),
        });
        router.replace("/authority/dashboard");
      } else {
        await portalRequest("/api/auth/trekker/login", {
          method: "POST",
          body: JSON.stringify({
            trekkerId: formData.get("trekkerId"),
            pairingCode: formData.get("pairingCode"),
          }),
        });
        router.replace("/trekker/dashboard");
      }
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <Link href="/" className="brand">ARGUS</Link>
        <p className="eyebrow">
          {kind === "authority" ? "Authority / Rescue Portal" : "Trekker Portal"}
        </p>
        <h1>{kind === "authority" ? "Sign in securely" : "Connect your trek"}</h1>
        <p>
          {kind === "authority"
            ? "Use the authority account configured by the ARGUS administrator."
            : "Enter the public trekker ID and one-time device pairing code supplied during setup."}
        </p>
        <form action={(data) => void submit(data)}>
          {kind === "authority" ? (
            <>
              <label htmlFor="username">Username</label>
              <input id="username" name="username" autoComplete="username" required />
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required />
            </>
          ) : (
            <>
              <label htmlFor="trekkerId">Public trekker ID</label>
              <input id="trekkerId" name="trekkerId" autoComplete="username" required />
              <label htmlFor="pairingCode">Device pairing code</label>
              <input id="pairingCode" name="pairingCode" type="password" autoComplete="one-time-code" required />
            </>
          )}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <Link className="text-link" href={kind === "authority" ? "/trekker/login" : "/authority/login"}>
          {kind === "authority" ? "Open the trekker portal" : "Open authority login"}
        </Link>
      </section>
    </main>
  );
}
