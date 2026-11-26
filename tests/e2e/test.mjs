// End-to-end check of Sled Finder in demo mode and live (cloud) mode with a fake Supabase backend.
// Run: npm i (in this folder) then `node test.mjs`. Needs a Chromium for playwright-core (npx playwright install chromium-headless-shell).
import { chromium, webkit, devices } from "playwright-core";
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
let FREE_PROMO = false;
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
// Report/Block tables exist only once the migration is "run" (RB = true).
let RB = false; const REPORTS = [], BLOCKS = [];
const RB_MISSING = { data: null, error: { message: "Could not find the table in the schema cache", code: "PGRST205" } };
function query(q) {
  const uid = q.uid;
  if (q.table === "content_reports") {
    if (!RB) return RB_MISSING;
    if (q.op === "insert") { if (!uid || q.row.reporter !== uid) return { error: { message: "new row violates row-level security policy" } }; REPORTS.push(Object.assign({ id: crypto.randomUUID(), status: "open", created_at: new Date().toISOString() }, q.row)); return { data: null, error: null } }
    if (q.op === "select") { const adm = uid && S.profiles[uid] && S.profiles[uid].is_admin; return { data: REPORTS.filter(r => (adm || r.reporter === uid) && q.filters.every(([op, c, v]) => op !== "eq" || r[c] === v)), error: null } }
  }
  if (q.table === "user_blocks") {
    if (!RB) return RB_MISSING;
    if (!uid) return { error: { message: "permission denied" } };
    if (q.op === "upsert") { if (q.row.blocker !== uid) return { error: { message: "rls" } }; if (!BLOCKS.some(b => b.blocker === uid && b.blocked === q.row.blocked)) BLOCKS.push(Object.assign({}, q.row)); return { data: null, error: null } }
    if (q.op === "select") return { data: BLOCKS.filter(b => b.blocker === uid), error: null };
    if (q.op === "delete") { const blocked = (q.filters.find(f => f[1] === "blocked") || [])[2]; for (let i = BLOCKS.length - 1; i >= 0; i--) if (BLOCKS[i].blocker === uid && BLOCKS[i].blocked === blocked) BLOCKS.splice(i, 1); return { data: null, error: null } }
  }
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
    const rows = S.notifications.filter(n => n.actor_id !== uid && (n.kind === "article" || (n.kind === "sled" && FREE_PROMO) || (isPrem(uid) && (!n.actor_id || isPrem(n.actor_id)))));
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
    if (r.hidden_by_admin && !(uid && S.profiles[uid] && S.profiles[uid].is_admin)) return false;
    if (q.table === "sleds") return r.shared && !r.deleted_at && (FREE_PROMO || (isPrem(uid) && isPrem(r.owner)));
    if (q.table === "listings") return r.status === "active" && !r.deleted_at && isPrem(uid) && isPrem(r.owner);
    if (q.table === "photo_posts" || q.table === "comments") return !r.deleted_at && isPrem(uid) && isPrem(r.owner);
    if (q.table === "articles") return r.published && (r.access === "free" || isPrem(uid));
    return false;
  };
  if (q.op === "select") return { data: T.filter(r => visible(r) && match(r, q.filters)).map(r => JSON.parse(JSON.stringify(r))), error: null };
  if (!uid) return { error: { message: "permission denied" } };
  if (q.op === "upsert") {
    if (q.row.owner !== uid || !(isPrem(uid) || (q.table === "sleds" && FREE_PROMO))) return { error: { message: 'new row violates row-level security policy for table "' + q.table + '"' } };
    if (q.table === "photo_posts" && !(q.row.photos && q.row.photos.length)) return { error: { message: "photo_posts require at least one photo" } };
    if (q.table === "comments" && !(String(q.row.body||"").length || (q.row.photos && q.row.photos.length))) return { error: { message: "comment needs text or a photo" } };
    let r = T.find(x => x.owner === uid && x.client_id === q.row.client_id);
    if (!r) { r = { id: crypto.randomUUID(), created_at: new Date().toISOString(), status: "active" }; T.push(r) }
    Object.assign(r, q.row, { owner_handle: S.profiles[uid].handle, updated_at: new Date().toISOString() }); emitNotice({ sleds: "sled", listings: "listing", photo_posts: "photo", articles: "article" }[q.table], r); return { data: null, error: null };
  }
  if (q.op === "update") {
    const rows = T.filter(r => match(r, q.filters) && ((r.owner === uid && (isPrem(uid) || (q.table === "sleds" && FREE_PROMO))) || (S.profiles[uid] && S.profiles[uid].is_admin)));
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
  if (op === "rpc" && a.name === "moderate_report") {
    if (!RB) return RB_MISSING;
    if (!(a.uid && S.profiles[a.uid] && S.profiles[a.uid].is_admin)) return { data: null, error: { message: "admin only" } };
    const r = REPORTS.find(x => x.id === a.args.report_id); if (!r) return { data: null, error: { message: "report not found" } };
    const tbl = { sled: "sleds", listing: "listings", photo: "photo_posts", comment: "comments" }[r.kind];
    if (a.args.action === "hide") { (S[tbl] || []).forEach(x => { if (x.id === r.target_id) x.hidden_by_admin = true }); REPORTS.forEach(x => { if (x.kind === r.kind && x.target_id === r.target_id) x.status = "hidden" }) }
    else r.status = "dismissed";
    return { data: a.args.action, error: null };
  }
  if (op === "password") { if (a.password !== "review-pass-1") return { data: { session: null }, error: { message: "Invalid login credentials" } }; return fakeOp("verify", { email: a.email, token: "123456" }) }
  if (op === "verify") { if (a.token !== "123456") return { error: { message: "Token has expired or is invalid" } };
    let u = Object.values(S.users).find(x => x.email === a.email);
    if (!u) { u = { id: crypto.randomUUID(), email: a.email }; S.users[u.id] = u; S.profiles[u.id] = { id: u.id, handle: "collector_" + u.id.replace(/-/g, "").slice(0, 8), display_name: "", is_admin: false, premium_until: null, created_at: new Date().toISOString() }; S.notification_settings[u.id] = { user_id: u.id, notify_sleds: true, notify_articles: true, notify_photos: true, notify_listings: true, push_enabled: false } }
    return { data: { session: { user: u, access_token: "t" } }, error: null } }
  if (op === "upload") { if (!a.uid || !(isPrem(a.uid) || FREE_PROMO) || !a.path.startsWith(a.uid + "/")) return { error: { message: "new row violates row-level security policy" } }; S.uploads.push(a.path); return { error: null } }
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
const FORM_POSTS = [];
async function device(live, seed, extraCfg) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const errors = [];
  // Always stub config.js: the backend branch may have a real Supabase URL, which would turn the "demo" tests into live mode.
  // Default FREE_ACCESS_PROMO is false so existing paywall tests stay flag-off.
  const cfg = Object.assign({
    SUPABASE_URL: live ? "https://fake.supabase.co" : "",
    SUPABASE_ANON_KEY: live ? "anon" : "",
    STRIPE_CHECKOUT: !!live,
    STRIPE_PAYMENT_LINK: live ? "https://buy.stripe.com/test_123" : "",
    STRIPE_PORTAL_LINK: live ? "https://billing.stripe.com/p/login/test_1" : "",
    SHOW_SAMPLE_DATA: !live,
    FREE_ACCESS_PROMO: false
  }, extraCfg || {});
  await ctx.route("**/config.js*", r => r.fulfill({ contentType: "application/javascript", body: "window.SF_CONFIG=" + JSON.stringify(cfg) + ";" }));
  if (live) {
    await ctx.route("**/vendor/supabase-*.js", r => r.fulfill({ contentType: "application/javascript", body: FAKE }));
    await ctx.exposeFunction("__fake", fakeOp);
  }
  await ctx.route(/nominatim|photon|geocod|rosebudsledmuseum\.com|events\.json/i, r => r.fulfill({ status: 404, body: "" }));
  await ctx.route(/docs\.google\.com\/forms/, r => { FORM_POSTS.push(r.request().postData() || ""); r.fulfill({ status: 200, body: "" }) });
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
  for (const h of ["#/home", "#/collection", "#/makers", "#/maker/1", "#/sale", "#/profile", "#/upgrade", "#/account", "#/map", "#/identify", "#/search", "#/database", "#/suggest", "#/events", "#/ticket", "#/photos", "#/articles", "#/notifications"]) { await go(page, h); }
  ok(await page.locator("#viewAs").count() === 1, "demo: Viewing-as switcher still shown");
  ok((await page.textContent("#view")).length > 0, "demo: screens render");
  const tabOrder = await page.locator("#tabbar a").evaluateAll(els => els.map(a => a.dataset.tab));
  ok(tabOrder.join(",") === "home,collection,add,sale,events,makers,database,profile", "demo: tab bar order is Home, My Sleds, Add, For Sale, Events, Makers, Database, Profile");
  ok(await page.locator('#tabbar a[data-tab="database"]').getAttribute("href") === "#/database", "demo: Database tab opens the Sled Maker and Model Database view");
  ok(await page.locator('#tabbar a[data-tab="database"] svg').count() === 1 && /Database/.test(await page.locator('#tabbar a[data-tab="database"]').innerText()), "demo: Database tab is labeled Database and has a magnifier icon");
  await page.setViewportSize({ width: 390, height: 844 });
  const layout = await page.locator("#tabbar a").evaluateAll(els => els.map(a => { const b = a.getBoundingClientRect(); return { tab: a.dataset.tab, x: b.x, w: b.width, h: b.height, r: b.right }; }));
  ok(layout.length === 8 && layout.every(t => t.w >= 36 && t.h >= 32 && t.x >= 0 && t.r <= 391), "demo: all 8 tabs are visible and tappable on a 390px iPhone width");
  ok(layout.every((t, i) => i === 0 || t.x >= layout[i - 1].x + 2), "demo: tab bar items do not overlap at 390px");
  await go(page, "#/database");
  ok(await page.locator('#tabbar a[data-tab="database"]').evaluate(el => el.classList.contains("on")) && await page.locator('#tabbar a[data-tab="home"]').evaluate(el => !el.classList.contains("on")), "demo: Database tab is active on #/database");
  ok(await page.locator("#database").count() === 1, "demo: Database tab shows the Sled Maker and Model Database section");
  const freeLinks = await page.locator(".db-links a.db-link").evaluateAll(els => els.map(a => ({ href: a.getAttribute("href"), text: a.textContent.replace(/\s+/g," ").trim(), h: a.getBoundingClientRect().height, w: a.getBoundingClientRect().width, x: a.getBoundingClientRect().x, y: a.getBoundingClientRect().y, fs: parseFloat(getComputedStyle(a).fontSize) })));
  ok(freeLinks.length === 3 && freeLinks.map(l => l.href).join(" ") === "#/identify #/map #/search", "demo: free database tools are Photo ID, Sled Picker Map and Search tiles");
  ok(freeLinks.every(l => l.h >= 44 && l.w >= 80 && l.fs >= 14) && freeLinks.some(l => /Photo ID/.test(l.text)) && freeLinks.some(l => /Sled Picker Map/.test(l.text)), "demo: free database tiles are at least 44px tall with readable labels");
  ok(await page.locator(".db-links a.db-link svg").count() === 3, "demo: each database tile has an icon");
  await go(page, "#/search");
  ok(await page.locator('#tabbar a[data-tab="database"]').evaluate(el => el.classList.contains("on")) && await page.locator("#q").count() === 1, "demo: Database tab stays active on the search view");
  await go(page, "#/home");
  ok(await page.locator('#tabbar a[data-tab="home"]').evaluate(el => el.classList.contains("on")) && await page.locator('#tabbar a[data-tab="database"]').evaluate(el => !el.classList.contains("on")), "demo: Home tab is active again on #/home");
  await page.setViewportSize({ width: 420, height: 900 });
  await page.evaluate(() => { localStorage.setItem("svc_role", JSON.stringify("premium")) });
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, "#/database");
  const premLinks = await page.locator(".db-links a.db-link").evaluateAll(els => els.map(a => { const b = a.getBoundingClientRect(); return { href: a.getAttribute("href"), text: a.textContent.replace(/\s+/g," ").trim(), h: b.height, w: b.width, x: b.x, y: b.y, r: b.right }; }));
  ok(premLinks.length === 4 && premLinks.map(l => l.href).join(" ") === "#/identify #/map #/search #/add", "demo: premium database tools add an Add a sled tile");
  ok(premLinks.every(l => l.h >= 44 && l.w >= 80 && l.x >= 0 && l.r <= 391), "demo: all four database tiles fit a 390px iPhone width and are at least 44px tall");
  const rows = [...new Set(premLinks.map(l => Math.round(l.y)))];
  ok(rows.length === 2 && premLinks.filter(l => Math.round(l.y) === rows[0]).length === 2 && premLinks.filter(l => Math.round(l.y) === rows[1]).length === 2, "demo: database tiles lay out in a 2x2 grid on a 390px screen");
  await page.setViewportSize({ width: 420, height: 900 });
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
  for (const t of ["Ski Sled","Steerable Sled","Cutter","Clipper","Sleigh","Tri-Runner"]) {
    ok(await page.locator(`#addf [name=sledType] option[value="${t}"]`).count() === 1, `demo: ${t} is a sled type on the add form`);
  }
  // Photo picker: large always-visible ✕, undo toast (no native confirm), cover promotion, persists on save
  const help = await page.textContent("#addpk .pk-help");
  ok(/✕/.test(help) && /cover/i.test(help), "demo: photo hint mentions the cover and the ✕");
  await page.click("#addpk .pk-demo"); await page.click("#addpk .pk-demo"); await page.click("#addpk .pk-demo");
  ok(await page.locator("#addpk .pk-t").count() === 3 && await page.locator("#addpk .pk-x").count() === 3, "demo: three thumbnails each have a delete control");
  const xBox = await page.locator("#addpk .pk-x").first().boundingBox();
  ok(xBox && xBox.width >= 32 && xBox.height >= 32, "demo: photo delete control is at least 32px");
  ok(await page.locator("#addpk .pk-t").first().locator(".pk-cover").count() === 1, "demo: first photo shows the cover badge");
  const bgs = await page.$$eval("#addpk .pk-t", els => els.map(e => e.style.backgroundImage));
  await page.locator("#addpk .pk-t").first().locator(".pk-x").click();
  const afterCoverDel = await page.$$eval("#addpk .pk-t", els => els.map(e => e.style.backgroundImage));
  ok(afterCoverDel.length === 2 && afterCoverDel[0] === bgs[1] && afterCoverDel[1] === bgs[2], "demo: deleting the cover promotes the next photo");
  ok((await page.textContent("#toast")).includes("Photo removed") && await page.locator("#toast .toast-act").count() === 1, "demo: delete shows an Undo toast, not a native confirm");
  await page.click("#toast .toast-act");
  const afterUndo = await page.$$eval("#addpk .pk-t", els => els.map(e => e.style.backgroundImage));
  ok(afterUndo.length === 3 && afterUndo[0] === bgs[0] && afterUndo[1] === bgs[1], "demo: Undo restores the removed cover photo");
  await page.locator("#addpk .pk-t").first().locator(".pk-x").click();
  const afterRedo = await page.$$eval("#addpk .pk-t", els => els.map(e => e.style.backgroundImage));
  ok(afterRedo.length === 2 && afterRedo[0] === bgs[1], "demo: deleting the cover again after Undo still promotes the next photo");
  ok(await page.locator("#addpk .pk-t").first().locator(".pk-cover").count() === 1, "demo: new first photo keeps the cover badge");
  const coverBg = afterCoverDel[0];
  await page.locator("#addpk .pk-t").nth(1).locator(".pk-x").click();
  const afterNonCover = await page.$$eval("#addpk .pk-t", els => els.map(e => e.style.backgroundImage));
  ok(afterNonCover.length === 1 && afterNonCover[0] === coverBg, "demo: deleting a non-cover photo does not change the cover");
  await page.fill("#addf [name=model]", "Photo Delete Flyer");
  await page.check("#addf input[name=locType][value=na]");
  await page.check("#addf [name=ack]");
  await page.click("#addf button[type=submit]"); await page.waitForTimeout(900);
  const saved = ((await ls(page, "sleds")) || []).find(s => s.model === "Photo Delete Flyer");
  ok(saved && saved.imgs && saved.imgs.length === 1, "demo: remaining photo is saved with the sled");
  await go(page, "#/edit/" + saved.id); await page.waitForSelector("#addpk .pk-t");
  ok(await page.locator("#addpk .pk-t").count() === 1, "demo: edit form loads the saved photo");
  await page.click("#addpk .pk-demo");
  ok(await page.locator("#addpk .pk-t").count() === 2, "demo: a second photo can be added when editing");
  const keepFile = await page.evaluate(() => {
    const el = document.querySelectorAll("#addpk .pk-t")[1];
    const u = (el.style.backgroundImage || "").replace(/^url\(["']?/, "").replace(/["']?\)$/, "");
    return u.split("/").pop();
  });
  await page.locator("#addpk .pk-t").first().locator(".pk-x").click();
  await page.check("#addf [name=ack]");
  await page.click("#addf button[type=submit]"); await page.waitForTimeout(900);
  const saved2 = ((await ls(page, "sleds")) || []).find(s => s.model === "Photo Delete Flyer");
  ok(saved2 && saved2.imgs && saved2.imgs.length === 1 && String(saved2.imgs[0]).includes(keepFile), "demo: deleting a photo on edit persists after save");
  await go(page, "#/sale");
  const sale = await page.textContent("#view");
  ok(sale.includes("Post a sled for sale") && !sale.includes("Sleds for Sale is for members"), "demo: premium can browse sale listings");
  const typef = await page.locator("#typef").textContent();
  ok(typef.includes("Flexy Racer"), "demo: sale type filter includes Flexy Racer");
  for (const t of ["Ski Sled","Steerable Sled","Cutter","Clipper","Sleigh","Tri-Runner"]) {
    ok(typef.includes(t), `demo: sale type filter includes ${t}`);
  }
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

// Android TWA: no Stripe checkout / Join Premium CTA (Play Payments policy).
{
  const { ctx, page, errors } = await device(true);
  await page.goto(BASE + "?src=twa#/upgrade"); await page.waitForTimeout(800);
  const up = await page.textContent("#view");
  ok(await page.locator("#joinP").count() === 0, "twa: no Join Premium checkout button");
  ok(/does not sell memberships/.test(up) && !/Secure checkout by Stripe/.test(up) && !/Sign in to join/.test(up), "twa: upgrade page explains website signup with no Stripe checkout");
  ok(await page.locator('a[href="#/account"]').count() > 0, "twa: signed-out users can still sign in");
  ok(await page.evaluate(() => !!(window.SF_isAndroidTwa && window.SF_isAndroidTwa())), "twa: ?src=twa is detected");
  // Flag persists after the query string is gone (hash navigations).
  await go(page, "#/home");
  await go(page, "#/upgrade");
  ok(await page.locator("#joinP").count() === 0 && await page.evaluate(() => window.SF_isAndroidTwa()), "twa: detection survives in-app navigation");
  ok(!errors.length, "twa: no JS errors " + JSON.stringify(errors));
  await ctx.close();
}

// iOS App Store wrapper (?src=ios): no prices, Join/Upgrade buttons or Stripe checkout (guideline 3.1.1).
{
  const { ctx, page, errors } = await device(true);
  await page.goto(BASE + "?src=ios#/upgrade"); await page.waitForTimeout(800);
  const up = await page.textContent("#view");
  ok(await page.locator("#joinP").count() === 0 && !/\$15/.test(up) && !/Secure checkout|Stripe|website/i.test(up), "ios: upgrade page has no price, Stripe or website pointer");
  ok(/does not sell memberships/.test(up) && await page.locator('a[href="#/account"]').count() > 0, "ios: upgrade page explains and offers sign-in");
  ok(await page.evaluate(() => window.SF_isIosApp() && window.SF_isAndroidTwa()), "ios: ?src=ios is detected");
  for (const h of ["#/home", "#/maker/25", "#/makers", "#/map", "#/identify", "#/database", "#/articles", "#/add", "#/profile"]) {
    await go(page, h);
    const t = await page.textContent("#view"), bar = await page.textContent("#appbar");
    const ctas = await page.locator('#view a.btn[href="#/upgrade"], #view a.promo[href="#/upgrade"], #view a.nudge[href="#/upgrade"]').count();
    ok(!/\$15/.test(t + bar) && ctas === 0 && !/checkout\.stripe|buy\.stripe/.test(await page.innerHTML("#view")), "ios: no price or upgrade CTA on " + h);
  }
  ok(await page.evaluate(() => window.SF_isIosApp()), "ios: detection survives in-app navigation");
  ok(!errors.length, "ios: no JS errors " + JSON.stringify(errors));
  await ctx.close();
}
// Password sign-in (App Store review demo account).
{
  const { ctx, page, errors } = await device(true);
  await page.goto(BASE + "?src=ios#/account"); await page.waitForTimeout(800);
  await page.click("#pwbox summary");
  await page.fill('#pwf input[name="email"]', "reviewer@example.test"); await page.fill('#pwf input[name="password"]', "wrong");
  await page.click('#pwf button'); await page.waitForTimeout(600);
  ok(await page.evaluate(() => !SFCloud.user), "password: wrong password does not sign in");
  await page.fill('#pwf input[name="password"]', "review-pass-1"); await page.click('#pwf button'); await page.waitForTimeout(1200);
  ok(await page.evaluate(() => !!SFCloud.user && SFCloud.email() === "reviewer@example.test"), "password: correct password signs in");
  ok(!errors.length, "password: no JS errors " + JSON.stringify(errors));
  await ctx.close();
}
// Plain web still shows the paywall price.
{
  const { ctx, page } = await device(true);
  await page.goto(BASE + "#/upgrade"); await page.waitForTimeout(800);
  ok(/\$15/.test(await page.textContent("#view")) && !(await page.evaluate(() => window.SF_isIosApp())), "web: upgrade page still shows the price");
  await ctx.close();
}

// ════════ iPhone WebKit: tap ✕, photo disappears and stays gone after save ════════
{
  let wk = null;
  try { wk = await webkit.launch(); } catch (e) { ok(false, "webkit: could not launch (" + (e && e.message || e) + ")"); }
  if (wk) {
    const iPhone = devices["iPhone 13"];
    const ctx = await wk.newContext({ ...iPhone });
    await ctx.route("**/config.js*", r => r.fulfill({ contentType: "application/javascript", body: `window.SF_CONFIG={SUPABASE_URL:"",SUPABASE_ANON_KEY:"",STRIPE_CHECKOUT:false,STRIPE_PAYMENT_LINK:"",STRIPE_PORTAL_LINK:"",SHOW_SAMPLE_DATA:true};` }));
    await ctx.route(/nominatim|photon|geocod|rosebudsledmuseum\.com|events\.json/i, r => r.fulfill({ status: 404, body: "" }));
    const errors = [];
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", d => { errors.push("unexpected native dialog: " + d.message()); d.dismiss(); });
    await page.goto(BASE + "#/home"); await page.waitForTimeout(800);
    await page.evaluate(() => { localStorage.setItem("svc_role", JSON.stringify("premium")); });
    await go(page, "#/add"); await page.waitForSelector("#addpk .pk-demo");
    await page.locator("#addpk .pk-demo").tap();
    await page.locator("#addpk .pk-demo").tap();
    ok(await page.locator("#addpk .pk-t").count() === 2, "webkit iPhone: two demo photos appear");
    const bgs = await page.$$eval("#addpk .pk-t", els => els.map(e => e.style.backgroundImage));
    await page.locator("#addpk .pk-t").first().locator(".pk-x").tap();
    const after = await page.$$eval("#addpk .pk-t", els => els.map(e => e.style.backgroundImage));
    ok(after.length === 1 && after[0] === bgs[1], "webkit iPhone: tapping ✕ removes the cover and promotes the next photo, no confirm dialog");
    ok(await page.locator("#addpk .pk-t").first().locator(".pk-cover").count() === 1, "webkit iPhone: remaining photo shows the cover badge");
    ok((await page.textContent("#toast")).includes("Photo removed"), "webkit iPhone: Undo toast appears after delete");
    await page.fill("#addf [name=model]", "iPhone Delete Flyer");
    await page.check("#addf input[name=locType][value=na]");
    await page.check("#addf [name=ack]");
    await page.locator("#addf button[type=submit]").tap(); await page.waitForTimeout(900);
    const saved = ((await ls(page, "sleds")) || []).find(s => s.model === "iPhone Delete Flyer");
    ok(saved && saved.imgs && saved.imgs.length === 1, "webkit iPhone: remaining photo is saved with the new sled");
    await go(page, "#/edit/" + saved.id); await page.waitForSelector("#addpk .pk-t");
    ok(await page.locator("#addpk .pk-t").count() === 1, "webkit iPhone: edit form loads the one saved photo");
    await page.locator("#addpk .pk-demo").tap();
    ok(await page.locator("#addpk .pk-t").count() === 2, "webkit iPhone: a second photo can be added when editing");
    const keepFile = await page.evaluate(() => {
      const el = document.querySelectorAll("#addpk .pk-t")[1];
      const u = (el.style.backgroundImage || "").replace(/^url\(["']?/, "").replace(/["']?\)$/, "");
      return u.split("/").pop();
    });
    await page.locator("#addpk .pk-t").first().locator(".pk-x").tap();
    ok(await page.locator("#addpk .pk-t").count() === 1, "webkit iPhone: tapping ✕ on the cover while editing removes it");
    await page.check("#addf [name=ack]");
    await page.locator("#addf button[type=submit]").tap(); await page.waitForTimeout(900);
    const saved2 = ((await ls(page, "sleds")) || []).find(s => s.model === "iPhone Delete Flyer");
    ok(saved2 && saved2.imgs && saved2.imgs.length === 1 && String(saved2.imgs[0]).includes(keepFile), "webkit iPhone: deletion on an existing sled persists after save");
    ok(errors.length === 0, "webkit iPhone: no JS errors or native dialogs " + JSON.stringify(errors));
    await ctx.close(); await wk.close();
  }
}

// ════════ limited-time free access promo ════════
{
  const { ctx, page, errors } = await device(false, null, { FREE_ACCESS_PROMO: true });
  await go(page, "#/home");
  const home = await page.textContent("#view");
  ok(home.includes("Free for a limited time"), "demo promo: banner is shown");
  ok(!home.includes("The Sled Maker and Model Database is for members"), "demo promo: database members gate is hidden");
  ok(!home.includes("Become a member"), "demo promo: Become a member card is hidden");
  ok(await page.locator(".db-links .db-link").count() === 4, "demo promo: all four database tiles including Add a sled");
  ok(!(await page.locator(".db-links").textContent()).includes("🔒"), "demo promo: Photo ID and Map have no lock");
  await go(page, "#/add");
  ok(await page.locator("#addf").count() === 1, "demo promo: free (no account) can open the add-sled form");
  await go(page, "#/map");
  ok(!(await page.textContent("#view")).includes("Preview · members can use the map"), "demo promo: map is unlocked");
  ok(!errors.length, "demo promo: no JS errors " + JSON.stringify(errors));
  await ctx.close();
}

FREE_PROMO = true;
{
  const friendId = crypto.randomUUID();
  S.users[friendId] = { id: friendId, email: "friend@example.test" };
  S.profiles[friendId] = { id: friendId, handle: "friend_col", display_name: "Friend", is_admin: false, premium_until: new Date(Date.now() + 365 * 864e5).toISOString(), created_at: new Date().toISOString() };
  S.sleds.push({ id: crypto.randomUUID(), owner: friendId, client_id: "c-promo-friend", model: "Promo Clipper", shared: true, deleted_at: null, photos: ["https://example/s.jpg"], owner_handle: "friend_col", updated_at: new Date().toISOString() });
  const { ctx, page, errors } = await device(true, null, { FREE_ACCESS_PROMO: true });
  const p = page;
  const home = await p.textContent("#view");
  ok(home.includes("Free for a limited time"), "live promo: signed-out visitor sees the banner");
  ok(!home.includes("The Sled Maker and Model Database is for members"), "live promo: signed-out visitor is not shown the members gate");
  ok(!home.includes("Become a member"), "live promo: Become a member card is hidden");
  ok(await p.locator(".db-links .db-link").count() === 4, "live promo: signed-out visitor sees Add a sled tile");
  ok(!(await p.locator(".db-links").textContent()).includes("🔒"), "live promo: Photo ID and Map have no lock");
  ok(home.includes("Promo Clipper"), "live promo: signed-out visitor can see another collector's shared sled");
  await go(p, "#/add");
  const addTxt = await p.textContent("#view");
  ok(addTxt.includes("Sign in to add a sled") && !addTxt.includes("Posting sleds is for members"), "live promo: signed-out add shows sign-in gate, not membership gate");
  await go(p, "#/photos");
  ok((await p.textContent("#view")).includes("Community photos are for members"), "live promo: community photos stay members-only");
  await go(p, "#/article/ex-one");
  ok((await p.textContent("#view")).includes("Join to read") && !(await p.textContent("#view")).includes("Secret exclusive body."), "live promo: exclusive articles stay members-only");
  await go(p, "#/account"); await p.fill("#signf [name=email]", "promo.friend@example.test"); await p.click("#signf button"); await p.waitForTimeout(400);
  await p.fill("#codef [name=code]", "123456"); await p.click("#codef button[type=submit]"); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => !!SFCloud.user && SFCloud.realRole() === "free" && SFCloud.freeAccessPromo === true), "live promo: signed in as free with promo on");
  const before = S.sleds.length;
  await addSled(p, "Free Friend Flyer", true);
  ok(S.sleds.some(s => s.model === "Free Friend Flyer" && s.shared && s.owner), "live promo: signed-in free account can upload a shared sled");
  ok(((await ls(p, "outbox")) || []).length === 0, "live promo: uploaded sled is not left in the outbox");
  ok(S.sleds.length === before + 1, "live promo: one new sled row was saved");
  await go(p, "#/timeline");
  ok((await p.textContent("#view")).includes("The full timeline is part of Premium") || (await p.textContent("#view")).includes("Preview · Premium"), "live promo: timeline stays members-only");
  ok(!errors.length, "live promo: no JS errors " + JSON.stringify(errors));
  await ctx.close();
}
// ════════ Report & Block (guideline 1.2) ════════
{
  const badId = crypto.randomUUID(), badRow = crypto.randomUUID();
  S.users[badId] = { id: badId, email: "bad@example.test" };
  S.profiles[badId] = { id: badId, handle: "bad_actor", display_name: "", is_admin: false, premium_until: null, created_at: new Date().toISOString() };
  S.sleds.push({ id: badRow, owner: badId, client_id: "u-bad", model: "Rude Runner", shared: true, deleted_at: null, photos: ["https://example/b.jpg"], owner_handle: "bad_actor", updated_at: new Date().toISOString() });
  // 1) Before the migration: report falls back to the feedback form, block is kept on the phone.
  RB = false;
  const A = await device(true, null, { FREE_ACCESS_PROMO: true }); const p = A.page;
  await go(p, "#/account"); await p.fill("#signf [name=email]", "reporter@example.test"); await p.click("#signf button"); await p.waitForTimeout(400);
  await p.fill("#codef [name=code]", "123456"); await p.click("#codef button[type=submit]"); await p.waitForTimeout(1500);
  await go(p, "#/sled/c" + badRow); await p.waitForTimeout(300);
  ok(await p.locator('[data-report="sled"]').count() === 1 && await p.locator('[data-blockh="bad_actor"]').count() === 1, "report: shared sled shows Report and Block");
  const formsBefore = FORM_POSTS.length;
  await p.click('[data-report="sled"]'); await p.selectOption("#repf [name=reason]", "abusive"); await p.fill("#repf [name=details]", "Rude caption"); await p.click("#repf button[type=submit]"); await p.waitForTimeout(800);
  ok(await p.locator("#sheet").count() === 0 && REPORTS.length === 0, "report: without the migration nothing is stored and the sheet closes");
  ok(FORM_POSTS.length === formsBefore + 1 && /REPORT/.test(decodeURIComponent(FORM_POSTS[FORM_POSTS.length - 1])), "report: forwarded to the developer's feedback form");
  await p.click('[data-blockh="bad_actor"]'); await p.click("#blky"); await p.waitForTimeout(600);
  await go(p, "#/database"); await p.waitForTimeout(300);
  ok(!(await p.textContent("#view")).includes("Rude Runner"), "block: blocked member's sled is hidden (local block)");
  await go(p, "#/blocked");
  ok((await p.textContent("#view")).includes("@bad_actor"), "block: listed under Blocked users");
  await p.click('[data-uh="bad_actor"]'); await p.waitForTimeout(400);
  await go(p, "#/database"); await p.waitForTimeout(300);
  ok((await p.textContent("#view")).includes("Rude Runner"), "block: unblock shows the sled again");
  ok(!A.errors.length, "report/block (no migration): no JS errors " + JSON.stringify(A.errors));
  // 2) After the migration: report is stored, block syncs to the server.
  RB = true;
  await go(p, "#/sled/c" + badRow);
  await p.click('[data-report="sled"]'); await p.selectOption("#repf [name=reason]", "spam"); await p.check("#repf [name=block]"); await p.click("#repf button[type=submit]"); await p.waitForTimeout(1000);
  const rep = REPORTS[0] || {};
  ok(REPORTS.length === 1 && rep.kind === "sled" && rep.target_id === badRow && rep.reason === "spam" && rep.target_owner === badId, "report: stored in content_reports after the migration");
  ok(BLOCKS.some(b => b.blocked === badId), "block: 'also block' saved to user_blocks");
  await go(p, "#/database"); await p.waitForTimeout(300);
  ok(!(await p.textContent("#view")).includes("Rude Runner"), "block: hidden after report + block");
  await A.ctx.close();
  // 3) Admin hides the reported sled for everyone.
  const adminId = crypto.randomUUID();
  S.users[adminId] = { id: adminId, email: "admin-mod@example.test" };
  S.profiles[adminId] = { id: adminId, handle: "sf_admin", display_name: "", is_admin: true, premium_until: null, created_at: new Date().toISOString() };
  const B = await device(true, null, { FREE_ACCESS_PROMO: true }); const q = B.page;
  await go(q, "#/account"); await q.fill("#signf [name=email]", "admin-mod@example.test"); await q.click("#signf button"); await q.waitForTimeout(400);
  await q.fill("#codef [name=code]", "123456"); await q.click("#codef button[type=submit]"); await q.waitForTimeout(1500);
  await go(q, "#/profile");
  ok(await q.locator('a[href="#/reports"]').count() === 1, "admin: Reports link in the profile menu");
  await go(q, "#/reports"); await q.waitForTimeout(800);
  ok((await q.textContent("#view")).includes("Spam or advertising"), "admin: open report is listed");
  await q.click('[data-mod="hide"]'); await q.waitForTimeout(1200);
  ok(S.sleds.find(r => r.id === badRow).hidden_by_admin === true && REPORTS[0].status === "hidden", "admin: Hide for everyone hides the sled and closes the report");
  ok(!B.errors.length, "admin moderation: no JS errors " + JSON.stringify(B.errors));
  await B.ctx.close();
  const C = await device(true, null, { FREE_ACCESS_PROMO: true });
  await go(C.page, "#/database"); await C.page.waitForTimeout(300);
  ok(!(await C.page.textContent("#view")).includes("Rude Runner"), "hidden: signed-out visitors no longer see the hidden sled");
  await C.ctx.close();
  // 4) iOS app: Photo ID and the demo map are hidden; the web keeps them.
  const I = await device(true, null, { FREE_ACCESS_PROMO: true });
  await I.page.goto(BASE + "?src=ios#/home"); await I.page.waitForTimeout(800);
  for (const h of ["#/home", "#/database", "#/add", "#/profile"]) { await go(I.page, h); ok(await I.page.locator('#view a[href="#/identify"], #view a[href="#/map"]').count() === 0, "ios: no Photo ID or Map link on " + h) }
  await go(I.page, "#/identify"); await I.page.waitForTimeout(300);
  ok(await I.page.evaluate(() => location.hash) === "#/database", "ios: #/identify redirects to the database");
  await go(I.page, "#/map"); await I.page.waitForTimeout(300);
  ok(await I.page.evaluate(() => location.hash) === "#/database", "ios: #/map redirects to the database");
  ok(await I.page.locator('#tabbar a[href="#/identify"], #tabbar a[href="#/map"]').count() === 0, "ios: no Photo ID or Map in the bottom bar");
  ok(!I.errors.length, "ios hide: no JS errors " + JSON.stringify(I.errors));
  await I.ctx.close();
  const W = await device(true, null, { FREE_ACCESS_PROMO: true });
  await go(W.page, "#/database");
  ok(await W.page.locator('#view a[href="#/identify"]').count() >= 1 && await W.page.locator('#view a[href="#/map"]').count() >= 1, "web: Photo ID and Map links are unchanged");
  await go(W.page, "#/map"); await W.page.waitForTimeout(300);
  ok(await W.page.evaluate(() => location.hash) === "#/map", "web: map route still works");
  await W.ctx.close();
  RB = false;
}
FREE_PROMO = false;

await browser.close(); srv.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
