import { createClient } from "@supabase/supabase-js";

let cached: any = null;

export function createAdminClient() {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase admin environment variables");
  }

  cached = createClient(url, key, { auth: { persistSession: false } }) as any;
  return cached;
}
