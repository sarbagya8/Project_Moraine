import Link from "next/link";

export default function TrekkerSetupPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <Link href="/" className="brand">ARGUS</Link>
        <p className="eyebrow">Trekker setup</p>
        <h1>Pair your assigned device</h1>
        <ol className="setup-steps">
          <li>Ask the ARGUS authority administrator to register and assign your ESP32 device.</li>
          <li>Copy the pairing code when the administrator shows it. The code is displayed only once.</li>
          <li>Sign in with your public trekker ID and pairing code.</li>
        </ol>
        <p>The device API key is never required in the browser and must not be shared.</p>
        <Link className="primary-button" href="/trekker/login">Continue to sign in</Link>
      </section>
    </main>
  );
}
