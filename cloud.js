// Sled Finder cloud layer: real accounts (Supabase Auth, email code / magic link), cloud sync of sleds,
// sale ads and photos (Supabase Postgres + Storage), with an offline outbox.
//
// Design: localStorage on the phone stays the working copy, so the app keeps working with no signal.
// Every local save also queues an "outbox" entry; the outbox is pushed when signed in and online.
// Pulls bring the member's own sleds/ads (from any device), other members' SHARED sleds (Premium only,
// enforced by row-level security on the server) and public sale ads.
//
// With no SUPABASE_URL / SUPABASE_ANON_KEY in config.js, this file does nothing and the app runs as the demo.
(function () {
  "use strict";
  const C = window.SF_CONFIG || {};
  const enabled = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);
  const K = k => "svc_" + k;
  const get = (k, d) => { try { const v = JSON.parse(localStorage.getItem(K(k))); return v == null ? d : v } catch (e) { return d } };
  const set = (k, v) => { try { localStorage.setItem(K(k), JSON.stringify(v)); return true } catch (e) { console.warn("cloud: local save failed", k, e); return false } };
  const COUNTRIES = ["US", "CA", "GB", "IE"];
  const listeners = [];
  const Cloud = {
    enabled, ready: false, client: null, user: null, profile: get("cloudProfile", null),
    syncing: false, lastError: "", lastSync: get("lastSync", 0),
  };
  window.SFCloud = Cloud;
  // In live mode the made-up sample collectors and sample sale ads are hidden unless config says otherwise.
  if (enabled && !C.SHOW_SAMPLE_DATA) { window.SAMPLE_SLEDS = []; window.SALE_LISTINGS = []; }

  const emit = () => listeners.forEach(fn => { try { fn() } catch (e) { console.error(e) } });
  Cloud.onChange = fn => listeners.push(fn);

  // ───────── roles ─────────
  // free = never paid · premium = paid and current · lapsed = paid before, now expired · admin = Sled Finder.
  // The server decides (profiles.premium_until / is_admin); the app only reads it. Admins may "view as"
  // another role locally to check screens; the server still treats them as admin.
  Cloud.realRole = () => {
    const p = Cloud.user && Cloud.profile;
    if (!p) return "free";
    if (p.is_admin) return "admin";
    if (p.premium_until && Date.parse(p.premium_until) > Date.now()) return "premium";
    return p.premium_until ? "lapsed" : "free";
  };
  Cloud.role = () => {
    const r = Cloud.realRole();
    const v = get("adminViewAs", "");
    return r === "admin" && v && v !== "admin" ? v : r;
  };
  Cloud.setViewAs = r => set("adminViewAs", r);
  Cloud.handle = () => (Cloud.profile && Cloud.profile.handle) || "";
  Cloud.email = () => (Cloud.user && Cloud.user.email) || "";

  // ───────── outbox ─────────
  const outbox = () => get("outbox", []);
  Cloud.pending = () => outbox().length;
  // kind: "sled" | "listing"; op: "upsert" | "delete"; id: local id ("u…"/"ul…") or "c<uuid>" for others' posts (admin).
  Cloud.queue = (kind, id, op) => {
    if (!enabled) return;
    const q = outbox().filter(x => !(x.kind === kind && x.id === id));
    q.push({ kind, id: String(id), op: op || "upsert", t: Date.now() });
    set("outbox", q);
    Cloud.flush();
  };

  // ───────── local stores ─────────
  const localKey = kind => (kind === "sled" ? "sleds" : "listings");
  const findLocal = (kind, id) => get(localKey(kind), []).find(x => String(x.id) === String(id));
  const cacheKey = kind => (kind === "sled" ? "cloudShared" : "cloudListings");
  Cloud.sharedSleds = () => (enabled ? get("cloudShared", []) : []);
  Cloud.publicListings = () => (enabled ? get("cloudListings", []) : []);
  Cloud.isCloudId = id => /^c[0-9a-f-]{36}$/.test(String(id));

  // ───────── photos ─────────
  const resolvePhoto = u => (window.SFApp && window.SFApp.phURL ? window.SFApp.phURL(u) : u);
  async function sha(s) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(b)].slice(0, 12).map(x => x.toString(16).padStart(2, "0")).join("");
  }
  async function uploadPhotos(kind, clientId, imgs) {
    const map = get("photoMap", {}), out = [];
    for (const raw of imgs || []) {
      const u = resolvePhoto(raw);
      if (!u) continue;
      if (!/^data:image\//.test(u)) { out.push(u); continue; }  // already a URL (cloud photo or bundled demo image)
      const h = await sha(u);
      if (map[h]) { out.push(map[h]); continue; }
      const blob = await (await fetch(u)).blob();
      const path = `${Cloud.user.id}/${kind}-${clientId}/${h}.jpg`;
      const { error } = await Cloud.client.storage.from("photos").upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg", cacheControl: "31536000" });
      if (error) throw error;
      const url = Cloud.client.storage.from("photos").getPublicUrl(path).data.publicUrl;
      map[h] = url; set("photoMap", map); out.push(url);
    }
    return out;
  }

  // ───────── row mapping ─────────
  const LOCAL_ONLY = ["id", "user", "mine", "userAdded", "likes", "imgs", "img", "cloudOwner", "cloudId", "updatedAt", "editedBy"];
  const strip = o => { const d = {}; Object.keys(o).forEach(k => { if (!LOCAL_ONLY.includes(k) && o[k] !== undefined) d[k] = o[k] }); return d };
  const cc = c => (COUNTRIES.includes(c) ? c : "US");
  const num = v => (v == null || v === "" || isNaN(+v) ? null : +v);
  function sledRow(s, photos) {
    return { client_id: String(s.id), maker: +s.maker || 0, brand: +s.maker === 2 ? (s.brand || "") : "", model: String(s.model || ""),
      country: cc(s.country), region: s.locType === "na" ? "" : String(s.region || ""), town: s.locType === "na" ? "" : String(s.town || ""),
      lat: num(s.lat), lng: num(s.lng), shared: !!s.shared, photos, data: strip(s), edited_by: s.editedBy || null };
  }
  function listingRow(l, photos) {
    return { client_id: String(l.id), title: String(l.title || "Sled for sale").slice(0, 140), maker: +l.maker || 0, brand: +l.maker === 2 ? (l.brand || "") : "",
      model: String(l.model || ""), price: String(l.price || ""), country: cc(l.country), town: String(l.town || ""),
      contact_email: String(l.email || ""), photos, data: strip(l), edited_by: l.editedBy || null };
  }
  function fromRow(kind, r, mine) {
    const o = Object.assign({}, r.data || {}, {
      id: mine ? r.client_id : "c" + r.id, cloudId: r.id, user: mine ? "you" : (r.owner_handle || "member"),
      mine, maker: r.maker, brand: r.brand, model: r.model, country: r.country, town: r.town,
      imgs: r.photos || [], img: (r.photos || [])[0] || "", editedBy: r.edited_by || undefined, updatedAt: Date.parse(r.updated_at) || 0,
    });
    if (mine) o.cloudOwner = r.owner;
    if (kind === "sled") Object.assign(o, { userAdded: mine, likes: o.likes || 0, region: r.region, lat: r.lat, lng: r.lng, shared: r.shared });
    else Object.assign(o, { title: r.title, price: r.price, email: r.contact_email });
    return o;
  }

  // ───────── push ─────────
  async function pushOne(item) {
    const table = item.kind === "sled" ? "sleds" : "listings";
    const db = Cloud.client;
    if (Cloud.isCloudId(item.id)) {               // admin correcting someone else's post
      const uuid = item.id.slice(1);
      if (item.op === "delete") { const { error } = await db.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", uuid); if (error) throw error; return; }
      const cur = get(cacheKey(item.kind), []).find(x => x.id === item.id);
      if (!cur) return;
      const photos = cur.imgs.map(resolvePhoto).filter(u => !/^data:/.test(u));
      const row = item.kind === "sled" ? sledRow(cur, photos) : listingRow(cur, photos);
      delete row.client_id;
      const { error } = await db.from(table).update(row).eq("id", uuid); if (error) throw error; return;
    }
    if (item.op === "delete") {
      const { error } = await db.from(table).update({ deleted_at: new Date().toISOString() }).eq("owner", Cloud.user.id).eq("client_id", item.id);
      if (error) throw error; return;
    }
    const local = findLocal(item.kind, item.id);
    if (!local) return;                            // deleted locally before it was ever pushed
    if (local.cloudOwner && local.cloudOwner !== Cloud.user.id) return; // belongs to another account on this phone
    const photos = await uploadPhotos(item.kind, item.id, local.imgs && local.imgs.length ? local.imgs : (local.img ? [local.img] : []));
    const row = item.kind === "sled" ? sledRow(local, photos) : listingRow(local, photos);
    row.owner = Cloud.user.id; row.deleted_at = null;
    const { error } = await db.from(table).upsert(row, { onConflict: "owner,client_id" });
    if (error) throw error;
    // Claim it locally so it isn't offered for migration again.
    const arr = get(localKey(item.kind), []); const x = arr.find(y => String(y.id) === item.id);
    if (x && !x.cloudOwner) { x.cloudOwner = Cloud.user.id; set(localKey(item.kind), arr); }
  }
  Cloud._pushOne = pushOne;   // exposed for tests
  let flushing = null;
  Cloud.flush = () => {
    if (!enabled || !Cloud.user || !navigator.onLine) return Promise.resolve();
    if (flushing) return flushing;
    flushing = (async () => {
      Cloud.syncing = true; emit();
      let q = outbox();
      for (const item of q.slice()) {
        try {
          await pushOne(item);
          q = outbox().filter(x => !(x.kind === item.kind && x.id === item.id && x.t === item.t));
          set("outbox", q); Cloud.lastError = "";
        } catch (e) {
          console.warn("cloud push failed", item, e);
          const msg = String(e && (e.message || e.error_description) || e);
          Cloud.lastError = /row-level security|permission denied|42501|403/i.test(msg)
            ? (Cloud.realRole() === "premium" || Cloud.realRole() === "admin" ? "The server refused a change: " + msg : "Saved on this phone. It uploads once your membership is active.")
            : msg;
          break;                                   // keep order; retry later
        }
      }
      Cloud.syncing = false;
    })().finally(() => { flushing = null; emit(); });   // cleared after assignment, even when nothing was queued
    return flushing;
  };

  // ───────── pull ─────────
  function mergeMine(kind, rows) {
    const key = localKey(kind), arr = get(key, []), pending = new Set(outbox().filter(x => x.kind === kind).map(x => x.id));
    for (const r of rows) {
      const i = arr.findIndex(x => String(x.id) === r.client_id && (!x.cloudOwner || x.cloudOwner === r.owner));
      if (pending.has(r.client_id)) continue;     // a newer local change is waiting to upload
      if (r.deleted_at) { if (i >= 0) arr.splice(i, 1); continue; }
      const incoming = fromRow(kind, r, true);
      if (i < 0) arr.unshift(incoming);
      else if ((arr[i].updatedAt || 0) <= incoming.updatedAt) {
        // keep this phone's own photo refs (work offline) when the photo count matches
        const keepPics = (arr[i].imgs || []).length === incoming.imgs.length && (arr[i].imgs || []).some(u => String(u).startsWith("idb:"));
        arr[i] = Object.assign(incoming, keepPics ? { imgs: arr[i].imgs, img: arr[i].imgs[0] } : {});
      }
    }
    set(key, arr);
  }
  Cloud.pull = async () => {
    if (!enabled || !Cloud.client || !navigator.onLine) return;
    const db = Cloud.client, uid = Cloud.user && Cloud.user.id;
    try {
      if (uid) {
        const [ms, ml] = await Promise.all([
          db.from("sleds").select("*").eq("owner", uid).order("updated_at", { ascending: false }).limit(2000),
          db.from("listings").select("*").eq("owner", uid).order("updated_at", { ascending: false }).limit(500),
        ]);
        if (ms.error) throw ms.error; if (ml.error) throw ml.error;
        mergeMine("sled", ms.data); mergeMine("listing", ml.data);
        // Others' shared sleds: the server only returns rows if this member is Premium (or admin).
        const sh = await db.from("sleds").select("*").neq("owner", uid).eq("shared", true).is("deleted_at", null).order("updated_at", { ascending: false }).limit(1000);
        if (sh.error) throw sh.error;
        set("cloudShared", sh.data.map(r => fromRow("sled", r, false)));
      } else set("cloudShared", []);
      let lq = db.from("listings").select("*").eq("status", "active").is("deleted_at", null).order("created_at", { ascending: false }).limit(500);
      if (uid) lq = lq.neq("owner", uid);
      const pl = await lq; if (pl.error) throw pl.error;
      set("cloudListings", pl.data.map(r => fromRow("listing", r, false)));
      Cloud.lastSync = Date.now(); set("lastSync", Cloud.lastSync);
      if (!outbox().length) Cloud.lastError = "";   // keep an upload problem visible until it's resolved
    } catch (e) { console.warn("cloud pull failed", e); Cloud.lastError = String(e.message || e); }
    emit();
  };
  Cloud.syncNow = async () => { await Cloud.flush(); await Cloud.pull(); };

  // ───────── admin edits of other members' posts ─────────
  Cloud.adminSave = (kind, item) => {
    const key = cacheKey(kind), arr = get(key, []), i = arr.findIndex(x => x.id === item.id);
    if (i >= 0) { arr[i] = Object.assign({}, arr[i], item); set(key, arr); }
    Cloud.queue(kind, item.id, "upsert");
  };
  Cloud.adminDelete = (kind, id) => {
    set(cacheKey(kind), get(cacheKey(kind), []).filter(x => x.id !== id));
    Cloud.queue(kind, id, "delete");
  };

  // ───────── migration of sleds saved on this phone before accounts existed ─────────
  const unclaimed = kind => get(localKey(kind), []).filter(x => !x.cloudOwner && (kind === "sled" ? String(x.id).startsWith("u") : String(x.id).startsWith("ul")));
  Cloud.unclaimedCount = () => (Cloud.user ? unclaimed("sled").length + unclaimed("listing").length : 0);
  Cloud.claimLocal = () => {
    const q = outbox();
    ["sled", "listing"].forEach(kind => unclaimed(kind).forEach(x => { if (!q.some(y => y.kind === kind && y.id === String(x.id))) q.push({ kind, id: String(x.id), op: "upsert", t: Date.now() }) }));
    set("outbox", q); set("migrationAsked", true);
    return Cloud.flush().then(Cloud.pull);
  };
  Cloud.skipMigration = () => { set("migrationAsked", true); emit(); };
  Cloud.migrationAsked = () => !!get("migrationAsked", false);

  // When a different account signs in on this phone, drop the previous account's synced copies (they stay in
  // that account's cloud). Anything not yet uploaded is kept and left alone.
  function forgetOtherAccounts(uid) {
    const pend = new Set(outbox().map(x => x.kind + ":" + x.id));
    ["sled", "listing"].forEach(kind => {
      const arr = get(localKey(kind), []);
      const keep = arr.filter(x => !x.cloudOwner || x.cloudOwner === uid || pend.has(kind + ":" + x.id));
      if (keep.length !== arr.length) set(localKey(kind), keep);
    });
  }

  // ───────── auth ─────────
  const redirectTo = () => C.SITE_URL || (location.origin + location.pathname);
  Cloud.sendCode = async email => {
    const { error } = await Cloud.client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo(), shouldCreateUser: true } });
    if (error) throw error;
    set("pendingEmail", email);
  };
  Cloud.pendingEmail = () => get("pendingEmail", "");
  Cloud.verifyCode = async (email, code) => {
    const { error } = await Cloud.client.auth.verifyOtp({ email, token: String(code).trim(), type: "email" });
    if (error) throw error;
    set("pendingEmail", "");
  };
  Cloud.signOut = async () => {
    await Cloud.flush();
    if (Cloud.pending()) throw new Error(Cloud.pending() + " change(s) haven't uploaded yet. Connect to the internet and try again.");
    const uid = Cloud.user && Cloud.user.id;
    await Cloud.client.auth.signOut();
    // Remove this account's synced copies from the phone; they come back on next sign-in.
    ["sleds", "listings"].forEach(k => set(k, get(k, []).filter(x => !x.cloudOwner || x.cloudOwner !== uid)));
    set("cloudShared", []); set("cloudProfile", null); set("adminViewAs", ""); set("migrationAsked", false);
  };
  // Permanently deletes the account, its sleds, ads and photos, and cancels any Stripe subscription
  // (supabase/functions/delete-account). Sleds still on this phone are kept as local-only copies.
  Cloud.deleteAccount = async () => {
    const { data, error } = await Cloud.client.functions.invoke("delete-account", { method: "POST" });
    if (error || !data || !data.deleted) throw new Error((error && error.message) || (data && data.error) || "Couldn't delete the account");
    const uid = Cloud.user.id;
    ["sleds", "listings"].forEach(k => set(k, get(k, []).map(x => { if (x.cloudOwner === uid) { const y = Object.assign({}, x); delete y.cloudOwner; return y } return x })));
    set("outbox", []); set("cloudShared", []); set("cloudProfile", null); set("migrationAsked", true);
    await Cloud.client.auth.signOut().catch(() => {});
  };
  Cloud.loadProfile = async () => {
    if (!Cloud.user) { Cloud.profile = null; set("cloudProfile", null); return; }
    const { data, error } = await Cloud.client.from("profiles").select("id,handle,is_admin,premium_until").eq("id", Cloud.user.id).maybeSingle();
    if (error) { Cloud.lastError = error.message; return; }     // offline: keep the cached profile
    Cloud.profile = data; set("cloudProfile", data);
  };
  Cloud.setHandle = async h => {
    h = String(h || "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(h)) throw new Error("Use 3–30 letters, numbers or _ (no spaces).");
    const { error } = await Cloud.client.from("profiles").update({ handle: h }).eq("id", Cloud.user.id);
    if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "That name is taken. Try another." : error.message);
    await Cloud.loadProfile(); emit();
  };
  // Stripe Payment Link carries the account id so the webhook knows whom to upgrade.
  Cloud.checkoutUrl = () => {
    if (!C.STRIPE_PAYMENT_LINK || !Cloud.user) return "";
    const u = new URL(C.STRIPE_PAYMENT_LINK);
    u.searchParams.set("client_reference_id", Cloud.user.id);
    if (Cloud.user.email) u.searchParams.set("prefilled_email", Cloud.user.email);
    return u.toString();
  };
  Cloud.portalUrl = () => {
    if (!C.STRIPE_PORTAL_LINK) return "";
    const u = new URL(C.STRIPE_PORTAL_LINK);
    if (Cloud.user && Cloud.user.email) u.searchParams.set("prefilled_email", Cloud.user.email);
    return u.toString();
  };
  Cloud.paymentsOn = () => !!C.STRIPE_PAYMENT_LINK;

  async function onSession(session) {
    const prev = Cloud.user && Cloud.user.id;
    Cloud.user = session ? session.user : null;
    if (Cloud.user && Cloud.user.id !== prev) forgetOtherAccounts(Cloud.user.id);
    await Cloud.loadProfile();
    emit();
    if (Cloud.user) { await Cloud.flush(); }
    await Cloud.pull();
  }

  Cloud.init = async () => {
    if (!enabled) return;
    if (!window.supabase || !window.supabase.createClient) {
      // Vendored copy of @supabase/supabase-js (MIT), loaded only when live mode is on.
      await new Promise(res => { const sc = document.createElement("script"); sc.src = "vendor/supabase-2.119.2.js"; sc.onload = sc.onerror = res; document.head.appendChild(sc); });
    }
    if (!window.supabase || !window.supabase.createClient) { Cloud.lastError = "Couldn't load the account library."; emit(); return; }
    Cloud.client = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    });
    Cloud.client.auth.onAuthStateChange((evt, session) => {
      if (evt === "INITIAL_SESSION") return;       // handled below
      if (evt === "SIGNED_IN" || evt === "SIGNED_OUT" || evt === "USER_UPDATED") setTimeout(() => onSession(session), 0);
    });
    const { data } = await Cloud.client.auth.getSession();
    // Magic-link return (?code=…): strip it from the address bar once the session exists.
    if (/[?&]code=/.test(location.search)) history.replaceState(null, "", location.pathname + location.hash);
    Cloud.ready = true;
    await onSession(data.session);
    window.addEventListener("online", () => Cloud.syncNow());
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { Cloud.loadProfile().then(() => Cloud.syncNow()) } });
    setInterval(() => { if (document.visibilityState === "visible") Cloud.syncNow() }, 5 * 60 * 1000);
  };
})();
