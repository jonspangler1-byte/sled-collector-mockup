// Minimal Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) using Web Crypto only.
// Works in Node and in Supabase Edge Functions (Deno). Never log or commit the private key.

const te = new TextEncoder();

export function b64urlEncode(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  const b64 = (typeof btoa === "function")
    ? btoa(s)
    : Buffer.from(u8).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function b64urlDecode(str) {
  const s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = (typeof atob === "function")
    ? atob(s + pad)
    : Buffer.from(s + pad, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function concat(...parts) {
  const list = parts.map((p) => (typeof p === "string" ? te.encode(p) : (p instanceof Uint8Array ? p : new Uint8Array(p))));
  const out = new Uint8Array(list.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of list) { out.set(p, o); o += p.length; }
  return out;
}

async function hmacSha256(keyBytes, data) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}

async function hkdfExtract(salt, ikm) {
  const s = salt && salt.length ? salt : new Uint8Array(32);
  return hmacSha256(s, ikm);
}

async function hkdfExpand(prk, info, len) {
  const t = await hmacSha256(prk, concat(info, new Uint8Array([1])));
  return t.slice(0, len);
}

// Accepts a web-push URL-safe public key (uncompressed P-256 point) and a raw
// 32-byte private scalar (the "d" value, also as base64url).
export async function importVapidKeys(publicKey, privateKey) {
  const pub = b64urlDecode(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID public key must be an uncompressed P-256 point");
  const rawPriv = b64urlDecode(privateKey);
  if (rawPriv.length !== 32) throw new Error("VAPID private key must be a 32-byte P-256 scalar");
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
    d: b64urlEncode(rawPriv),
    ext: true,
  };
  const privCrypto = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return { publicKey: pub, publicKeyB64: b64urlEncode(pub), privateKey: privCrypto };
}

export async function signVapidJwt({ privateKey, subject, audience, expiresInSec = 12 * 3600, now = Date.now() }) {
  const header = b64urlEncode(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64urlEncode(te.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(now / 1000) + expiresInSec,
    sub: subject,
  })));
  const data = te.encode(header + "." + payload);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, data));
  return header + "." + payload + "." + b64urlEncode(p1363ToJose(sig));
}

// Web Crypto ECDSA signatures are IEEE P1363 (r||s). JWT wants that same form (already r||s for P-256 = 64 bytes).
function p1363ToJose(sig) {
  if (sig.length === 64) return sig;
  // DER fallback (some runtimes)
  return derEcdsaToJose(sig);
}

function derEcdsaToJose(der) {
  // Minimal DER INTEGER pair parser.
  let i = 0;
  if (der[i++] !== 0x30) throw new Error("bad DER signature");
  i++; // length
  if (der[i++] !== 0x02) throw new Error("bad DER signature");
  let rLen = der[i++];
  let r = der.slice(i, i + rLen); i += rLen;
  if (der[i++] !== 0x02) throw new Error("bad DER signature");
  let sLen = der[i++];
  let s = der.slice(i, i + sLen);
  if (r[0] === 0 && r.length > 32) r = r.slice(1);
  if (s[0] === 0 && s.length > 32) s = s.slice(1);
  const out = new Uint8Array(64);
  out.set(r, 32 - r.length);
  out.set(s, 64 - s.length);
  return out;
}

export async function encryptAes128Gcm(payload, p256dh, authSecret, localKeyPair) {
  const clientPub = p256dh instanceof Uint8Array ? p256dh : b64urlDecode(p256dh);
  const auth = authSecret instanceof Uint8Array ? authSecret : b64urlDecode(authSecret);
  const pair = localKeyPair || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const localPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const theirKey = await crypto.subtle.importKey("raw", clientPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: theirKey }, pair.privateKey, 256));
  const prk1 = await hkdfExtract(auth, ecdh);
  const ikm = await hkdfExpand(prk1, concat("WebPush: info\0", clientPub, localPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdfExtract(salt, ikm);
  const cek = await hkdfExpand(prk, "Content-Encoding: aes128gcm\0", 16);
  const nonce = await hkdfExpand(prk, "Content-Encoding: nonce\0", 12);
  const plain = typeof payload === "string" ? te.encode(payload) : payload;
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(plain, Uint8Array.of(2))));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, Uint8Array.of(localPub.length), localPub, cipher);
}

export function endpointOrigin(endpoint) {
  const u = new URL(endpoint);
  return u.origin;
}

export async function buildPushRequest(subscription, payload, vapid, { ttl = 86400, urgency = "normal" } = {}) {
  const body = await encryptAes128Gcm(
    typeof payload === "string" ? payload : JSON.stringify(payload),
    subscription.p256dh || (subscription.keys && subscription.keys.p256dh),
    subscription.auth || (subscription.keys && subscription.keys.auth),
  );
  const aud = endpointOrigin(subscription.endpoint);
  const jwt = await signVapidJwt({
    privateKey: vapid.privateKey,
    subject: vapid.subject,
    audience: aud,
  });
  return {
    url: subscription.endpoint,
    method: "POST",
    headers: {
      Authorization: "vapid t=" + jwt + ", k=" + vapid.publicKeyB64,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: urgency,
    },
    body,
  };
}

export async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: b64urlEncode(pub), privateKey: jwk.d };
}
