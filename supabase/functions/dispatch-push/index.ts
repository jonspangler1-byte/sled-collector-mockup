// Supabase Edge Function: send Web Push for a new notifications row.
// Called by a Database Webhook on public.notifications INSERT (see docs/go-live.md).
// JWT verification is off; the function checks PUSH_WEBHOOK_SECRET instead.
// VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT and PUSH_WEBHOOK_SECRET are
// Supabase secrets — never commit them. Stays on the Supabase free plan (no OneSignal, etc.).
import { cors, json, serviceDb, readBody } from "../_shared/http.ts";
import { pushPayload, shouldNotifyUser } from "../_shared/notify.mjs";
import { importVapidKeys, buildPushRequest } from "../_shared/webpush.mjs";

function webhookOk(req: Request): boolean {
  const want = Deno.env.get("PUSH_WEBHOOK_SECRET") || "";
  if (!want) return false;
  const got = req.headers.get("x-push-secret") || "";
  if (got && got === want) return true;
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return !!auth && auth === want;
}

function recordFromBody(body: Record<string, unknown>) {
  const rec = (body.record || body.notification || body) as Record<string, unknown>;
  if (!rec || typeof rec !== "object") return null;
  if (!rec.kind || !rec.title) return null;
  return rec;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!webhookOk(req)) return json({ error: "unauthorized" }, 401);

  const pub = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const priv = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:rbsledmuseum@gmail.com";
  if (!pub || !priv) return json({ error: "VAPID keys are not set" }, 503);

  const body = await readBody(req);
  const rec = recordFromBody(body);
  if (!rec) return json({ error: "missing notification record" }, 400);

  let vapid;
  try {
    vapid = await importVapidKeys(pub, priv);
    (vapid as { subject?: string }).subject = subject;
  } catch (e) {
    console.warn("vapid import failed", (e as Error).message);
    return json({ error: "VAPID keys are not valid" }, 500);
  }

  const db = serviceDb();
  const { data: subs, error } = await db
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth");
  if (error) return json({ error: error.message }, 500);
  if (!subs || !subs.length) return json({ sent: 0, gone: 0 });

  const uids = [...new Set(subs.map((s) => s.user_id).filter(Boolean))];
  const { data: profiles } = await db.from("profiles").select("id,is_admin,premium_until").in("id", uids);
  const { data: settingsRows } = await db.from("notification_settings").select("*").in("user_id", uids);
  const profBy = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  const setBy = Object.fromEntries((settingsRows || []).map((s) => [s.user_id, s]));

  let actorPremium: boolean | undefined;
  if (rec.actor_id) {
    const { data: actor } = await db.from("profiles").select("id,is_admin,premium_until").eq("id", rec.actor_id).maybeSingle();
    actorPremium = !!(actor && (actor.is_admin || (actor.premium_until && Date.parse(actor.premium_until) > Date.now())));
  }

  const notification = { ...rec, actor_is_premium: actorPremium };
  const payload = pushPayload(notification);
  const vapidOpts = { ...vapid, subject };

  let sent = 0, gone = 0, failed = 0;
  for (const sub of subs) {
    const profile = profBy[sub.user_id];
    if (!profile) continue;
    const settings = setBy[sub.user_id] || { push_enabled: true, notify_sleds: true, notify_articles: true, notify_photos: true, notify_listings: true };
    // A stored subscription is itself the opt-in; treat missing push_enabled as on.
    const st = { ...settings, push_enabled: settings.push_enabled !== false };
    if (!shouldNotifyUser(notification, profile, st)) continue;
    try {
      const reqInit = await buildPushRequest(sub, payload, vapidOpts);
      const res = await fetch(reqInit.url, { method: reqInit.method, headers: reqInit.headers, body: reqInit.body });
      if (res.status === 404 || res.status === 410) {
        await db.from("push_subscriptions").delete().eq("id", sub.id);
        gone++;
      } else if (!res.ok) {
        failed++;
        console.warn("web push failed", res.status, await res.text().catch(() => ""));
      } else {
        sent++;
      }
    } catch (e) {
      failed++;
      console.warn("web push error", (e as Error).message);
    }
  }
  return json({ sent, gone, failed });
});
