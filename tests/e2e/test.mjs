// End-to-end check of Sled Finder in demo mode and live (cloud) mode with a fake Supabase backend.
// Run: npm i (in this folder) then `node test.mjs`. Needs a Chromium for playwright-core (npx playwright install chromium-headless-shell).
import { chromium } from "playwright-core";
import http from "http"; import fs from "fs"; import path from "path"; import crypto from "crypto";
const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const FAKE = fs.readFileSync(new URL("./fake-supabase.js", import.meta.url), "utf8");
const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png" };
const srv = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split("?")[0]); const f = path.join(ROOT, u === "/" ? "index.html" : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res) });
await new Promise(r => srv.listen(0, r)); const BASE = `http://127.0.0.1:${srv.address().port}/`;
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m) };

// ───── fake server state ─────
const S = { users: {}, profiles: {}, sleds: [], listings: [], photo_posts: [], comments: [], articles: [], notifications: [], notification_reads: [], notification_settings: {}, push_subscriptions: [], uploads: [] };
const isPrem = uid => { const p = S.profiles[uid]; return !!p && (p.is_admin || (p.premium_until && Date.parse(p.premium_until) > Date.now())) };
const match = (r, f) => f.every(([op, c, v]) => op === "eq" ? r[c] === v : op === "neq" ? r[c] !== v : op === "is" ? (r[c] ?? null) === v : true);
function emitNotice(kind, row) {
  if (!kind || !row || !row.id) return;
  if (kind === "sled" && !(row.shared && !row.deleted_at)) return;
  if (kind === "listing" && !((row.status || "active") === "active" && !row.deleted_at)) return;
  if (kind === "photo" && row.deleted_at) return;
  if (kind === "article" && (!row.published || row.example)) return;
  const tid = String(row.id);
  if (S.notifications.some(n => n.kind === kind && n.target_id === tid)) return;
  const handle = row.owner_handle;
  let title, body, href;
  if (kind === "sled") { title = "New shared sled"; body = (handle ? "@" + handle + " shared " : "A member shared ") + (row.model || "a sled"); href = "#/sled/c" + row.id }
  else if (kind === "photo") { title = "New community photo"; body = (handle ? "@" + handle + " posted a photo" : "A member posted a photo"); href = "#/photopost/c" + row.id }
  else if (kind === "listing") { title = "New sled for sale"; body = (row.title || "A sled is for sale") + (row.price ? " · " + row.price : ""); href = "#/listing/c" + row.id }
  else { title = row.source === "vintage-runner" ? "New Vintage Runner article" : (row.access === "exclusive" ? "New exclusive article" : "New article"); body = row.title || "A new article is up"; href = "#/article/" + row.id }
  S.notifications.push({ id: crypto.randomUUID(), kind, target_id: tid, actor_id: row.owner || null, title, body, href, created_at: new Date().toISOString() });
}
function query(q) {
  const uid = q.uid;
  if (q.table === "notification_settings") {
    if (q.op === "select") { const row = uid ? S.notification_settings[uid] : null; return { data: q.single ? row || null : (row ? [row] : []), error: null } }
    if (q.op === "upsert" || q.op === "update") {
      if (!uid) return { error: { message: "permission denied" } };
      const cur = S.notification_settings[uid] || { user_id: uid, notify_sleds: true, notify_articles: true, notify_photos: true, notify_listings: true, push_enabled: false };
      Object.assign(cur, q.row || {}, { user_id: uid }); S.notification_settings[uid] = cur;
      return { data: q.single ? cur : [cur], error: null };
    }
  }
  if (q.table === "notification_reads") {
    if (q.op === "select") return { data: S.notification_reads.filter(r => r.user_id === uid), error: null };
    if (q.op === "upsert" || q.op === "insert") {
      if (!uid) return { error: { message: "permission denied" } };
      const rows = Array.isArray(q.row) ? q.row : [q.row];
      rows.forEach(row => {
        if (!row || row.user_id !== uid) return;
        if (!S.notification_reads.some(r => r.user_id === uid && r.notification_id === row.notification_id))
          S.notification_reads.push({ user_id: uid, notification_id: row.notification_id, read_at: new Date().toISOString() });
      });
      return { data: null, error: null };
    }
  }
  if (q.table === "push_subscriptions") {
    if (q.op === "select") return { data: S.push_subscriptions.filter(r => r.user_id === uid), error: null };
    if (q.op === "upsert") {
      if (!uid) return { error: { message: "permission denied" } };
      let r = S.push_subscriptions.find(x => x.endpoint === q.row.endpoint);
      if (r && r.user_id !== uid) return { error: { message: "permission denied" } };
      if (!r) { r = { id: crypto.randomUUID(), created_at: new Date().toISOString() }; S.push_subscriptions.push(r) }
      Object.assign(r, q.row, { user_id: uid, updated_at: new Date().toISOString() }); return { data: r, error: null };
    }
    if (q.op === "delete") {
      const ep = (q.filters.find(f => f[0] === "eq" && f[1] === "endpoint") || [])[2];
      S.push_subscriptions = S.push_subscriptions.filter(r => !(r.user_id === uid && (!ep || r.endpoint === ep)));
      return { data: null, error: null };
    }
  }
  if (q.table === "notifications") {
    if (q.op !== "select") return { error: { message: "permission denied" } };
    const rows = S.notifications.filter(n => n.actor_id !== uid && (n.kind === "article" || (isPrem(uid) && (!n.actor_id || isPrem(n.actor_id)))));
    return { data: rows.map(r => JSON.parse(JSON.stringify(r))), error: null };
  }
  if (q.table === "profiles") {
    if (q.op === "select") { const rows = Object.values(S.profiles).filter(p => p.id === uid && match(p, q.filters)); return { data: q.single ? rows[0] || null : rows, error: null } }
    if (q.op === "update") { const p = S.profiles[uid]; if (!p) return { data: null, error: null }; if (Object.keys(q.row).some(k => k !== "handle" && k !== "display_name")) return { error: { message: "permission denied for table profiles" } };
      if (q.row.handle && Object.values(S.profiles).some(x => x.handle === q.row.handle && x.id !== uid)) return { error: { message: "duplicate key value violates unique constraint" } }; if (q.row.handle) p.handle = q.row.handle; if ("display_name" in q.row) p.display_name = q.row.display_name; [...S.sleds, ...S.listings, ...S.photo_posts, ...S.comments].filter(r => r.owner === uid).forEach(r => r.owner_handle = p.handle); return { data: null, error: null } }
  }
  if (q.table === "article_teasers") {
    if (q.op !== "select") return { error: { message: "permission denied" } };
    const rows = S.articles.filter(r => r.published && match(r, q.filters)).map(r => {
      const { body, data, ...teaser } = r;
      teaser.coming_soon = !!(r.coming_soon || (data && (data.comingSoon || data.coming_soon)));
      return JSON.parse(JSON.stringify(teaser));
    });
    return { data: rows, error: null };
  }
  const T = S[q.table];
  if (!T) return { data: q.op === "select" ? [] : null, error: q.op === "select" ? null : { message: "unknown table " + q.table } };
  const visible = r => {
    if (r.owner === uid) return true;
    if (q.table === "sleds") return r.shared && !r.deleted_at && isPrem(uid) && isPrem(r.owner);
    if (q.table === "listings") return r.status === "active" && !r.deleted_at && isPrem(uid) && isPrem(r.owner);
    if (q.table === "photo_posts" || q.table === "comments") return !r.deleted_at && isPrem(uid) && isPrem(r.owner);
    if (q.table === "articles") return r.published && (r.access === "free" || isPrem(uid));
    return false;
  };
  if (q.op === "select") return { data: T.filter(r => visible(r) && match(r, q.filters)).map(r => JSON.parse(JSON.stringify(r))), error: null };
  if (!uid) return { error: { message: "permission denied" } };
  if (q.op === "upsert") {
    if (!isPrem(uid) || q.row.owner !== uid) return { error: { message: 'new row violates row-level security policy for table "' + q.table + '"' } };
    if (q.table === "photo_posts" && !(q.row.photos && q.row.photos.length)) return { error: { message: "photo_posts require at least one photo" } };
    if (q.table === "comments" && !(String(q.row.body||"").length || (q.row.photos && q.row.photos.length))) return { error: { message: "comment needs text or a photo" } };
    let r = T.find(x => x.owner === uid && x.client_id === q.row.client_id);
    if (!r) { r = { id: crypto.randomUUID(), created_at: new Date().toISOString(), status: "active" }; T.push(r) }
    Object.assign(r, q.row, { owner_handle: S.profiles[uid].handle, updated_at: new Date().toISOString() }); emitNotice({ sleds: "sled", listings: "listing", photo_posts: "photo", articles: "article" }[q.table], r); return { data: null, error: null };
  }
  if (q.op === "update") {
    const rows = T.filter(r => match(r, q.filters) && ((r.owner === uid && isPrem(uid)) || S.profiles[uid].is_admin));
    const kind = { sleds: "sled", listings: "listing", photo_posts: "photo", articles: "article" }[q.table];
    rows.forEach(r => {
      Object.assign(r, q.row, { updated_at: new Date().toISOString() });
      const live = kind === "sled" ? (r.shared && !r.deleted_at)
        : kind === "listing" ? ((r.status || "active") === "active" && !r.deleted_at)
        : kind === "photo" ? !r.deleted_at
        : kind === "article" ? (r.published && !r.example)
        : true;
      if (!live) S.notifications = S.notifications.filter(n => !(n.kind === kind && n.target_id === String(r.id)));
    });
    return { data: null, error: null };
  }
}
async function fakeOp(op, a) {
  if (op === "otp") return { error: null };
  if (op === "verify") { if (a.token !== "123456") return { error: { message: "Token has expired or is invalid" } };
    let u = Object.values(S.users).find(x => x.email === a.email);
    if (!u) { u = { id: crypto.randomUUID(), email: a.email }; S.users[u.id] = u; S.profiles[u.id] = { id: u.id, handle: "collector_" + u.id.replace(/-/g, "").slice(0, 8), display_name: "", is_admin: false, premium_until: null, created_at: new Date().toISOString() }; S.notification_settings[u.id] = { user_id: u.id, notify_sleds: true, notify_articles: true, notify_photos: true, notify_listings: true, push_enabled: false } }
    return { data: { session: { user: u, access_token: "t" } }, error: null } }
  if (op === "upload") { if (!a.uid || !isPrem(a.uid) || !a.path.startsWith(a.uid + "/")) return { error: { message: "new row violates row-level security policy" } }; S.uploads.push(a.path); return { error: null } }
  if (op === "query") return query(a);
  if (op === "fn" && a.name === "create-checkout") {
    if (!a.uid) return { data: null, error: { message: "not signed in" } };
    const p = S.profiles[a.uid] || {};
    if (["active", "past_due", "trialing", "unpaid"].includes(p.stripe_subscription_status)) {
      return { data: { url: "https://billing.stripe.com/session/test_portal_" + a.uid, portal: true }, error: null };
    }
    return { data: { url: "https://checkout.stripe.com/c/pay/cs_test_" + a.uid }, error: null };
  }
  if (op === "fn" && a.name === "create-portal-session") {
    if (!a.uid) return { data: null, error: { message: "not signed in" } };
    return { data: { url: "https://billing.stripe.com/session/test_portal_" + a.uid }, error: null };
  }
  if (op === "fn" && a.name === "delete-account") { if (!a.uid) return { data: null, error: { message: "not signed in" } };
    delete S.users[a.uid]; delete S.profiles[a.uid]; delete S.notification_settings[a.uid]; S.sleds = S.sleds.filter(r => r.owner !== a.uid); S.listings = S.listings.filter(r => r.owner !== a.uid); S.photo_posts = S.photo_posts.filter(r => r.owner !== a.uid); S.comments = S.comments.filter(r => r.owner !== a.uid); S.notification_reads = S.notification_reads.filter(r => r.user_id !== a.uid); S.push_subscriptions = S.push_subscriptions.filter(r => r.user_id !== a.uid);
    S.uploads = S.uploads.filter(x => !x.startsWith(a.uid + "/")); return { data: { deleted: true }, error: null } }
}

