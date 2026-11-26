// Test double for the slice of @supabase/supabase-js that cloud.js uses. Every call is forwarded to the
// Node test process (window.__fake), which keeps one shared "server" so several browser contexts act like
// several phones on the same account. Used only by tests/e2e/test.mjs.
(function () {
  const call = (op, args) => window.__fake(op, args);
  let session = null; const cbs = [];
  const KEY = "fake-session";
  try { session = JSON.parse(localStorage.getItem(KEY)) } catch (e) {}
  const fire = (evt) => cbs.forEach(cb => cb(evt, session));
  function builder(table) {
    const q = { table, op: "select", filters: [], row: null, opts: null, single: false };
    const b = {
      select() { return b }, eq(c, v) { q.filters.push(["eq", c, v]); return b }, neq(c, v) { q.filters.push(["neq", c, v]); return b },
      is(c, v) { q.filters.push(["is", c, v]); return b }, order() { return b }, limit() { return b },
      maybeSingle() { q.single = true; return b },
      update(row) { q.op = "update"; q.row = row; return b }, insert(row) { q.op = "insert"; q.row = row; return b }, upsert(row, opts) { q.op = "upsert"; q.row = row; q.opts = opts; return b }, delete() { q.op = "delete"; return b },
      then(res, rej) { return call("query", Object.assign({ uid: session && session.user.id }, q)).then(res, rej) },
    };
    return b;
  }
  window.supabase = { createClient() {
    return {
      auth: {
        async getSession() { return { data: { session } } },
        onAuthStateChange(cb) { cbs.push(cb); return { data: { subscription: { unsubscribe() {} } } } },
        async signInWithOtp({ email }) { return call("otp", { email }) },
        async verifyOtp({ email, token }) { const r = await call("verify", { email, token }); if (r.error) return r; session = r.data.session; localStorage.setItem(KEY, JSON.stringify(session)); setTimeout(() => fire("SIGNED_IN")); return r },
        async signInWithPassword({ email, password }) { const r = await call("password", { email, password }); if (r.error) return r; session = r.data.session; localStorage.setItem(KEY, JSON.stringify(session)); setTimeout(() => fire("SIGNED_IN")); return r },
        async signOut() { session = null; localStorage.removeItem(KEY); setTimeout(() => fire("SIGNED_OUT")); return { error: null } },
      },
      from: builder,
      async rpc(name, args) { return call("rpc", { name, args, uid: session && session.user.id }) },
      functions: { async invoke(name, opts) { const r = await call("fn", { name, uid: session && session.user.id, body: opts && opts.body }); return r } },
      storage: { from(bucket) { return {
        async upload(path, blob) { return call("upload", { path, uid: session && session.user.id, size: blob.size }) },
        getPublicUrl(path) { return { data: { publicUrl: "https://fake.supabase.co/storage/v1/object/public/" + bucket + "/" + path } } },
      } } },
    };
  } };
})();
