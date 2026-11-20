import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

export function serviceDb(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

export async function requireUser(req: Request) {
  if (req.method === "OPTIONS") return { preflight: new Response("ok", { headers: cors }) };
  if (req.method !== "POST") return { error: json({ error: "POST only" }, 405) };
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const db = serviceDb();
  const { data: who, error } = await db.auth.getUser(jwt);
  if (error || !who?.user) return { error: json({ error: "not signed in" }, 401) };
  return { db, user: who.user };
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const t = await req.text();
    if (!t) return {};
    const v = JSON.parse(t);
    return v && typeof v === "object" ? v as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
