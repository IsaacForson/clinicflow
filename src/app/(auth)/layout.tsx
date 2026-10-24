import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2 text-lg font-semibold text-teal-800">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-teal-700 text-white">C</span> ClinicFlow
      </Link>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">{children}</div>
    </main>
  );
}
