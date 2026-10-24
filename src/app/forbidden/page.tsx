import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="grid min-h-screen place-items-center p-8 text-center">
      <div>
        <h1 className="text-xl font-semibold">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-slate-600">Ask your clinic owner to change your role if you need it.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-teal-700">Back to dashboard</Link>
      </div>
    </main>
  );
}
