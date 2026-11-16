import { supabase } from "./supabaseClient";

// ============================================================
// Hotel Profile, Notification Prefs, and Staff are kept in an
// in-memory cache (populated once on app start by loadSettingsCache(),
// see routes/__root.tsx). This lets many components read them
// synchronously (e.g. print views) while Supabase stays the real
// source of truth in the background.
// ============================================================

// ---------------- Hotel Profile ----------------

export interface HotelProfile {
  hotelName: string;
  /** One or more contact numbers (Settings → Hotel Profile → Contact Numbers). */
  contactPhones: string[];
  address: string;
  currency: string;
  timezone: string;
}

const DEFAULT_PROFILE: HotelProfile = {
  hotelName: "Navana Rest House",
  contactPhones: ["+880 1711-000000"],
  address: "Kazi Roman Complex, Kalitola, Nilphamari Sadar, Nilphamari",
  currency: "BDT (৳)",
  timezone: "Asia/Dhaka (GMT+6)",
};

let cachedHotelProfile: HotelProfile = { ...DEFAULT_PROFILE };

export function getHotelProfile(): HotelProfile {
  return cachedHotelProfile;
}

export async function saveHotelProfile(profile: HotelProfile) {
  cachedHotelProfile = profile;
  refreshSettings();

  const { error } = await supabase.from("hotel_profile").upsert({
    id: 1,
    hotel_name: profile.hotelName,
    contact_phones: profile.contactPhones,
    address: profile.address,
    currency: profile.currency,
    timezone: profile.timezone,
  });
  if (error) console.error("saveHotelProfile failed:", error.message);
}

// ---------------- Notification Prefs ----------------

export interface NotificationPrefs {
  pendingCheckoutAlerts: boolean;
  lowOccupancyAlerts: boolean;
  paymentReceivedAlerts: boolean;
  maintenanceReminders: boolean;
  checkInAlerts: boolean;
  checkOutAlerts: boolean;
}

const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  pendingCheckoutAlerts: true,
  lowOccupancyAlerts: true,
  paymentReceivedAlerts: true,
  maintenanceReminders: false,
  checkInAlerts: true,
  checkOutAlerts: true,
};

let cachedNotificationPrefs: NotificationPrefs = { ...DEFAULT_NOTIFICATIONS };

export function getNotificationPrefs(): NotificationPrefs {
  return cachedNotificationPrefs;
}

export async function saveNotificationPrefs(prefs: NotificationPrefs) {
  cachedNotificationPrefs = prefs;
  refreshSettings();

  const { error } = await supabase.from("notification_prefs").upsert({
    id: 1,
    pending_checkout_alerts: prefs.pendingCheckoutAlerts,
    low_occupancy_alerts: prefs.lowOccupancyAlerts,
    payment_received_alerts: prefs.paymentReceivedAlerts,
    maintenance_reminders: prefs.maintenanceReminders,
    check_in_alerts: prefs.checkInAlerts,
    check_out_alerts: prefs.checkOutAlerts,
  });
  if (error) console.error("saveNotificationPrefs failed:", error.message);
}

// ---------------- Staff ----------------

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  email: string;
  isAdmin?: boolean;
  /** Route paths this staff member can see (ignored when isAdmin is true). */
  allowedPages: string[];
}

let cachedStaff: StaffMember[] = [];
let settingsVersion = 0;

function rowToStaff(row: any): StaffMember {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    isAdmin: row.is_admin || undefined,
    allowedPages: Array.isArray(row.allowed_pages) ? row.allowed_pages : [],
  };
}

export function getStaff(): StaffMember[] {
  return cachedStaff;
}

export async function saveStaffMember(member: StaffMember, phone: string) {
  const { error } = await supabase.rpc("save_staff_profile", {
    p_id: member.id,
    p_name: member.name,
    p_role: member.role,
    p_email: member.email,
    p_phone: phone,
    p_is_admin: !!member.isAdmin,
    p_allowed_pages: member.allowedPages,
  });
  if (error) throw error;
  cachedStaff = [...cachedStaff.filter((staff) => staff.id !== member.id), member].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  refreshSettings();
}

