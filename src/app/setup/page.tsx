import Link from "next/link";
import { SetupConsole } from "@/components/setup-console";

const steps = [
  {
    title: "Apply the database migration",
    body: "Run migrations 001 through 008 in numeric order. Existing projects should apply only migrations that are still missing.",
  },
  {
    title: "Set server environment variables",
    body: "Add Supabase, API keys, the public app URL, and Meta WhatsApp credentials in .env.local and the deployment dashboard.",
  },
  {
    title: "Test in simulation mode",
    body: "Keep DEMO_MODE=true while checking dashboards, GPS, SOS deduplication, Rescue Passports, and ESP32 API authentication.",
  },
  {
    title: "Verify WhatsApp safely",
    body: "Use the fixed-recipient hello_world smoke test, then configure the approved ARGUS SOS template before disabling demo mode.",
  },
];

export default function SetupPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <nav className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="font-black tracking-[0.16em] text-teal-800">
            ARGUS
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/trekker/login"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold"
            >
              Trekker
            </Link>
            <Link
              href="/authority/login"
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white"
            >
              Rescue operations
            </Link>
          </div>
        </nav>

        <header className="mt-8 overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl sm:p-9">
          <p className="text-xs font-black tracking-[0.18em] text-teal-300">
            SETUP AND CONNECTION
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl">
            Connect, verify, and field-test ARGUS safely.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            This page checks server readiness and provides a fixed-recipient WhatsApp smoke test. It never displays stored secrets or claims delivery before a verified webhook.
          </p>
        </header>

        <section className="my-6 grid gap-3 md:grid-cols-2">
          {steps.map((step, index) => (
            <article
              key={step.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 font-black text-teal-900">
                  {index + 1}
                </span>
                <div>
                  <h2 className="font-black text-slate-950">{step.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{step.body}</p>
                </div>
              </div>
            </article>
          ))}
        </section>

        <SetupConsole />

        <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          ARGUS is an emergency-support prototype. Keep a charged phone, local emergency contacts, and a manual communication method available during every field test.
        </p>
      </div>
    </main>
  );
}
