/// <reference lib="webworker" />
// @ts-check

// Push notification service worker for the blurp PWA. Two responsibilities:
//   1. On "push" — iOS just woke us up with an encrypted payload. Show the
//      notification on the lock screen.
//   2. On "notificationclick" — the user tapped. Open the PWA at the URL
//      embedded in the payload.

self.addEventListener("install", () => {
  // Activate immediately so subsequent pushes don't wait for a reload.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "blurp", body: event.data.text(), url: "/" };
  }
  const title = payload.title || "blurp";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: payload.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) client.navigate(url);
            return;
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
