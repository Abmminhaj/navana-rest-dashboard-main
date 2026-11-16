import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.",
  );
}

// Vite embeds this value in public JavaScript. Reject credentials that bypass RLS.
function isPublishableKey(key: string) {
  if (key.startsWith("sb_publishable_")) return true;
  try {
    const payload = key.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    return !!payload && JSON.parse(atob(payload)).role === "anon";
  } catch {
    return false;
  }
}

if (!isPublishableKey(supabaseAnonKey)) {
  throw new Error("VITE_SUPABASE_ANON_KEY must be a Supabase publishable or legacy anon key.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
