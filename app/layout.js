import { Vazirmatn } from "next/font/google";
import Providers from "./providers";
import "./globals.css";
import { getSiteUrl } from "@/utils/siteUrl";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata = {
  metadataBase: getSiteUrl() ?? undefined,
  title: "نرخ لحظه‌ای طلا و ارز | داشبورد زنده",
  description:
    "قیمت لحظه‌ای طلای ۱۸ و ۲۴ عیار و ارزها را در یک داشبورد زنده و به‌روز دنبال کنید.",
  openGraph: {
    title: "نرخ لحظه‌ای طلا و ارز | داشبورد زنده",
    description:
      "قیمت لحظه‌ای طلای ۱۸ و ۲۴ عیار و ارزها را در یک داشبورد زنده و به‌روز دنبال کنید.",
    siteName: "طلا | داشبورد زنده",
    locale: "fa_IR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "نرخ لحظه‌ای طلا و ارز | داشبورد زنده",
    description:
      "قیمت لحظه‌ای طلای ۱۸ و ۲۴ عیار و ارزها را در یک داشبورد زنده و به‌روز دنبال کنید.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "نرخ طلا و ارز",
  },
  icons: {
    apple: [
      {
        url: "/icon-192.png",
        type: "image/png",
      },
    ],
  },
};

// viewport-fit=cover is required for env(safe-area-inset-*) to be non-zero on iOS.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a1330" },
    { media: "(prefers-color-scheme: light)", color: "#F5F1E4" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className={`${vazirmatn.variable} min-h-dvh`}>
        <ServiceWorkerRegistration />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
