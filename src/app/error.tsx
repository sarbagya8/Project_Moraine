"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <p className="font-black tracking-widest text-red-700">ARGUS ERROR</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950">
        Something went wrong.
      </h1>
      <p className="mt-3 text-slate-600">
        The current page could not be completed. No emergency status should be inferred from this screen alone.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 w-fit rounded-xl bg-slate-950 px-5 py-3 font-black text-white"
      >
        Try again
      </button>
    </main>
  );
}
