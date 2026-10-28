self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (
    requestUrl.origin === self.location.origin &&
    (requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/"))
  ) {
    event.respondWith(fetch(event.request));
  }
});
