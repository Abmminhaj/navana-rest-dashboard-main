import { getActiveStays } from "@/lib/stay-storage";
import { getCustomerHistory } from "@/lib/customer-history-storage";
import { getRooms } from "@/lib/room-storage";

export type SearchResultType = "guest" | "customer" | "room";
export type SearchResultRoute = "/checkout" | "/customers" | "/rooms";

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  route: SearchResultRoute;
  /** Passed as the destination page's `?highlight=` search param. */
  highlightKey: string;
}

const TYPE_LABEL: Record<SearchResultType, string> = {
  guest: "Currently Checked-In",
  customer: "Customer History",
  room: "Room",
};

function normalize(value: string) {
  return value.toLowerCase().trim();
}

function matches(query: string, ...fields: (string | undefined | null)[]) {
  const q = normalize(query);
  return fields.some((f) => !!f && normalize(f).includes(q));
}

/**
 * Searches real data (active stays, customer history, rooms) instead of the
 * old dummy/static navbar search box. Returns up to `limit` results per
 * category, most-relevant first.
 */
export function searchAll(rawQuery: string, limit = 5): SearchResult[] {
  const query = rawQuery.trim();
  if (query.length < 1) return [];

  const results: SearchResult[] = [];

  // 1) Currently checked-in guests (active stays)
  const stays = getActiveStays();
  for (const s of stays) {
    if (matches(query, s.customer, s.phone, s.room, s.nid)) {
      results.push({
        id: `guest-${s.id}`,
        type: "guest",
        title: s.customer,
        subtitle: `Room ${s.room} · ${s.phone}`,
        route: "/checkout",
        highlightKey: s.id,
      });
    }
    if (results.filter((r) => r.type === "guest").length >= limit) break;
  }

  // 2) Past customer history (checked-out guests) — dedupe by phone
  const history = getCustomerHistory();
  const seenPhones = new Set<string>();
  for (const r of history) {
    const key = (r.phone || "").replace(/\D/g, "") || r.customer;
    if (seenPhones.has(key)) continue;
    if (matches(query, r.customer, r.phone, r.nid, r.address)) {
      seenPhones.add(key);
      results.push({
        id: `customer-${key}`,
        type: "customer",
        title: r.customer,
        subtitle: `${r.phone || "—"} · Last visit ${r.checkoutDate || "—"}`,
        route: "/customers",
        highlightKey: key,
      });
    }
    if (seenPhones.size >= limit) break;
  }

  // 3) Rooms
  const rooms = getRooms();
  for (const room of rooms) {
    if (matches(query, room.number, room.type)) {
      results.push({
        id: `room-${room.number}`,
        type: "room",
        title: `Room ${room.number}`,
        subtitle: `${room.type} · ${room.status}`,
        route: "/rooms",
        highlightKey: room.number,
      });
    }
    if (results.filter((r) => r.type === "room").length >= limit) break;
  }

  return results;
}

export function searchResultTypeLabel(type: SearchResultType) {
  return TYPE_LABEL[type];
}
