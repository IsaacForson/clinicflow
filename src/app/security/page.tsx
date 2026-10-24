import { DatabaseBackup, FileLock2, KeyRound, ListChecks, Lock, ShieldCheck, Smartphone } from "lucide-react";
import Link from "next/link";
import { DocPage } from "../pricing/site";

export const metadata = { title: "Security", description: "How ClinicFlow protects patient data: encryption, tenant isolation, audit logs, tested backups and two-factor sign-in." };

const ITEMS = [
  { icon: Lock, title: "Encryption in transit and at rest", body: "All traffic uses TLS. Databases, files and backups are encrypted at rest. The most sensitive fields — consultation notes, national IDs, lab result text, transcripts and integration secrets — are additionally encrypted at the application layer (AES-256-GCM) before they reach the database." },
  { icon: ShieldCheck, title: "Tenant isolation with row-level security", body: "Every clinic's rows are tagged with its tenant ID and the database itself enforces PostgreSQL row-level security on every query. Even an application bug cannot read another clinic's records through the normal data path." },
  { icon: ListChecks, title: "Audit log", body: "Viewing a patient record, changing a note, issuing an invoice, recording a payment, exporting data — each is written to an append-only audit log with who, what, when and from where. Owners can review it at any time." },
  { icon: DatabaseBackup, title: "Backups with tested restores", body: "Automated daily backups with point-in-time recovery, kept in a separate location. We regularly restore backups into an isolated environment to prove they work. Backups are included in every plan." },
  { icon: KeyRound, title: "Two-factor authentication", body: "Staff can protect their accounts with authenticator-app codes; owners are prompted to turn it on. Sessions expire after inactivity, which matters on shared front-desk computers." },
  { icon: FileLock2, title: "Least-privilege roles", body: "Front desk, cashier, nurse, doctor, pharmacist and lab roles each see only what they need. Clinical notes are visible to clinical roles only, and signed notes are locked — changes are made as addenda." },
  { icon: Smartphone, title: "Offline data on devices", body: "For offline use, recently viewed pages and unsynced notes or payments are kept on the device. Signing out of a shared device clears cached pages. Use a screen lock on phones and tablets." },
];

export default function SecurityPage() {
  return (
    <DocPage title="Security at ClinicFlow" updated="24 October 2026" intro={<p>Clinics trust us with their patients&apos; most sensitive information. Here is how we protect it. Found a vulnerability? Tell us through the support link in the app and we will respond quickly.</p>}>
      <div className="grid gap-6 sm:grid-cols-2">
        {ITEMS.map((i) => (
          <section key={i.title} className="rounded-xl p-5 ring-1 ring-slate-200">
            <i.icon className="h-6 w-6 text-teal-700" aria-hidden />
            <h2 className="mt-3 !text-base">{i.title}</h2>
            <p className="text-sm">{i.body}</p>
          </section>
        ))}
      </div>
      <section>
        <h2>Your data stays yours</h2>
        <p>Full exports are available to account owners at any time, including on read-only accounts. See our <Link href="/privacy">privacy policy</Link> for sub-processors and retention.</p>
      </section>
    </DocPage>
  );
}
