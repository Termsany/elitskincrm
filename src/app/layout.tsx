import type { Metadata, Viewport } from "next";
import OfflineServiceWorker from "@/components/OfflineServiceWorker";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "eliteSkin — منصّة إدارة المبيعات والعلاقات الطبية",
  description: "eliteSkin CRM: إدارة الزيارات الميدانية والعلاقات مع الأطباء والعيادات والمبيعات",
  applicationName: "eliteSkin",
  manifest: "/manifest.webmanifest",
  // "Add to Home Screen" on iPhone / iPad opens it full-screen like an app
  appleWebApp: { capable: true, title: "eliteSkin", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icons/favicon-32.png", sizes: "32x32" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#10484f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: "'IBM Plex Sans Arabic', system-ui, -apple-system, sans-serif" }} className="min-h-screen antialiased"><OfflineServiceWorker />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
