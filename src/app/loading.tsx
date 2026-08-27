export default function Loading() {
  return (
    <main className="loading-shell mx-auto w-full max-w-6xl space-y-5 px-6 py-10" aria-label="Loading page">
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="h-36 animate-pulse rounded-3xl bg-slate-100" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    </main>
  );
}
