import { supabase } from "./supabaseClient";

export interface AuthUser {
  id: string;
  name: string;
  role: string;
  email: string;
  isAdmin: boolean;
  /** Route paths this staff member can see, e.g. ["/booking", "/checkout"]. Ignored when isAdmin is true. */
  allowedPages: string[];
}

const SESSION_KEY = "navana_session";

// Supabase Auth requires an email+password identity. Staff log in with just
// a phone number, so each staff member additionally gets a synthetic,
// never-shown "login email" derived deterministically from their phone —
// this lets every request also carry a real Supabase Auth session (so RLS
// policies can eventually require `authenticated`, instead of leaving every
// table open to the public anon key). See docs/AUTH_MIGRATION.md.
function authEmailForPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `staff-${digits}@navana-rest-house.internal`;
}

// Restored synchronously from localStorage on module load, so isLoggedIn()/getCurrentUser()
// work immediately (no flicker) without waiting on a Supabase round-trip.
// Guarded for SSR, where `window`/`localStorage` don't exist.
function readSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let cachedUser: AuthUser | null = readSession();

export function getCurrentUser(): AuthUser | null {
  return cachedUser;
}

export function isLoggedIn(): boolean {
  return cachedUser !== null;
}

export async function login(
  phone: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("staff_login", {
    input_phone: phone.trim(),
    input_password: password,
  });

  if (error) {
    console.error("login failed:", error.message);
    return { success: false, error: "একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।" };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { success: false, error: "Mobile Number অথবা Password ভুল।" };
  }

  // Also sign in with real Supabase Auth, using the same phone+password.
  // This is intentionally non-blocking: until every staff member has a
  // matching Auth account created (a one-time setup step in the Supabase
  // dashboard), this call will fail for them and we simply fall back to the
  // app-level session below, exactly like before. Nothing breaks either way.
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: authEmailForPhone(phone.trim()),
    password,
  });
  if (authError) {
    console.warn(
      "Supabase Auth sign-in not set up yet for this staff member (app-level login still works):",
      authError.message,
    );
  }

  const user: AuthUser = {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    isAdmin: !!row.is_admin,
    allowedPages: row.allowed_pages || [],
  };

  cachedUser = user;
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  refreshAuth();
  return { success: true };
}

export function logout() {
  cachedUser = null;
  localStorage.removeItem(SESSION_KEY);
  refreshAuth();
  void supabase.auth.signOut();
}

export function refreshAuth() {
  window.dispatchEvent(new Event("authUpdated"));
}

// ---------------- Page permissions ----------------

export const APP_PAGES: { path: string; label: string }[] = [
  { path: "/", label: "Dashboard" },
  { path: "/booking", label: "Booking" },
  { path: "/checkout", label: "Check Out" },
  { path: "/customers", label: "Customer Information" },
  { path: "/rooms", label: "Rooms" },
  { path: "/expenses", label: "Expenses" },
  { path: "/reports", label: "Reports" },
  { path: "/inventory", label: "Inventory" },
  { path: "/settings", label: "Settings" },
];

export function canAccess(user: AuthUser | null, path: string): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  return user.allowedPages.includes(path);
}

// Where to send someone right after login (or if they land on a page they
// can't see). Returns null only if a non-admin has literally no pages
// assigned yet — an admin should fix that from Settings.
export function landingPageFor(user: AuthUser): string | null {
  if (user.isAdmin) return "/";
  if (user.allowedPages.includes("/")) return "/";
  return user.allowedPages[0] || null;
}

// ---------------- Staff login credentials (Settings → Users & Roles) ----------------
// Both phone and password are optional here — pass only what you want to change.
// (Backed by set_staff_credentials(), which keeps the existing value for
// whichever of the two is left out.)

export async function setStaffCredentials(staffId: string, phone?: string, password?: string) {
  const { error } = await supabase.rpc("set_staff_credentials", {
    p_staff_id: staffId,
    p_phone: phone || null,
    p_password: password || null,
  });
  if (error) console.error("setStaffCredentials failed:", error.message);
}

export async function getStaffPhone(staffId: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_staff_phone", { p_staff_id: staffId });
  if (error) {
    console.error("getStaffPhone failed:", error.message);
    return "";
  }
  return data || "";
}
