"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(() => process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "" : "Password reset is not configured.");
  const [pending, setPending] = useState(false);
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);

  useEffect(() => {
    if (!client) return;
    const authClient = client;
    async function establishRecoverySession() {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (!accessToken || !refreshToken) {
        setError("This password reset link is invalid or expired.");
        return;
      }
      const { error: sessionError } = await authClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (sessionError) setError("This password reset link is invalid or expired.");
      else setReady(true);
    }
    void establishRecoverySession();
  }, [client]);

  async function updatePassword(formData: FormData) {
    if (!client || !ready || pending) return;
    const password = String(formData.get("password") || "");
    const confirmation = String(formData.get("confirmPassword") || "");
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirmation) return setError("Passwords do not match.");
    setPending(true);
    setError("");
    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) setError(updateError.message);
    else {
      await client.auth.signOut();
      setMessage("Password updated. You can now sign in.");
      setReady(false);
    }
    setPending(false);
  }

  return <main className="login-page"><section className="login-card"><Link href="/" className="brand">ARGUS</Link><p className="eyebrow">Trekker portal</p><h1>Choose a new password</h1>{error ? <p className="form-error" role="alert">{error}</p> : null}{message ? <p className="form-message">{message}</p> : null}{ready ? <form action={(form) => void updatePassword(form)}><label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /><label htmlFor="confirmPassword">Confirm password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /><button className="primary-button" disabled={pending}>{pending ? "Updating…" : "Update password"}</button></form> : null}<Link className="text-link" href="/user/login">Back to Trekker Login</Link></section></main>;
}
