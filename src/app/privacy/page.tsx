import Link from "next/link";
import { DocPage, Sec } from "../pricing/site";

export const metadata = { title: "Privacy policy", description: "How ClinicFlow handles clinic and patient data under Ghana's DPA 2012, Nigeria's NDPA 2023 and Kenya's DPA 2019." };

const SUBPROCESSORS: [string, string, string][] = [
  ["Cloud hosting provider", "Application servers, encrypted database and backups", "All clinic data (encrypted at rest)"],
  ["Meta Platforms (WhatsApp Business Platform)", "Delivering WhatsApp reminders and messages", "Patient phone number, message text"],
  ["SMS gateway provider", "SMS reminders and sign-in codes where WhatsApp is unavailable", "Phone number, message text"],
  ["Paystack", "Subscription billing and patient mobile money / card payments", "Payer name, phone or email, amount"],
  ["Anthropic", "AI scribe draft notes (only if the add-on is enabled)", "Consultation transcript; zero-retention / no-training settings applied"],
  ["Deepgram", "Speech-to-text for the AI scribe (only if enabled)", "Consultation audio; not used for model training"],
];

export default function PrivacyPage() {
  return (
    <DocPage title="Privacy policy" eyebrow="Legal" updated="24 October 2026" intro={<p>Health information is sensitive. This policy explains what ClinicFlow does with it, written to meet Ghana&apos;s Data Protection Act, 2012 (Act 843), Nigeria&apos;s Data Protection Act, 2023 and Kenya&apos;s Data Protection Act, 2019.</p>}>
      <Sec title="Who is responsible">
        <p><strong>Your clinic is the data controller</strong> for patient information. ClinicFlow is the <strong>data processor</strong>: we process patient data only on the clinic&apos;s instructions and to run the service. For the account details of clinic staff (names, emails, phone numbers, sign-in activity) and for visitors to this website, ClinicFlow is the controller.</p>
        <p>Patients who want to see, correct or delete their records should contact their clinic. We help clinics answer these requests.</p>
      </Sec>
      <Sec title="What we process">
        <ul>
          <li>Patient records entered by the clinic: demographics, contact details, insurance, consultation notes, diagnoses, prescriptions, results, documents, invoices and payments.</li>
          <li>Staff accounts: name, role, contact details, sign-in times and IP addresses, and an audit log of actions taken.</li>
          <li>Message logs: who was messaged, when, why, and whether consent was recorded.</li>
          <li>Website visitors: basic server logs. We don&apos;t use advertising trackers.</li>
        </ul>
      </Sec>
      <Sec title="How we use it">
        <ul>
          <li>To provide the service your clinic signed up for — and nothing else. We never sell data or use patient data for advertising.</li>
          <li>Patient messages are only sent for the purposes the clinic configures (reminders, results, follow-ups, billing), with consent recorded; an opt-out always wins.</li>
          <li>Aggregated, anonymised usage statistics (e.g. number of appointments per month) help us improve the product. They contain no patient-identifiable information.</li>
        </ul>
      </Sec>
      <Sec title="AI scribe">
        <p>The AI scribe is off unless the clinic enables it and the patient consents. Audio is transcribed and a draft note is produced for the clinician to review and sign. Our AI providers are contractually prohibited from using clinic data to train their models. Nothing is filed without a clinician&apos;s signature.</p>
      </Sec>
      <Sec title="Sub-processors">
        <p>We use these service providers to run ClinicFlow. Each is bound by a data processing agreement. We will give clinics 30 days&apos; notice before adding a new sub-processor.</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr><th>Provider</th><th>Purpose</th><th>Data involved</th></tr></thead>
            <tbody>{SUBPROCESSORS.map(([a, b, c]) => <tr key={a}><td className="font-medium text-fg">{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody>
          </table>
        </div>
      </Sec>
      <Sec title="International transfers">
        <p>Some providers process data outside Ghana, Nigeria or Kenya. Where they do, we rely on the safeguards each law requires — contractual clauses, adequacy or consent — and apply encryption in transit and at rest. Clinics with data-residency obligations can contact us about regional hosting.</p>
      </Sec>
      <Sec title="Security and retention">
        <p>See our <Link href="/security">security page</Link> for details. Clinic data is kept for as long as the clinic&apos;s account is active, then 90 days after closure to allow export, then deleted from live systems; encrypted backups expire within a further 35 days. Medical-record retention periods required by law are the clinic&apos;s decision and the clinic can export records to meet them.</p>
      </Sec>
      <Sec title="Breaches">
        <p>If we become aware of a breach affecting clinic data we will notify the affected clinic without undue delay (and within 72 hours) with what we know, so the clinic can meet its own duties to notify the Data Protection Commission (Ghana), the Nigeria Data Protection Commission or the Office of the Data Protection Commissioner (Kenya) and affected patients.</p>
      </Sec>
      <Sec title="Your rights">
        <p>Depending on your country you have rights to access, correct, delete, object to or restrict processing, and to data portability, and you may complain to your national data protection authority. Clinic staff and website visitors can contact us directly; patients should contact their clinic first.</p>
      </Sec>
      <Sec title="No medical advice">
        <p>ClinicFlow is a records and administration tool. It does not give medical advice or make clinical decisions.</p>
      </Sec>
    </DocPage>
  );
}
