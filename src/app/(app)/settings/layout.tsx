import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "./tabs";

export const metadata = { title: "Settings" };

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs />
      {children}
    </>
  );
}
