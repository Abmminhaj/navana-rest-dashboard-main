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
export async function searchAll(rawQuery: string, limit = 5): Promise<SearchResult[]> {
  const query = rawQuery.trim();
  if (query.length < 1) return [];

  const results: SearchResult[] = [];

  // 1) Currently checked-in guests (active stays)
  const [staysResult, historyResult, roomsResult] = await Promise.allSettled([
    getActiveStays(),
    getCustomerHistory(),
    getRooms(),
  ]);
  const stays = staysResult.status === "fulfilled" ? staysResult.value : [];
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
    for (const guest of s.additionalGuests || []) {
      if (matches(query, guest.name, guest.phone, guest.nid, guest.address, guest.fatherName)) {
        results.push({
          id: `guest-${s.id}-${guest.id}`,
          type: "guest",
          title: guest.name,
          subtitle: `Additional Guest · Room ${s.room} · ${guest.phone || "—"}`,
          route: "/checkout",
          highlightKey: s.id,
        });
      }
      if (results.filter((r) => r.type === "guest").length >= limit) break;
    }
    if (results.filter((r) => r.type === "guest").length >= limit) break;
  }

  // 2) Past customer history (checked-out guests) — dedupe by phone
  const history = historyResult.status === "fulfilled" ? historyResult.value : [];
  const seenPhones = new Set<string>();
  for (const r of history) {
    const people = [
      { name: r.customer, phone: r.phone, nid: r.nid, address: r.address },
      ...(r.additionalGuests || []).map((guest) => ({
        name: guest.name,
        phone: guest.phone,
        nid: guest.nid,
        address: guest.address,
      })),
    ];
    for (const person of people) {
      const key = (person.phone || "").replace(/\D/g, "") || person.name;
      if (seenPhones.has(key)) continue;
      if (matches(query, person.name, person.phone, person.nid, person.address)) {
        seenPhones.add(key);
        results.push({
          id: `customer-${key}`,
          type: "customer",
          title: person.name,
          subtitle: `${person.phone || "—"} · Last visit ${r.checkoutDate || "—"}`,
          route: "/customers",
          highlightKey: key,
        });
      }
    }
    if (seenPhones.size >= limit) break;
  }

  // 3) Rooms
  const rooms = roomsResult.status === "fulfilled" ? roomsResult.value : [];
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
