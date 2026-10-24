import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { template: "%s · ClinicFlow", default: "ClinicFlow — Run your clinic without paper" },
  description: "Clinic software for private practices in Ghana, Nigeria and Kenya: queue and walk-ins, patient records, billing with mobile money and insurance, WhatsApp reminders. Works through unstable internet.",
  applicationName: "ClinicFlow",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "ClinicFlow", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#0f766e", colorScheme: "light" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
