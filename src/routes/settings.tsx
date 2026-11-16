import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Card,
  Field,
  PageHeader,
  SectionTitle,
  buttonGhost,
  buttonPrimary,
  inputClass,
  selectClass,
} from "@/components/ui-kit";
import { Building2, Users, Bell, Shield, Pencil, Trash2, Check, X, Plus } from "lucide-react";
import {
  getHotelProfile,
  saveHotelProfile,
  type HotelProfile,
  getNotificationPrefs,
  saveNotificationPrefs,
  type NotificationPrefs,
  getStaff,
  saveStaffMember,
  deleteStaffMember,
  type StaffMember,
  setAdminPassword,
} from "@/lib/settings-storage";
import {
  getNotificationPermission,
  requestNotificationPermission,
} from "@/lib/notification-engine";
import { APP_PAGES, authEmailForPhone, getStaffPhone } from "@/lib/auth-storage";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Navana Rest House" }] }),
  component: SettingsPage,
});

const NOTIFICATION_ITEMS: { key: keyof NotificationPrefs; label: string; desc: string }[] = [
  {
    key: "checkInAlerts",
    label: "Occupied room alerts",
    desc: "Instant notification when a room becomes occupied",
  },
  {
    key: "checkOutAlerts",
    label: "Check-out alerts",
    desc: "Instant notification when a guest checks out",
  },
  {
    key: "pendingCheckoutAlerts",
    label: "Pending checkout alerts",
    desc: "Notify 1 hour before expected checkout",
  },
  { key: "lowOccupancyAlerts", label: "Low occupancy alerts", desc: "Daily summary at 9:00 AM" },
  { key: "paymentReceivedAlerts", label: "Payment received alerts", desc: "Instant notification" },
  {
    key: "maintenanceReminders",
    label: "Maintenance reminders",
    desc: "Weekly room maintenance checklist",
  },
];

const STAFF_PAGES = APP_PAGES.filter(({ path }) => path !== "/settings");

