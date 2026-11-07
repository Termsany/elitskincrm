import type { MetadataRoute } from "next";

/** Installable app for reps (Android "Install app", iPhone/iPad "Add to Home Screen"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "eliteSkin CRM", short_name: "eliteSkin", description: "منصّة إدارة المبيعات والعلاقات الطبية — eliteSkin",
    start_url: "/", scope: "/", display: "standalone", orientation: "any", dir: "rtl", lang: "ar",
    background_color: "#f4f9f9", theme_color: "#10484f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "تسجيل زيارة", url: "/visits/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "الأطباء", url: "/doctors", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