const browser = await chromium.launch({ executablePath: fs.existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined });
async function device(live, seed) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const errors = [];
  // Always stub config.js: the backend branch may have a real Supabase URL, which would turn the "demo" tests into live mode.
  if (live) {
    await ctx.route("**/config.js*", r => r.fulfill({ contentType: "application/javascript", body: `window.SF_CONFIG={SUPABASE_URL:"https://fake.supabase.co",SUPABASE_ANON_KEY:"anon",STRIPE_CHECKOUT:true,STRIPE_PAYMENT_LINK:"https://buy.stripe.com/test_123",STRIPE_PORTAL_LINK:"https://billing.stripe.com/p/login/test_1",SHOW_SAMPLE_DATA:false};` }));
    await ctx.route("**/vendor/supabase-*.js", r => r.fulfill({ contentType: "application/javascript", body: FAKE }));
    await ctx.exposeFunction("__fake", fakeOp);
  } else {
    await ctx.route("**/config.js*", r => r.fulfill({ contentType: "application/javascript", body: `window.SF_CONFIG={SUPABASE_URL:"",SUPABASE_ANON_KEY:"",STRIPE_CHECKOUT:false,STRIPE_PAYMENT_LINK:"",STRIPE_PORTAL_LINK:"",SHOW_SAMPLE_DATA:true};` }));
  }
  await ctx.route(/nominatim|photon|geocod|rosebudsledmuseum\.com|events\.json/i, r => r.fulfill({ status: 404, body: "" }));
  if (seed) await ctx.addInitScript(s => { if (!localStorage.getItem("seeded")) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); localStorage.setItem("seeded", "1") } }, seed);
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(e.message));
  if (process.env.DEBUG) page.on("console", m => console.log("  [page " + m.type() + "]", m.text().slice(0, 300)));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push(m.text()) });
  await page.goto(BASE + "#/home"); await page.waitForTimeout(800);
  return { ctx, page, errors };
}
const go = async (p, h) => { await p.evaluate(h => location.hash = h, h); await p.waitForTimeout(350) };
const ls = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem("svc_" + k)), k);
const DATAPIC = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
async function addSled(page, model, shared) {
  await go(page, "#/add"); await page.waitForSelector("#addf");
  await page.fill("#addf [name=model]", model);
  await page.check("#addf input[name=locType][value=na]");
  if (shared) await page.check("#addf [name=shared]"); else await page.uncheck("#addf [name=shared]").catch(() => {});
  await page.check("#addf [name=ack]");
  await page.click("#addf button[type=submit]"); await page.waitForTimeout(900);
}

