"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import webpush from "web-push";

// Set up VAPID credentials once per cold start. The keys live as Convex
// env vars; the subject is a mailto Apple/Google can contact if our
// sending is causing problems.
function configureWebPush(): void {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    throw new Error(
      "Missing VAPID env vars on Convex (VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)",
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

// Push A admin trigger: send a test notification to every registered
// subscription. Removes any subscription the push service rejects with
// 404/410 — both signal a dead subscription per the Web Push spec.
export const sendTestPush = action({
  args: {
    title: v.optional(v.string()),
    body: v.optional(v.string()),
  },
  returns: v.object({
    sent: v.number(),
    removed: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx, args) => {
    configureWebPush();
    const subs = await ctx.runQuery(internal.push.listAll, {});
    const payload = JSON.stringify({
      title: args.title ?? "blurp",
      body: args.body ?? "Hello from blurp — test push.",
      url: "/",
    });

    let sent = 0;
    let removed = 0;
    let failed = 0;

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          },
          payload,
        );
        sent += 1;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await ctx.runMutation(internal.push.removeByEndpoint, {
            endpoint: sub.endpoint,
          });
          removed += 1;
        } else {
          console.error("Push send failed", { endpoint: sub.endpoint, err });
          failed += 1;
        }
      }
    }
    return { sent, removed, failed };
  },
});
