import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { template: "%s · ClinicFlow", default: "ClinicFlow — Run your clinic without paper" },
  description: "Clinic software for private practices in Ghana, Nigeria and Kenya: queue and walk-ins, patient records, billing with mobile money and insurance, WhatsApp reminders. Works through unstable internet.",
  applicationName: "ClinicFlow",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "ClinicFlow", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#06070c" }, { media: "(prefers-color-scheme: light)", color: "#f4f5fb" }],
};

// Applies the saved theme before first paint (no flash). Values: "dark" | "light" | "system" (default: dark).
const THEME_SCRIPT = `try{var t=localStorage.getItem("cf-theme")||"dark";if(t==="system")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t;document.documentElement.dataset.rail=localStorage.getItem("cf-rail")==="1"?"collapsed":"open"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
