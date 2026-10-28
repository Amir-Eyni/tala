export default function manifest() {
  return {
    name: "نرخ لحظه‌ای طلا، سکه و ارز",
    short_name: "نرخ طلا و ارز",
    description: "داشبورد زنده قیمت طلا، سکه و ارز",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    dir: "rtl",
    lang: "fa",
    background_color: "#0a1330",
    theme_color: "#0a1330",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}
