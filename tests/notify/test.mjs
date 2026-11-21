import {
  shouldNotifyUser, recipientsForNotification, categoryEnabled, canReceiveKind,
  pushPayload, DEFAULT_NOTIFY_SETTINGS,
} from "../../supabase/functions/_shared/notify.mjs";
import {
  generateVapidKeys, importVapidKeys, signVapidJwt, encryptAes128Gcm, b64urlDecode,
  endpointOrigin, buildPushRequest,
} from "../../supabase/functions/_shared/webpush.mjs";
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); if (!c) console.log("   got", c); };

const ACTOR = "11111111-1111-4111-8111-111111111111";
const PREM = "22222222-2222-4222-8222-222222222222";
const FREE = "33333333-3333-4333-8333-333333333333";
const now = Date.parse("2026-11-21T12:00:00-06:00");
const premUntil = new Date(now + 864e5).toISOString();
const lapsedUntil = new Date(now - 864e5).toISOString();

const prem = { id: PREM, is_admin: false, premium_until: premUntil };
const free = { id: FREE, is_admin: false, premium_until: null };
const lapsed = { id: "44444444-4444-4444-8444-444444444444", is_admin: false, premium_until: lapsedUntil };
const admin = { id: "55555555-5555-4555-8555-555555555555", is_admin: true, premium_until: null };
const actor = { id: ACTOR, is_admin: false, premium_until: premUntil };
const on = { ...DEFAULT_NOTIFY_SETTINGS, push_enabled: true };
const offListings = { ...on, notify_listings: false };

const sled = { id: "n1", kind: "sled", actor_id: ACTOR, title: "New shared sled", body: "@a shared a sled", href: "#/sled/cx", actor_is_premium: true };
const article = { id: "n2", kind: "article", actor_id: null, title: "New exclusive article", body: "A piece", href: "#/exclusive/x" };
const photo = { id: "n3", kind: "photo", actor_id: ACTOR, title: "New community photo", href: "#/photopost/cx", actor_is_premium: true };
const listing = { id: "n4", kind: "listing", actor_id: ACTOR, title: "New sled for sale", href: "#/listing/cx", actor_is_premium: true };

ok(canReceiveKind(prem, "listing", now), "premium can receive sale notices");
ok(!canReceiveKind(free, "listing", now), "free cannot receive sale notices");
ok(!canReceiveKind(lapsed, "photo", now), "lapsed cannot receive photo notices");
ok(canReceiveKind(free, "article", now), "free can receive article notices");
ok(canReceiveKind(admin, "sled", now), "admin can receive shared-sled notices");

ok(shouldNotifyUser(sled, prem, on, now), "premium receives another member's shared sled");
ok(!shouldNotifyUser(sled, actor, on, now), "poster is not notified of their own sled");
ok(!shouldNotifyUser(sled, free, on, now), "free does not get a shared-sled notice");
ok(shouldNotifyUser(article, free, on, now), "free receives an article notice");
ok(!shouldNotifyUser(listing, prem, offListings, now), "category toggle off suppresses sale notices");
ok(!shouldNotifyUser(listing, prem, { ...on, push_enabled: false }, now), "push_enabled false suppresses a push");
ok(!shouldNotifyUser({ ...listing, actor_is_premium: false }, prem, on, now), "lapsed actor's sale notice is not pushed");
ok(shouldNotifyUser(photo, admin, on, now), "admin receives a community photo notice");

const recips = recipientsForNotification(listing, [
  { profile: prem, settings: on, now },
  { profile: free, settings: on, now },
  { profile: actor, settings: on, now },
  { profile: prem, settings: offListings, now },
]);
ok(recips.length === 1 && recips[0].profile.id === PREM, "recipient list is premium, opted-in, not the poster");

const payload = pushPayload(sled);
ok(payload.title === "New shared sled" && payload.href === "#/sled/cx" && payload.kind === "sled", "push payload carries title, href and kind");

ok(categoryEnabled(undefined, "sled") && categoryEnabled({}, "article"), "missing settings default to on");
ok(!categoryEnabled({ notify_photos: false }, "photo"), "explicit false is off");

ok(endpointOrigin("https://fcm.googleapis.com/fcm/send/abc") === "https://fcm.googleapis.com", "audience is the push service origin");

const keys = await generateVapidKeys();
ok(typeof keys.publicKey === "string" && typeof keys.privateKey === "string" && keys.publicKey.length > 40, "VAPID key generation returns a public/private pair");
const imported = await importVapidKeys(keys.publicKey, keys.privateKey);
const jwt = await signVapidJwt({ privateKey: imported.privateKey, subject: "mailto:rbsledmuseum@gmail.com", audience: "https://fcm.googleapis.com", now });
const [h, p, s] = jwt.split(".");
ok(h && p && s, "VAPID JWT has three parts");
const claims = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
ok(claims.aud === "https://fcm.googleapis.com" && claims.sub === "mailto:rbsledmuseum@gmail.com" && claims.exp > now / 1000, "VAPID JWT audience, subject and expiry");

const their = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const theirPub = Buffer.from(await crypto.subtle.exportKey("raw", their.publicKey)).toString("base64url");
const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
const body = await encryptAes128Gcm(JSON.stringify(payload), theirPub, auth);
ok(body.length > 16 + 4 + 1 + 65 + 16, "encrypted push body has a header, key and ciphertext");
ok(body[16 + 4] === 65, "aes128gcm idlen is 65 (uncompressed P-256 public key)");
const rs = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(16);
ok(rs === 4096, "aes128gcm record size is 4096");

const req = await buildPushRequest(
  { endpoint: "https://push.example.test/x", p256dh: theirPub, auth },
  payload,
  { ...imported, subject: "mailto:rbsledmuseum@gmail.com" },
);
ok(req.headers.Authorization.startsWith("vapid t=") && req.headers.Authorization.includes(", k="), "Authorization uses vapid t=, k=");
ok(req.headers["Content-Encoding"] === "aes128gcm" && req.headers.TTL === "86400", "Content-Encoding and TTL headers");

// Secrets must not be committed.
const root = path.resolve(new URL("../..", import.meta.url).pathname);
const files = [
  "config.js",
  "docs/migrations/2026-11-21-notifications.sql",
  "docs/supabase-schema.sql",
  "docs/go-live.md",
  "supabase/functions/dispatch-push/index.ts",
  "scripts/generate-vapid-keys.mjs",
].map((f) => fs.readFileSync(path.join(root, f), "utf8"));
ok(files.every((t) => !/VAPID_PRIVATE_KEY\s*[:=]\s*['\"][A-Za-z0-9_-]{20,}/.test(t)), "no VAPID private key value is committed");
ok(files.every((t) => !/BEGIN (EC |PRIVATE)|service_role['\"]\s*:\s*['\"]ey/.test(t)), "no private PEM or service_role value is committed");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
