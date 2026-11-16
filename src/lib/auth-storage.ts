import { supabase } from "./supabaseClient";

export interface AuthUser {
  id: string;
  name: string;
  role: string;
  email: string;
  isAdmin: boolean;
  allowedPages: string[];
}

let cachedUser: AuthUser | null = null;
let updateVersion = 0;
let signingIn = false;

export function authEmailForPhone(phone: string) {
  return `staff-${phone.replace(/\D/g, "")}@navana-rest-house.internal`;
}

export function getCurrentUser(): AuthUser | null {
  return cachedUser;
}

export function isLoggedIn() {
  return cachedUser !== null;
}

function setCurrentUser(user: AuthUser | null) {
  cachedUser = user;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("authUpdated"));
}

async function loadStaffProfile(authUserId: string): Promise<AuthUser | null> {
  // RLS verifies the session and determines which staff profile can be read.
  const { data, error } = await supabase
    .from("staff")
    .select("id,name,role,email,is_admin,allowed_pages")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    role: data.role,
    email: data.email,
    isAdmin: data.is_admin === true,
    allowedPages: APP_PAGES.map(({ path }) => path).filter((path) => data.allowed_pages?.includes(path)),
  };
}

async function syncSession() {
  const version = ++updateVersion;
  try {
    const { data, error } = await supabase.auth.getSession();
    const user = !error && data.session ? await loadStaffProfile(data.session.user.id) : null;
    if (version === updateVersion) setCurrentUser(user);
  } catch {
    if (version === updateVersion) setCurrentUser(null);
  }
}

export function observeAuth() {
  try {
    window.localStorage.removeItem("navana_session");
  } catch {
    // The legacy cache is ignored even if browser storage is unavailable.
  }
  let timer: number | undefined;
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    window.clearTimeout(timer);
    if (event === "SIGNED_OUT") {
      updateVersion++;
      setCurrentUser(null);
    } else if (!signingIn) {
      // A Supabase method may take the same lock as this callback.
      timer = window.setTimeout(() => void syncSession(), 0);
    }
  });
  return () => {
    window.clearTimeout(timer);
    subscription.unsubscribe();
    updateVersion++;
  };
}

export async function login(
  phone: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  signingIn = true;
  const version = ++updateVersion;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmailForPhone(phone),
      password,
    });
    if (error || !data.session) {
      return { success: false, error: "Mobile Number অথবা Password ভুল।" };
    }
    const profile = await loadStaffProfile(data.user.id);
    if (!profile || version !== updateVersion) {
      await supabase.auth.signOut({ scope: "local" });
      return { success: false, error: "এই account-এর staff access পাওয়া যায়নি। Admin-কে জানান।" };
    }
    setCurrentUser(profile);
    return { success: true };
  } catch {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { success: false, error: "লগইন হয়নি। আবার চেষ্টা করুন।" };
  } finally {
    signingIn = false;
  }
}

export async function logout() {
  updateVersion++;
  setCurrentUser(null);
  await supabase.auth.signOut({ scope: "local" });
}

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

export function canAccess(user: AuthUser | null, path: string) {
  return !!user && (user.isAdmin || (path !== "/settings" && user.allowedPages.includes(path)));
}

export function landingPageFor(user: AuthUser): string | null {
  if (user.isAdmin || user.allowedPages.includes("/")) return "/";
  return user.allowedPages.find((path) => path !== "/settings") || null;
}

export async function getStaffPhone(staffId: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_staff_phone", { p_staff_id: staffId });
  if (error) return "";
  return data || "";
}
