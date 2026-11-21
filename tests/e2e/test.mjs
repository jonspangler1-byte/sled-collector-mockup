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
const S = { users: {}, profiles: {}, sleds: [], listings: [], photo_posts: [], comments: [], articles: [], uploads: [] };
const isPrem = uid => { const p = S.profiles[uid]; return !!p && (p.is_admin || (p.premium_until && Date.parse(p.premium_until) > Date.now())) };
const match = (r, f) => f.every(([op, c, v]) => op === "eq" ? r[c] === v : op === "neq" ? r[c] !== v : op === "is" ? (r[c] ?? null) === v : true);
function query(q) {
  const uid = q.uid;
  if (q.table === "profiles") {
    if (q.op === "select") { const rows = Object.values(S.profiles).filter(p => p.id === uid && match(p, q.filters)); return { data: q.single ? rows[0] || null : rows, error: null } }
    if (q.op === "update") { const p = S.profiles[uid]; if (!p) return { data: null, error: null }; if (Object.keys(q.row).some(k => k !== "handle" && k !== "display_name")) return { error: { message: "permission denied for table profiles" } };
      if (q.row.handle && Object.values(S.profiles).some(x => x.handle === q.row.handle && x.id !== uid)) return { error: { message: "duplicate key value violates unique constraint" } }; if (q.row.handle) p.handle = q.row.handle; if ("display_name" in q.row) p.display_name = q.row.display_name; [...S.sleds, ...S.listings, ...S.photo_posts, ...S.comments].filter(r => r.owner === uid).forEach(r => r.owner_handle = p.handle); return { data: null, error: null } }
  }
  const T = S[q.table];
  if (!T) return { data: q.op === "select" ? [] : null, error: q.op === "select" ? null : { message: "unknown table " + q.table } };
  const visible = r => {
    if (r.owner === uid) return true;
    if (q.table === "sleds") return r.shared && !r.deleted_at && isPrem(uid) && isPrem(r.owner);
    if (q.table === "listings") return r.status === "active" && !r.deleted_at && isPrem(uid) && isPrem(r.owner);
    if (q.table === "photo_posts" || q.table === "comments") return !r.deleted_at && isPrem(uid) && isPrem(r.owner);
    if (q.table === "articles") return r.published && isPrem(uid);
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
    Object.assign(r, q.row, { owner_handle: S.profiles[uid].handle, updated_at: new Date().toISOString() }); return { data: null, error: null };
  }
  if (q.op === "update") {
    const rows = T.filter(r => match(r, q.filters) && ((r.owner === uid && isPrem(uid)) || S.profiles[uid].is_admin));
    rows.forEach(r => Object.assign(r, q.row, { updated_at: new Date().toISOString() })); return { data: null, error: null };
  }
}
async function fakeOp(op, a) {
  if (op === "otp") return { error: null };
  if (op === "verify") { if (a.token !== "123456") return { error: { message: "Token has expired or is invalid" } };
    let u = Object.values(S.users).find(x => x.email === a.email);
    if (!u) { u = { id: crypto.randomUUID(), email: a.email }; S.users[u.id] = u; S.profiles[u.id] = { id: u.id, handle: "collector_" + u.id.replace(/-/g, "").slice(0, 8), display_name: "", is_admin: false, premium_until: null, created_at: new Date().toISOString() } }
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
    delete S.users[a.uid]; delete S.profiles[a.uid]; S.sleds = S.sleds.filter(r => r.owner !== a.uid); S.listings = S.listings.filter(r => r.owner !== a.uid); S.photo_posts = S.photo_posts.filter(r => r.owner !== a.uid); S.comments = S.comments.filter(r => r.owner !== a.uid);
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
  for (const h of ["#/home", "#/collection", "#/makers", "#/maker/1", "#/sale", "#/profile", "#/upgrade", "#/account", "#/map", "#/identify", "#/search", "#/suggest", "#/events", "#/ticket", "#/photos", "#/articles"]) { await go(page, h); }
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
  ok((await page.textContent("#view")).includes("Sleds for Sale is for members"), "demo: free user cannot browse sale listings");
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
  ok(art.includes("Exclusive Articles") && art.includes("throughout the year") && /Thanksgiving/.test(art) && art.includes("Vintage Runner Magazine"), "demo: Exclusive Articles are separate from the annual magazine");
  await go(page, "#/photos");
  ok((await page.textContent("#view")).includes("Post photos") && (await page.textContent("#view")).includes("Flexy Racer"), "demo: premium sees the community photo gallery");
  ok(await page.locator('a[href="https://rosebudsledmuseum.com/"]').count() > 0, "demo: Rosebud Sled Museum website link is in the app");
  ok(errors.length === 0, "demo: no JS errors " + (errors.length ? JSON.stringify(errors) : ""));
  await ctx.close();
}

// ════════ 2. Live mode ════════
const oldSled = { id: "u1700000000000", user: "you", userAdded: true, mine: true, likes: 0, maker: 1, brand: "", makerText: "", model: "Pre-account Flyer", years: "1920s", condition: "Good", size: "—", found: "barn", notes: "", shared: true, locType: "na", country: "US", town: "NA", imgs: [DATAPIC], img: DATAPIC };
const A = await device(true, { svc_sleds: [oldSled] });
{
  const p = A.page;
  ok(!(await p.title()).includes("mockup"), "live: title no longer says mockup");
  ok(await p.evaluate(() => window.SAMPLE_SLEDS.length === 0 && window.SALE_LISTINGS.length === 0), "live: sample collectors/ads hidden");
  ok(await p.locator("#viewAs").count() === 0, "live: signed-out user has no role switcher");
  await go(p, "#/add"); ok((await p.textContent("#view")).includes("members"), "live: signed out cannot add (members gate)");
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
  ok((await p.textContent("#view")).includes("Sleds for Sale is for members"), "live: signed-in free member cannot browse listings");
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
