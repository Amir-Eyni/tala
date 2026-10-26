const LOCAL_SITE_URL = "http://localhost:3000";

export function getSiteUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    (process.env.NODE_ENV === "production" ? null : LOCAL_SITE_URL);

  if (!configuredUrl) {
    return null;
  }

  let siteUrl;
  try {
    siteUrl = new URL(configuredUrl);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be a valid absolute URL for this deployment.",
    );
  }

  if (
    !["http:", "https:"].includes(siteUrl.protocol) ||
    siteUrl.username ||
    siteUrl.password
  ) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must use HTTP(S) and must not include credentials.",
    );
  }

  return new URL(siteUrl.origin);
}
