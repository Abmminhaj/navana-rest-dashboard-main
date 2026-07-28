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

// Restored synchronously from localStorage on module load, so isLoggedIn()/getCurrentUser()
// work immediately (no flicker) without waiting on a Supabase round-trip.
let cachedUser: AuthUser | null = null;
try {
  const raw = localStorage.getItem(SESSION_KEY);
  if (raw) cachedUser = JSON.parse(raw);
} catch {
  cachedUser = null;
}

export function getCurrentUser(): AuthUser | null {
  return cachedUser;
}

export function isLoggedIn(): boolean {
  return cachedUser !== null;
}

export async function login(phone: string, password: string): Promise<{ success: boolean; error?: string }> {
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
}

export function refreshAuth() {
  window.dispatchEvent(new Event("authUpdated"));
}