export async function deleteStaffMember(id: string) {
  const { error } = await supabase.from("staff").delete().eq("id", id).select("id").single();
  if (error) throw error;
  cachedStaff = cachedStaff.filter((s) => s.id !== id);
  refreshSettings();
}

// First name of the Administrator — used for the Dashboard's "Good morning, {name}" greeting
export function getAdminDisplayName(): string {
  const admin = cachedStaff.find((s) => s.isAdmin) || cachedStaff[0];
  return admin ? admin.name.split(" ")[0] : "Admin";
}

// Full name + initials of the Administrator — used in TopNav's profile pill
export function getAdminFullName(): string {
  const admin = cachedStaff.find((s) => s.isAdmin) || cachedStaff[0];
  return admin ? admin.name : "Admin";
}

// ---------------- Admin Password ----------------
// Kept OUT of the cache on purpose — this is the one sensitive value here.
// It's checked via Supabase functions (RPC) so the raw password is never
// sent to the browser, only a true/false answer.

export async function getAdminPasswordIsSet(): Promise<boolean> {
  const { data, error } = await supabase.rpc("admin_password_is_set");
  if (error) {
    console.error("getAdminPasswordIsSet failed:", error.message);
    return false;
  }
  return !!data;
}

export async function setAdminPassword(newPassword: string) {
  const { error } = await supabase.rpc("set_admin_password", { new_password: newPassword });
  if (error) throw error;
}

export async function verifyAdminPassword(input: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("verify_admin_password", { input });
  if (error) {
    console.error("verifyAdminPassword failed:", error.message);
    return false;
  }
  return !!data;
}

// ---------------- Cache bootstrap ----------------
// Called once from routes/__root.tsx when the app first loads.

export async function loadSettingsCache() {
  const version = ++settingsVersion;
  const [profileRes, prefsRes, staffRes] = await Promise.all([
    supabase.from("hotel_profile").select("*").eq("id", 1).maybeSingle(),
    supabase.from("notification_prefs").select("*").eq("id", 1).maybeSingle(),
    supabase.from("staff").select("id,name,role,email,is_admin,allowed_pages").order("name", { ascending: true }),
  ]);
  if (version !== settingsVersion) return;

  if (profileRes.error) {
    console.error("loadSettingsCache (hotel_profile) failed:", profileRes.error.message);
  } else if (profileRes.data) {
    const row: any = profileRes.data;
    cachedHotelProfile = {
      hotelName: row.hotel_name,
      contactPhones:
        Array.isArray(row.contact_phones) && row.contact_phones.length > 0
          ? row.contact_phones
          : [""],
      address: row.address || "",
      currency: row.currency || DEFAULT_PROFILE.currency,
      timezone: row.timezone || DEFAULT_PROFILE.timezone,
    };
  }

  if (prefsRes.error) {
    console.error("loadSettingsCache (notification_prefs) failed:", prefsRes.error.message);
  } else if (prefsRes.data) {
    const row: any = prefsRes.data;
    cachedNotificationPrefs = {
      pendingCheckoutAlerts: row.pending_checkout_alerts,
      lowOccupancyAlerts: row.low_occupancy_alerts,
      paymentReceivedAlerts: row.payment_received_alerts,
      maintenanceReminders: row.maintenance_reminders,
      checkInAlerts: row.check_in_alerts,
      checkOutAlerts: row.check_out_alerts,
    };
  }

  if (staffRes.error) {
    console.error("loadSettingsCache (staff) failed:", staffRes.error.message);
  } else if (staffRes.data) {
    cachedStaff = staffRes.data.map(rowToStaff);
  }

  refreshSettings();
}

export function clearSettingsCache() {
  settingsVersion++;
  cachedHotelProfile = { ...DEFAULT_PROFILE };
  cachedNotificationPrefs = { ...DEFAULT_NOTIFICATIONS };
  cachedStaff = [];
}

export function refreshSettings() {
  window.dispatchEvent(new Event("settingsUpdated"));
}
