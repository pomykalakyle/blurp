// Frontend helpers for Web Push: feature detection, permission, and
// running the subscribe flow against the PWA's service worker.

export type PushSupport =
  | { supported: false; reason: string }
  | { supported: true; reason?: undefined };

export function getPushSupport(): PushSupport {
  if (typeof window === "undefined") {
    return { supported: false, reason: "Not in a browser." };
  }
  if (!("serviceWorker" in navigator)) {
    return { supported: false, reason: "Service workers aren't available." };
  }
  if (!("PushManager" in window)) {
    return {
      supported: false,
      reason: "Web Push isn't supported in this browser.",
    };
  }
  if (!("Notification" in window)) {
    return { supported: false, reason: "Notifications aren't available." };
  }
  return { supported: true };
}

export function getPermissionState():
  | NotificationPermission
  | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

// VAPID public keys are base64url-encoded. The browser's pushManager
// wants a Uint8Array of the raw bytes.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

export type RegisterPushFn = (args: {
  endpoint: string;
  p256dh: string;
  auth: string;
}) => Promise<null>;

// Asks for permission (if not already granted), subscribes via the SW's
// pushManager, and registers the subscription with Convex. Returns the
// resulting PushSubscription on success; throws with a readable message
// on any failure mode.
export async function subscribeToPush(
  register: RegisterPushFn,
  vapidPublicKey: string,
): Promise<PushSubscription> {
  const support = getPushSupport();
  if (!support.supported) throw new Error(support.reason);

  const reg = await navigator.serviceWorker.ready;

  // Reuse a live subscription if there is one — re-registering with
  // Convex bumps lastSeenAt and handles key rotation.
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await sendToConvex(register, existing);
    return existing;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission denied.");
  }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });
  await sendToConvex(register, sub);
  return sub;
}

async function sendToConvex(
  register: RegisterPushFn,
  sub: PushSubscription,
): Promise<void> {
  const json = sub.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Subscription is missing endpoint or keys.");
  }
  await register({ endpoint, p256dh, auth });
}
