import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

const projectUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://rosopvadrnadslohrjef.supabase.co";
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_ZEPohJMoyRbVdY2ryjOUbQ_ppDx3txU";

export function hasRemoteBackend() {
  return Boolean(projectUrl && publishableKey);
}

export function getSupabaseClient() {
  if (!hasRemoteBackend()) return null;
  if (browserClient) return browserClient;

  browserClient = createClient(
    projectUrl,
    publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
  return browserClient;
}