// ════════ 1. Demo mode (no config) ════════
{
  const { ctx, page, errors } = await device(false);
  ok(await page.title() === "Sled Finder — clickable mockup" || (await page.title()).includes("clickable mockup"), "demo: title still says clickable mockup");
  ok((await ls(page, "outbox")) === null, "demo: no outbox / no cloud activity");
  for (const h of ["#/home", "#/collection", "#/makers", "#/maker/1", "#/sale", "#/profile", "#/upgrade", "#/account", "#/map", "#/identify", "#/search", "#/suggest", "#/events", "#/ticket", "#/photos", "#/articles", "#/notifications"]) { await go(page, h); }
  ok(await page.locator("#viewAs").count() === 1, "demo: Viewing-as switcher still shown");
  ok((await page.textContent("#view")).length > 0, "demo: screens render");
  await page.evaluate(() => { localStorage.setItem("svc_role", JSON.stringify("premium")) });
  await addSled(page, "Demo Flyer", false);
  const sl = await ls(page, "sleds");
  ok(sl && sl[0].model === "Demo Flyer", "demo: adding a sled saves on the phone");
  ok((await ls(page, "outbox")) === null, "demo: still nothing queued for upload");
  ok((await page.textContent("body")).includes("Sample") || (await page.evaluate(() => window.SAMPLE_SLEDS.length)) > 0, "demo: sample data still present");
  await page.evaluate(() => { localStorage.setItem("svc_role", JSON.stringify("free")) });
  await go(page, "#/sale");
  ok((await page.textContent("#view")).includes("Post a sled for sale") && !(await page.textContent("#view")).includes("Sleds for Sale is for members"), "demo: free user can browse and post sale listings");
  await go(page, "#/ticket");
  ok(/museum ticket is for members|Join/.test(await page.textContent("#view")), "demo: free user sees a locked museum ticket");
  await go(page, "#/photos");
  ok((await page.textContent("#view")).includes("Community photos are for members"), "demo: free user cannot open the photo gallery");
  await page.evaluate(() => { localStorage.setItem("svc_role", JSON.stringify("premium")) });
  await go(page, "#/add");
  ok(await page.locator('#addf [name=sledType] option[value="Flexy Racer"]').count() === 1, "demo: Flexy Racer is a sled type on the add form");
  await go(page, "#/sale");
  const sale = await page.textContent("#view");
  ok(sale.includes("Post a sled for sale") && !sale.includes("Sleds for Sale is for members"), "demo: premium can browse sale listings");
  ok((await page.locator("#typef").textContent()).includes("Flexy Racer"), "demo: sale type filter includes Flexy Racer");
  await go(page, "#/ticket");
  const ticket = await page.textContent("#museumTicket");
  ok(ticket.includes("Rosebud Sled Museum — Member Admission") && ticket.includes("Schaumburg") && ticket.includes("Sample Member") && ticket.includes("SF-DEMO-P") && ticket.includes("Valid through") && !/Berkshire|719|Lane/.test(ticket), "demo: premium ticket shows name, dates, member ID and Schaumburg only");
  await go(page, "#/events");
  const ev = await page.textContent("#view");
  ok(ev.includes("Gail Borden Public Library") && ev.includes("Ela Area Public Library") && ev.includes("Rolling Meadows") && ev.includes("rosebudsledmuseum.com") && ev.includes("January 2027"), "demo: events lists the three programs from the museum website");
  await go(page, "#/articles");
  const art = await page.textContent("#view");
  ok(art.includes("Vintage Runner Magazine") && /Thanksgiving/.test(art) && art.includes("Free articles") && art.includes("Exclusive articles") && art.includes("Coming soon."), "demo: articles page has Free and Exclusive sections plus magazine chrome");
  await go(page, "#/photos");
  ok((await page.textContent("#view")).includes("Post photos") && (await page.textContent("#view")).includes("Flexy Racer"), "demo: premium sees the community photo gallery");
  await go(page, "#/home");
  const home = await page.textContent("#view");
  ok(home.includes("YouTube: Sleddy Mercury") && home.includes("Rosebud Sled Museum website"), "demo: home shows YouTube and museum website labels together");
  ok(await page.locator('#view a[href="https://youtube.com/@sleddymercury"]').count() >= 2, "demo: YouTube channel link is on home (chips and about)");
  ok(await page.locator('#view a[href="https://rosebudsledmuseum.com/"]').count() >= 2, "demo: museum website link is on home (chips and about)");
  await go(page, "#/profile");
  const prof = await page.textContent("#view");
  ok(prof.includes("YouTube: Sleddy Mercury") && prof.includes("Rosebud Sled Museum website"), "demo: profile menu shows YouTube and museum website together");
  ok(await page.locator('#view a[href="https://youtube.com/@sleddymercury"]').count() >= 1, "demo: profile has the YouTube channel link");
  ok(await page.locator('#view a[href="https://rosebudsledmuseum.com/"]').count() >= 1, "demo: profile has the museum website link");
  ok(await page.locator('#appbar a.bell[href="#/notifications"]').count() === 1, "demo: bell is in the app bar");
  await page.evaluate(() => { localStorage.setItem("svc_role", JSON.stringify("free")) });
  await go(page, "#/notifications");
  const freeN = await page.textContent("#view");
  ok(freeN.includes("New exclusive article") && freeN.includes("Example") && freeN.includes("New sled for sale") && !freeN.includes("New shared sled") && !freeN.includes("New community photo"), "demo: free user sees article and sale notices, not sled/photo");
  ok(await page.locator("#appbar .bell-count").count() === 1, "demo: unread badge on the bell");
  await page.evaluate(() => { localStorage.setItem("svc_role", JSON.stringify("premium")) });
  await go(page, "#/home");
  await go(page, "#/notifications");
  const premN = await page.textContent("#view");
  ok(premN.includes("New shared sled") && premN.includes("New exclusive article") && premN.includes("New community photo") && premN.includes("New sled for sale") && (premN.match(/Example/g) || []).length >= 4, "demo: premium sees all example notifications, labeled as examples");
  await page.click('#nList a[href="#/sled/s5"]'); await page.waitForTimeout(400);
  ok((await page.textContent("#view")).includes("Streamline Klipper"), "demo: notification links to the shared sled");
  await go(page, "#/notifications");
  ok(await page.locator('#nList a.unread[href="#/sled/s5"]').count() === 0, "demo: opened notice is no longer unread");
  await page.uncheck('[data-nset="listings"]'); await page.waitForTimeout(400);
  ok(!(await page.textContent("#nList")).includes("New sled for sale"), "demo: turning off sale notices hides that category");
  ok(errors.length === 0, "demo: no JS errors " + (errors.length ? JSON.stringify(errors) : ""));
  await ctx.close();
}

