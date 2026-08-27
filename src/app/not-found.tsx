import Link from "next/link";

export default function NotFound() {
  return (
    <main className="error-shell mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <p className="font-black tracking-widest text-red-700">404 · ARGUS</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950">
        This page does not exist.
      </h1>
      <p className="mt-3 text-slate-600">
        Check the emergency response brief link or return to the home page.
      </p>
      <Link
        href="/"
        className="mt-6 w-fit rounded-xl bg-slate-950 px-5 py-3 font-black text-white"
      >
        Return home
      </Link>
    </main>
  );
}