function SettingsPage() {
  const [profile, setProfile] = useState<HotelProfile | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [editAllowedPages, setEditAllowedPages] = useState<string[]>([]);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("Receptionist");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteIsAdmin, setInviteIsAdmin] = useState(false);
  const [inviteAllowedPages, setInviteAllowedPages] = useState<string[]>([]);
  const [inviteError, setInviteError] = useState("");
  const [staffError, setStaffError] = useState("");

  useEffect(() => {
    function syncSettings() {
      setProfile(getHotelProfile());
      setPrefs(getNotificationPrefs());
      setStaff(getStaff());
    }
    syncSettings();
    setPermission(getNotificationPermission());
    window.addEventListener("settingsUpdated", syncSettings);
    return () => window.removeEventListener("settingsUpdated", syncSettings);
  }, []);

  async function handleEnableNotifications() {
    const result = await requestNotificationPermission();
    setPermission(result);
  }

  function handleProfileChange<K extends keyof HotelProfile>(key: K, value: HotelProfile[K]) {
    setProfile((p) => (p ? { ...p, [key]: value } : p));
    setProfileSaved(false);
  }

  function handleContactChange(index: number, value: string) {
    setProfile((p) => {
      if (!p) return p;
      const contactPhones = [...p.contactPhones];
      contactPhones[index] = value;
      return { ...p, contactPhones };
    });
    setProfileSaved(false);
  }

  function handleAddContact() {
    setProfile((p) => (p ? { ...p, contactPhones: [...p.contactPhones, ""] } : p));
    setProfileSaved(false);
  }

  function handleRemoveContact(index: number) {
    setProfile((p) => {
      if (!p) return p;
      if (p.contactPhones.length <= 1) return p;
      const contactPhones = p.contactPhones.filter((_, i) => i !== index);
      return { ...p, contactPhones };
    });
    setProfileSaved(false);
  }

  function handleSaveProfile() {
    if (!profile) return;
    const cleaned = profile.contactPhones.map((p) => p.trim()).filter(Boolean);
    const toSave: HotelProfile = { ...profile, contactPhones: cleaned.length > 0 ? cleaned : [""] };
    saveHotelProfile(toSave);
    setProfile(toSave);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  }

  function handleToggle(key: keyof NotificationPrefs) {
    setPrefs((p) => {
      if (!p) return p;
      const turningOn = !p[key];
      const updated = { ...p, [key]: turningOn };
      saveNotificationPrefs(updated);

      if (turningOn && permission === "default") {
        requestNotificationPermission().then(setPermission);
      }

      return updated;
    });
  }

  async function startEdit(member: StaffMember) {
    setEditingId(member.id);
    setEditName(member.name);
    setEditRole(member.role);
    setEditEmail(member.email);
    setEditIsAdmin(!!member.isAdmin);
    setEditAllowedPages(member.allowedPages || []);
    setStaffError("");
    setEditPhone(await getStaffPhone(member.id));
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    setStaffError("");
    try {
      await saveStaffMember(
        {
          id: editingId,
          name: editName.trim(),
          role: editRole.trim(),
          email: editEmail.trim(),
          isAdmin: editIsAdmin,
          allowedPages: editAllowedPages,
        },
        editPhone,
      );
      setEditingId(null);
    } catch {
      setStaffError("Staff update হয়নি। এই নম্বরের Auth account ও admin access যাচাই করুন।");
    }
  }

  async function handleDeleteStaff(id: string) {
    if (staff.length <= 1) {
      alert("অন্তত একজন Staff Member থাকতেই হবে।");
      return;
    }
    const target = staff.find((s) => s.id === id);
    if (target?.isAdmin && staff.filter((s) => s.isAdmin).length <= 1) {
      alert("অন্তত একজন Admin থাকতেই হবে।");
      return;
    }
    if (window.confirm("এই Staff Member-কে মুছে ফেলতে চান?")) {
      try {
        await deleteStaffMember(id);
      } catch {
        setStaffError("Staff access সরানো যায়নি। আপনি নিজের admin access সরাতে পারবেন না।");
      }
    }
  }

  async function handleInvite() {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteError("নাম আর Email দুটোই দিতে হবে।");
      return;
    }
    if (!/^\d{6,15}$/.test(invitePhone.replace(/\D/g, ""))) {
      setInviteError("সঠিক Mobile Number দিন।");
      return;
    }

    try {
      await saveStaffMember(
        {
          id: crypto.randomUUID(),
          name: inviteName.trim(),
          role: inviteRole,
          email: inviteEmail.trim(),
          isAdmin: inviteIsAdmin,
          allowedPages: inviteAllowedPages,
        },
        invitePhone,
      );
    } catch {
      setInviteError("Staff যোগ হয়নি। আগে এই নম্বরের confirmed Supabase Auth account তৈরি করুন।");
      return;
    }

    setShowInvite(false);
    setInviteName("");
    setInviteEmail("");
    setInviteRole("Receptionist");
    setInvitePhone("");
    setInviteIsAdmin(false);
    setInviteAllowedPages([]);
    setInviteError("");
  }

  async function handleSavePassword() {
    if (newPassword.length < 8 || newPassword.length > 256) {
      setPasswordMsg("৮ থেকে ২৫৬ ক্যারেক্টারের password দিন।");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg("দুটো Password মিলছে না।");
      return;
    }
    try {
      await setAdminPassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg("✓ Admin Password Update হয়েছে।");
    } catch {
      setPasswordMsg("Admin password update হয়নি। আবার চেষ্টা করুন।");
    }
  }

  if (!profile || !prefs) return null;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage hotel profile, users and system preferences."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle
            title="Hotel Profile"
            action={<Building2 className="h-4 w-4 text-muted-foreground" />}
          />
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            <Field label="Hotel Name">
              <input
                className={inputClass}
                value={profile.hotelName}
                onChange={(e) => handleProfileChange("hotelName", e.target.value)}
              />
            </Field>
            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Contact Number(s)
              </span>
              <div className="space-y-2">
                {profile.contactPhones.map((phone, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className={inputClass}
                      placeholder={`Contact Number ${i + 1}`}
                      value={phone}
                      onChange={(e) => handleContactChange(i, e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveContact(i)}
                      disabled={profile.contactPhones.length <= 1}
                      className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleAddContact}
                className={buttonGhost + " mt-2 h-8 px-3 text-xs"}
              >
                <Plus className="h-3.5 w-3.5" /> Add Contact Number
              </button>
            </div>
            <div className="md:col-span-2">
              <Field label="Address">
                <input
                  className={inputClass}
                  value={profile.address}
                  onChange={(e) => handleProfileChange("address", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Currency">
              <select
                className={selectClass}
                value={profile.currency}
                onChange={(e) => handleProfileChange("currency", e.target.value)}
              >
                <option>BDT (৳)</option>
                <option>USD ($)</option>
              </select>
            </Field>
            <Field label="Timezone">
              <select
                className={selectClass}
                value={profile.timezone}
                onChange={(e) => handleProfileChange("timezone", e.target.value)}
              >
                <option>Asia/Dhaka (GMT+6)</option>
              </select>
            </Field>
            <div className="md:col-span-2 flex items-center gap-3">
              <button className={buttonPrimary} onClick={handleSaveProfile}>
                Save Changes
              </button>
              {profileSaved && (
                <span className="text-xs font-semibold text-emerald-600">✓ Saved</span>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle
            title="Notifications"
            action={<Bell className="h-4 w-4 text-muted-foreground" />}
          />

          <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
            {permission === "granted" ? (
              <span className="text-xs font-semibold text-emerald-600">
                ✓ Browser Notifications চালু আছে
              </span>
            ) : permission === "denied" ? (
              <span className="text-xs font-semibold text-red-500">
                Browser-এ Notification Block করা আছে — Browser Settings থেকে Allow করতে হবে
              </span>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">
                  Real Notification পেতে Browser Permission দরকার
                </span>
                <button
                  onClick={handleEnableNotifications}
                  className={buttonPrimary + " h-8 px-3 text-xs"}
                >
                  Enable Notifications
                </button>
              </>
            )}
          </div>

          <ul className="divide-y divide-border">
            {NOTIFICATION_ITEMS.map((n) => (
              <li key={n.key} className="flex items-center justify-between px-6 py-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">{n.label}</div>
                  <div className="text-[11px] text-muted-foreground">{n.desc}</div>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={prefs[n.key]}
                    onChange={() => handleToggle(n.key)}
                    className="peer sr-only"
                  />
                  <div className="h-6 w-11 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-5" />
                </label>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionTitle
            title="Users & Roles"
            action={<Users className="h-4 w-4 text-muted-foreground" />}
          />
          {staffError && <p className="px-6 py-2 text-xs text-red-600">{staffError}</p>}
          <ul className="divide-y divide-border">
            {staff.map((u) => (
              <li key={u.id} className="px-6 py-3">
                {editingId === u.id ? (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                    <input
                      className={inputClass}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Name"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className={inputClass}
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        placeholder="Role"
                      />
                      <input
                        className={inputClass}
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="Email"
                      />
                    </div>

                    <div className="border-t border-border pt-2">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Login
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className={inputClass}
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          placeholder="Mobile Number"
                        />
                      </div>
                    </div>

                    <div className="border-t border-border pt-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <input
                          type="checkbox"
                          checked={editIsAdmin}
                          onChange={(e) => setEditIsAdmin(e.target.checked)}
                        />
                        Full Admin Access (সব Page দেখতে পারবে)
                      </label>
                    </div>

                    {!editIsAdmin && (
                      <div className="border-t border-border pt-2">
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          কোন কোন Page দেখতে পারবে
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {STAFF_PAGES.map((p) => (
                            <label
                              key={p.path}
                              className="flex items-center gap-1.5 text-xs text-foreground"
                            >
                              <input
                                type="checkbox"
                                checked={editAllowedPages.includes(p.path)}
                                onChange={() =>
                                  setEditAllowedPages((list) =>
                                    list.includes(p.path)
                                      ? list.filter((x) => x !== p.path)
                                      : [...list, p.path],
                                  )
                                }
                              />
                              {p.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setEditingId(null)}
                        className={buttonGhost + " h-8 px-3 text-xs"}
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        className={buttonPrimary + " h-8 px-3 text-xs"}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                      {u.name
                        .split(" ")
                        .map((p) => p[0])
                        .join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground">
                        {u.name}{" "}
                        {u.isAdmin && (
                          <span className="ml-1 text-[10px] font-semibold text-primary">(You)</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{u.email}</div>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
                      {u.role}
                    </span>
                    <button
                      onClick={() => startEdit(u)}
                      className="text-muted-foreground hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteStaff(u.id)}
                      className="text-muted-foreground hover:text-red-500"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="border-t border-border p-4">
            {showInvite ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <input
                  className={inputClass}
                  placeholder="Name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className={selectClass}
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                  >
                    <option>Administrator</option>
                    <option>Manager</option>
                    <option>Receptionist</option>
                  </select>
                  <input
                    className={inputClass}
                    placeholder="Email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>

                <div className="border-t border-border pt-2">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Login
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className={inputClass}
                      placeholder="Mobile Number"
                      value={invitePhone}
                      onChange={(e) => setInvitePhone(e.target.value)}
                    />
                  </div>
                  {invitePhone.replace(/\D/g, "") && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Supabase-এর Authentication → Users-এ এই login email দিয়ে confirmed user
                      তৈরি করুন: <code>{authEmailForPhone(invitePhone)}</code>
                    </p>
                  )}
                </div>

                <div className="border-t border-border pt-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <input
                      type="checkbox"
                      checked={inviteIsAdmin}
                      onChange={(e) => setInviteIsAdmin(e.target.checked)}
                    />
                    Full Admin Access (সব Page দেখতে পারবে)
                  </label>
                </div>

                {!inviteIsAdmin && (
                  <div className="border-t border-border pt-2">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      কোন কোন Page দেখতে পারবে
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {STAFF_PAGES.map((p) => (
                        <label
                          key={p.path}
                          className="flex items-center gap-1.5 text-xs text-foreground"
                        >
                          <input
                            type="checkbox"
                            checked={inviteAllowedPages.includes(p.path)}
                            onChange={() =>
                              setInviteAllowedPages((list) =>
                                list.includes(p.path)
                                  ? list.filter((x) => x !== p.path)
                                  : [...list, p.path],
                              )
                            }
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {inviteError && <p className="text-xs font-medium text-red-500">{inviteError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => {
                      setShowInvite(false);
                      setInviteError("");
                    }}
                    className={buttonGhost + " h-8 px-3 text-xs"}
                  >
                    Cancel
                  </button>
                  <button onClick={handleInvite} className={buttonPrimary + " h-8 px-3 text-xs"}>
                    Add Member
                  </button>
                </div>
              </div>
            ) : (
              <button className={buttonPrimary + " w-full"} onClick={() => setShowInvite(true)}>
                Add Staff Member
              </button>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle
            title="Security"
            action={<Shield className="h-4 w-4 text-muted-foreground" />}
          />
          <div className="space-y-4 p-6">
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              এটা Login Password থেকে আলাদা — এই Password শুধু Rooms Page-এ "Available → Occupied"
              Override করার জন্য ব্যবহার হয়। Staff-এর login password Supabase-এর Authentication
              থেকে পরিচালনা করুন।
            </div>
            <Field label="New Admin Password">
              <input
                type="password"
                className={inputClass}
                placeholder="New password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordMsg("");
                }}
              />
            </Field>
            <Field label="Confirm Password">
              <input
                type="password"
                className={inputClass}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPasswordMsg("");
                }}
              />
            </Field>
            {passwordMsg && (
              <p
                className={`text-xs ${passwordMsg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}
              >
                {passwordMsg}
              </p>
            )}
            <button onClick={handleSavePassword} className={buttonPrimary}>
              Update Admin Password
            </button>
            <div className="flex items-center justify-between rounded-xl border border-border p-4">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Two-factor authentication
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Add an extra layer of security
                </div>
              </div>
              <button className={buttonGhost + " h-8 px-3 text-xs"} disabled>
                Coming Soon
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
