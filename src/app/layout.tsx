import type { Metadata } from "next";
import OfflineServiceWorker from "@/components/OfflineServiceWorker";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elite Skin CRM — نظام إدارة الزيارات",
  description: "نظام CRM طبي لإدارة زيارات المناديب والأطباء — Elite Skin",
};

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
