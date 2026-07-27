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
}

const DEFAULT_STAFF: StaffMember[] = [
  { id: "u1", name: "Arif Rahman", role: "Administrator", email: "arif@navana.com", isAdmin: true },
  { id: "u2", name: "Sumaiya Khan", role: "Manager", email: "sumaiya@navana.com" },
  { id: "u3", name: "Rakib Hossain", role: "Receptionist", email: "rakib@navana.com" },
];

let cachedStaff: StaffMember[] = [...DEFAULT_STAFF];

function rowToStaff(row: any): StaffMember {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    isAdmin: row.is_admin || undefined,
  };
}

export function getStaff(): StaffMember[] {
  return cachedStaff;
}

export function addStaffMember(member: Omit<StaffMember, "id">): StaffMember {
  const newMember: StaffMember = { ...member, id: `u${Date.now()}` };
  cachedStaff = [...cachedStaff, newMember];
  refreshSettings();

  supabase
    .from("staff")
    .insert({
      id: newMember.id,
      name: newMember.name,
      role: newMember.role,
      email: newMember.email,
      is_admin: newMember.isAdmin || false,
    })
    .then(({ error }) => {
      if (error) console.error("addStaffMember failed:", error.message);
    });

  return newMember;
}

export function updateStaffMember(id: string, updates: Partial<StaffMember>) {
  cachedStaff = cachedStaff.map((s) => (s.id === id ? { ...s, ...updates } : s));
  refreshSettings();

  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.role !== undefined) dbUpdates.role = updates.role;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.isAdmin !== undefined) dbUpdates.is_admin = updates.isAdmin;

  supabase
    .from("staff")
    .update(dbUpdates)
    .eq("id", id)
    .then(({ error }) => {
      if (error) console.error("updateStaffMember failed:", error.message);
    });
}

export function deleteStaffMember(id: string) {
  cachedStaff = cachedStaff.filter((s) => s.id !== id);
  refreshSettings();

  supabase
    .from("staff")
    .delete()
    .eq("id", id)
    .then(({ error }) => {
      if (error) console.error("deleteStaffMember failed:", error.message);
    });
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
  if (error) console.error("setAdminPassword failed:", error.message);
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
  const [profileRes, prefsRes, staffRes] = await Promise.all([
    supabase.from("hotel_profile").select("*").eq("id", 1).maybeSingle(),
    supabase.from("notification_prefs").select("*").eq("id", 1).maybeSingle(),
    supabase.from("staff").select("*").order("name", { ascending: true }),
  ]);

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
  } else if (staffRes.data && staffRes.data.length > 0) {
    cachedStaff = staffRes.data.map(rowToStaff);
  }

  refreshSettings();
}

export function refreshSettings() {
  window.dispatchEvent(new Event("settingsUpdated"));
}
