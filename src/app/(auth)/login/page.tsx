import { LoginForms } from "./login-forms";

export const metadata = { title: "Sign in · ClinicFlow" };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-4 text-lg font-semibold">Sign in to your clinic</h1>
      <LoginForms />
    </>
  );
}