// ════════ 2. Live mode ════════
const oldSled = { id: "u1700000000000", user: "you", userAdded: true, mine: true, likes: 0, maker: 1, brand: "", makerText: "", model: "Pre-account Flyer", years: "1920s", condition: "Good", size: "—", found: "barn", notes: "", shared: true, locType: "na", country: "US", town: "NA", imgs: [DATAPIC], img: DATAPIC };
S.articles.push(
  { id: "free-one", access: "free", source: "online", title: "A free welcome", dek: "A teaser for everyone", body: "Hello free reader.", data: {}, published: true, example: false, sort_order: 1 },
  { id: "ex-one", access: "exclusive", source: "vintage-runner", title: "An exclusive feature", dek: "Members-only teaser", body: "", data: { kicker: "Feature", blocks: [{ type: "p", text: "Secret exclusive body." }] }, published: true, example: false, sort_order: 2 },
  { id: "placeholder-1", access: "exclusive", source: "online", title: "Collector Focus", dek: "Exclusive, online only.", body: "This exclusive article is still being written.", data: { comingSoon: true }, published: true, example: true, sort_order: 101 },
  { id: "placeholder-2", access: "exclusive", source: "online", title: "Paris Racers", dek: "Exclusive, online only.", body: "This exclusive article is still being written.", data: { comingSoon: true }, published: true, example: true, sort_order: 102 },
  { id: "placeholder-3", access: "exclusive", source: "online", title: "Big Sleds!", dek: "Exclusive, online only.", body: "This exclusive article is still being written.", data: { comingSoon: true }, published: true, example: true, sort_order: 103 }
);
const A = await device(true, { svc_sleds: [oldSled] });
{
  const p = A.page;
  ok(!(await p.title()).includes("mockup"), "live: title no longer says mockup");
  ok(await p.evaluate(() => window.SAMPLE_SLEDS.length === 0 && window.SALE_LISTINGS.length === 0), "live: sample collectors/ads hidden");
  ok(await p.locator("#viewAs").count() === 0, "live: signed-out user has no role switcher");
  await go(p, "#/add"); ok((await p.textContent("#view")).includes("members"), "live: signed out cannot add (members gate)");
  await go(p, "#/sale"); ok((await p.textContent("#view")).includes("Sign in to see Sleds for Sale"), "live: signed out cannot browse sale listings");
  await go(p, "#/articles");
  const artsOut = await p.textContent("#view");
  ok(artsOut.includes("Free articles") && artsOut.includes("Exclusive articles") && artsOut.includes("A free welcome") && artsOut.includes("An exclusive feature") && artsOut.includes("Collector Focus") && artsOut.includes("Paris Racers") && artsOut.includes("Big Sleds!") && artsOut.includes("Coming soon") && artsOut.includes("Join to read"), "live: signed out sees Free and Exclusive sections with teasers");
  ok(await p.locator('a[href="#/article/placeholder-1"]').count()===0 && await p.locator('a[href="#/article/ex-one"]').count()===1, "live: coming-soon teasers are not links; real exclusive teasers are");
  await go(p, "#/article/free-one");
  ok((await p.textContent("#view")).includes("Hello free reader."), "live: signed out can read a free article");
  await go(p, "#/article/ex-one");
  const exOut = await p.textContent("#view");
  ok(exOut.includes("Members-only teaser") && exOut.includes("Join to read") && !exOut.includes("Secret exclusive body."), "live: signed out sees exclusive teaser and Join, not the body");
  await go(p, "#/article/placeholder-1");
  const soonOut = await p.textContent("#view");
  ok(/coming soon/i.test(soonOut) && !soonOut.includes("still being written"), "live: coming-soon article has no body");
  await go(p, "#/upgrade"); ok(await p.locator('a[href="#/account"]').count() > 0, "live: paywall asks to sign in first");
  await go(p, "#/account"); await p.fill("#signf [name=email]", "jonathan@example.test"); await p.click("#signf button"); await p.waitForTimeout(400);
  ok(await p.locator("#codef").count() === 1, "live: code entry shown after email");
  await p.fill("#codef [name=code]", "000000"); await p.click("#codef button[type=submit]"); await p.waitForTimeout(400);
  ok(await p.evaluate(() => !SFCloud.user), "live: wrong code rejected");
  await p.fill("#codef [name=code]", "123456"); await p.click("#codef button[type=submit]"); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => !!SFCloud.user && SFCloud.realRole() === "free"), "live: signed in as free account");
  await go(p, "#/account");
  ok((await p.textContent("#view")).includes("1 item saved on this phone"), "live: migration offer for the pre-account sled");
  await p.click("#migrate"); await p.waitForTimeout(1200);
  ok(S.sleds.length === 0 && (await ls(p, "outbox")).length === 1, "live: free account can't upload; sled kept in outbox");
  ok(/membership is active/.test(await p.evaluate(() => SFCloud.lastError)), "live: explains it uploads once membership is active");
  await go(p, "#/sale");
  ok((await p.textContent("#view")).includes("Post a sled for sale") && !(await p.textContent("#view")).includes("Sleds for Sale is for members"), "live: signed-in free member can browse and post listings");
  await go(p, "#/article/ex-one");
  ok((await p.textContent("#view")).includes("Join to read") && !(await p.textContent("#view")).includes("Secret exclusive body."), "live: signed-in free member cannot read exclusive body");
  await go(p, "#/upgrade");
  const uid = await p.evaluate(() => SFCloud.user.id);
  ok(await p.locator("#joinP").count() > 0, "live: join button shown");
  const payUrl = await p.evaluate(() => SFCloud.startCheckout());
  ok(payUrl && payUrl.includes("checkout.stripe.com") && payUrl.includes(uid) && !payUrl.includes("client_reference_id="), "live: Checkout Session is created for this account (not an editable Payment Link)");
  const fallback = await p.evaluate(() => SFCloud.checkoutUrl());
  ok(fallback && fallback.includes("client_reference_id=" + uid) && fallback.includes("prefilled_email="), "live: Payment Link fallback still carries account id + email");
  await p.evaluate(() => SFCloud.queue && 0);
  ok(await p.evaluate(() => { try { localStorage.setItem("svc_role", '"admin"'); return SFCloud.role() } catch (e) { return "x" } }) === "free", "live: localStorage role hack does nothing");
  // webhook would do this:
  S.profiles[uid].premium_until = new Date(Date.now() + 365 * 864e5).toISOString();
  S.profiles[uid].stripe_subscription_status = "active";
  S.profiles[uid].stripe_subscription_id = "sub_test";
  S.profiles[uid].stripe_customer_id = "cus_test";
  await p.click("#refreshP"); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => SFCloud.realRole()) === "premium", "live: after payment, refresh shows Premium");
  await go(p, "#/ticket");
  ok((await p.textContent("#museumTicket")).includes("Member Admission") && (await p.textContent("#museumTicket")).includes("Schaumburg"), "live: premium member can open the museum ticket");
  await go(p, "#/sale");
  ok((await p.textContent("#view")).includes("Post a sled for sale"), "live: premium member can browse Sleds for Sale");
  await go(p, "#/article/ex-one");
  ok((await p.textContent("#view")).includes("Secret exclusive body."), "live: premium member can read exclusive body");
  const portalUrl = await p.evaluate(() => SFCloud.startCheckout());
  ok(portalUrl && portalUrl.includes("billing.stripe.com") && portalUrl.includes("test_portal_" + uid), "live: existing active subscription opens the Customer Portal, not a new Checkout");
  ok(S.sleds.length === 1 && S.sleds[0].model === "Pre-account Flyer" && S.sleds[0].photos[0].startsWith("https://fake.supabase.co/") && S.uploads.length === 1, "live: migrated sled + photo uploaded");
  ok((await ls(p, "outbox")).length === 0, "live: outbox empty");
  await addSled(p, "Cloud Speedster", true);
  ok(S.sleds.some(s => s.model === "Cloud Speedster" && s.shared), "live: new sled syncs to the cloud");
  await go(p, "#/account"); await p.fill("#handlef [name=handle]", "rosebud_jon"); await p.click("#handlef button"); await p.waitForTimeout(500);
  ok(S.profiles[uid].handle === "rosebud_jon", "live: public name saved");
  // offline
  await A.ctx.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event("offline")));
  await addSled(p, "Offline Clipper", false);
  ok(!S.sleds.some(s => s.model === "Offline Clipper") && (await ls(p, "outbox")).length === 1, "live: offline save stays on phone, queued");
  ok((await ls(p, "sleds")).some(s => s.model === "Offline Clipper"), "live: offline sled visible on phone");
  await A.ctx.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event("online"))); await p.waitForTimeout(1500);
  ok(S.sleds.some(s => s.model === "Offline Clipper") && (await ls(p, "outbox")).length === 0, "live: back online → uploaded");
  ok(A.errors.length === 0, "live A: no JS errors " + (A.errors.length ? JSON.stringify(A.errors) : ""));
}
// second phone, same account
const B = await device(true);
{
  const p = B.page; await go(p, "#/account"); await p.fill("#signf [name=email]", "jonathan@example.test"); await p.click("#signf button"); await p.waitForTimeout(300);
  await p.fill("#codef [name=code]", "123456"); await p.click("#codef button[type=submit]"); await p.waitForTimeout(1500);
  const mine = (await ls(p, "sleds")) || [];
  ok(mine.length === 3 && mine.every(s => s.mine && s.cloudOwner), "phone B: all 3 of the member's sleds arrive");
  await go(p, "#/collection"); ok((await p.textContent("#view")).includes("Cloud Speedster"), "phone B: My Collection lists cloud sleds");
}
// delete on A → gone on B
{
  const id = (await ls(A.page, "sleds")).find(s => s.model === "Offline Clipper").id;
  await A.page.evaluate(id => { location.hash = "#/sled/" + id }, id); await A.page.waitForTimeout(400);
  A.page.once("dialog", d => d.accept()); await A.page.click('[data-del]'); await A.page.waitForTimeout(1200);
  ok(S.sleds.find(s => s.client_id === id).deleted_at, "delete on phone A → soft-deleted in cloud");
  await B.page.evaluate(() => SFCloud.syncNow()); await B.page.waitForTimeout(600);
  ok(!(await ls(B.page, "sleds")).some(s => s.id === id), "phone B: deleted sled removed after sync");
}
// another member
const Cm = await device(true);
{
  const p = Cm.page; await go(p, "#/account"); await p.fill("#signf [name=email]", "member2@example.test"); await p.click("#signf button"); await p.waitForTimeout(300);
  await p.fill("#codef [name=code]", "123456"); await p.click("#codef button[type=submit]"); await p.waitForTimeout(1200);
  ok(((await ls(p, "cloudShared")) || []).length === 0, "free member 2: sees no shared sleds (Premium only)");
  const uid2 = await p.evaluate(() => SFCloud.user.id); S.profiles[uid2].premium_until = new Date(Date.now() + 864e5).toISOString();
  await p.evaluate(() => SFCloud.loadProfile().then(() => SFCloud.syncNow())); await p.waitForTimeout(800);
  const sh = (await ls(p, "cloudShared")) || [];
  ok(sh.length === 2 && sh.every(s => s.user === "rosebud_jon" && /^c/.test(s.id)) && !sh.some(s => s.model === "Offline Clipper"), "premium member 2: sees Jonathan's 2 shared sleds, not private/deleted");
  await p.evaluate(id => { location.hash = "#/sled/" + id }, sh[0].id); await p.waitForTimeout(400);
  ok((await p.textContent("#view")).includes("rosebud_jon"), "premium member 2: shared sled page shows @handle");
  ok(await p.locator("[data-del]").count() === 0, "premium member 2: cannot edit/delete someone else's sled");
  await go(p, "#/notifications");
  const nt = await p.textContent("#view");
  ok(nt.includes("New shared sled") && nt.includes("Cloud Speedster") && !nt.includes("Example") && !nt.includes("Offline Clipper"), "live: member 2 is notified of Jonathan's new shared sled, not a private one");
  ok(await p.locator('#appbar a.bell[href="#/notifications"]').count() === 1, "live: bell is in the app bar");
  // sign out wipes account copies
  await go(p, "#/account"); p.once("dialog", d => d.accept()); await p.click("#signout"); await p.waitForTimeout(800);
  ok(await p.evaluate(() => !SFCloud.user) && ((await ls(p, "cloudShared")) || []).length === 0, "sign out clears synced copies from the phone");
  ok(Cm.errors.length === 0 && B.errors.length === 0, "phones B/C: no JS errors " + JSON.stringify(B.errors.concat(Cm.errors)));
}
// account deletion (phone A)
{
  const p = A.page; const before = (await ls(p, "sleds")).length;
  await go(p, "#/account"); const h = d => d.type() === "prompt" ? d.accept("DELETE") : d.accept(); p.on("dialog", h);
  await p.click("#delacct"); await p.waitForTimeout(1200); p.off("dialog", h);
  ok(!Object.values(S.users).some(u => u.email === "jonathan@example.test") && S.sleds.every(r => r.owner_handle !== "rosebud_jon") && S.uploads.length === 0, "delete account: user, sleds and photos removed from cloud");
  const after = (await ls(p, "sleds")) || [];
  ok(after.length === before && after.every(x => !x.cloudOwner) && await p.evaluate(() => !SFCloud.user), "delete account: phone keeps sleds as local-only copies, signed out");
}
await browser.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
