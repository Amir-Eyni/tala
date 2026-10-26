import { getSiteUrl } from "@/utils/siteUrl";

export default function sitemap() {
  const siteUrl = getSiteUrl();

  if (!siteUrl) {
    return [];
  }

  return [
    {
      url: new URL("/", siteUrl).toString(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
