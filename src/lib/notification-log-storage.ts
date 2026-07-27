import { supabase } from "./supabaseClient";

const MAX_ENTRIES = 50;

export interface NotificationLogEntry {
  id: string;
  title: string;
  body: string;
  time: string; // ISO timestamp
  read: boolean;
}

function rowToEntry(row: any): NotificationLogEntry {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    time: row.time,
    read: row.read,
  };
}

export async function getNotificationLog(): Promise<NotificationLogEntry[]> {
  const { data, error } = await supabase
    .from("notification_log")
    .select("*")
    .order("time", { ascending: false })
    .limit(MAX_ENTRIES);

  if (error) {
    console.error("getNotificationLog failed:", error.message);
    return [];
  }

  return (data || []).map(rowToEntry);
}

export async function addNotificationLogEntry(entry: { title: string; body: string }) {
  const newEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: entry.title,
    body: entry.body,
    time: new Date().toISOString(),
    read: false,
  };

  const { error } = await supabase.from("notification_log").insert(newEntry);
  if (error) console.error("addNotificationLogEntry failed:", error.message);

  refreshNotificationLog();
}

export async function markAllRead() {
  const { error } = await supabase.from("notification_log").update({ read: true }).eq("read", false);
  if (error) console.error("markAllRead failed:", error.message);
  refreshNotificationLog();
}

export async function markRead(id: string) {
  const { error } = await supabase.from("notification_log").update({ read: true }).eq("id", id);
  if (error) console.error("markRead failed:", error.message);
  refreshNotificationLog();
}

export async function getUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notification_log")
    .select("*", { count: "exact", head: true })
    .eq("read", false);

  if (error) {
    console.error("getUnreadCount failed:", error.message);
    return 0;
  }
  return count || 0;
}

export function refreshNotificationLog() {
  window.dispatchEvent(new Event("notificationLogUpdated"));
}
