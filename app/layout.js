import { Vazirmatn } from "next/font/google";
import "./globals.css";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata = {
  title: "طلا | نرخ لحظه‌ای طلا، دلار و تتر",
  description: "داشبورد نرخ لحظه‌ای طلای ۱۸ و ۲۴ عیار، دلار و تتر در بازار ایران",
};

// viewport-fit=cover is required for env(safe-area-inset-*) to be non-zero on iOS.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0A1330" },
    { media: "(prefers-color-scheme: light)", color: "#F5F1E4" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
