import Link from "next/link";
import { GRACE_DAYS, TRIAL_DAYS } from "@/lib/plans";
import { DocPage } from "../pricing/site";

export const metadata = { title: "Terms of service", description: "The terms that apply when your clinic uses ClinicFlow." };

export default function TermsPage() {
  return (
    <DocPage title="Terms of service" updated="24 October 2026" intro={<p>These terms are an agreement between ClinicFlow and the clinic or practice (&quot;you&quot;) that signs up. Plain language first; please read them before using the service.</p>}>
      <section>
        <h2>1. The service</h2>
        <p>ClinicFlow is practice-management software: scheduling, queue, patient records, billing, messaging and reporting. You choose who in your clinic can use it and what each person can see.</p>
      </section>
      <section>
        <h2>2. Not medical advice</h2>
        <p>ClinicFlow does not provide medical advice, diagnosis or treatment recommendations, and is not a medical device. Clinical decisions are made by your licensed practitioners. Drafts produced by the optional AI scribe are suggestions of wording only; a clinician must review, correct and sign every note, and you are responsible for what is filed.</p>
      </section>
      <section>
        <h2>3. Your account and your staff</h2>
        <ul>
          <li>You are responsible for your users, their logins and the roles you give them. Turn on two-factor authentication for owner accounts.</li>
          <li>You confirm you are entitled to collect and process the patient information you enter, including any consent required for messages and recordings.</li>
          <li>Don&apos;t use the service to send unsolicited marketing, break the law, or attempt to access other clinics&apos; data.</li>
        </ul>
      </section>
      <section>
        <h2>4. Trial, payment and refunds</h2>
        <ul>
          <li>New accounts get a {TRIAL_DAYS}-day free trial. No card is needed to start.</li>
          <li>Plans are billed monthly or annually in advance through Paystack. Annual plans cost 10 months and cover 12.</li>
          <li>If you are not satisfied, ask within 30 days of your first payment for a full refund.</li>
          <li>Prices may change with at least 30 days&apos; notice; changes apply from your next billing period.</li>
        </ul>
      </section>
      <section>
        <h2>5. If payment stops: read-only, never locked</h2>
        <p>If a payment fails we will remind you. After a {GRACE_DAYS}-day grace period your account becomes read-only: you can still sign in, view every record and export all your data, but you cannot add new records until you renew. We never hold your data hostage.</p>
      </section>
      <section>
        <h2>6. Your data</h2>
        <p>You own your data. We act as your data processor and handle patient data only to provide the service, as described in our <Link href="/privacy">privacy policy</Link>. You can export everything at any time at no cost. After you close your account we keep your data for 90 days so you can change your mind or export it, then delete it from live systems; backups age out within a further 35 days.</p>
      </section>
      <section>
        <h2>7. Availability and offline use</h2>
        <p>We aim for high availability but the internet in your area may not be. Offline features keep recently viewed pages readable and store notes and payments on the device until they sync. Data stored on a device is only as safe as that device: use screen locks and sign out of shared computers.</p>
      </section>
      <section>
        <h2>8. Liability</h2>
        <p>The service is provided with reasonable skill and care. To the extent the law allows, our total liability for any claim is limited to the fees you paid in the 12 months before the claim, and we are not liable for indirect or consequential losses. Nothing in these terms limits liability that cannot be limited by law.</p>
      </section>
      <section>
        <h2>9. Ending the agreement</h2>
        <p>You can cancel any time from Settings; your plan runs to the end of the paid period. We may suspend accounts that break these terms or put other customers at risk, and will tell you why.</p>
      </section>
      <section>
        <h2>10. Governing law</h2>
        <p>These terms are governed by the laws of the country where your clinic is registered (Ghana, Nigeria or Kenya), unless we agree otherwise in writing.</p>
      </section>
    </DocPage>
  );
}
