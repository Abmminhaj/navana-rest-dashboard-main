import { supabase } from "./supabaseClient";
import type { Room, RoomStatus } from "./mock-data";

const DEFAULT_ROOMS: Room[] = [
  { number: "101", type: "Standard", status: "Available", floor: 1, rent: 2500, amenities: [] },
  { number: "102", type: "Standard", status: "Available", floor: 1, rent: 2500, amenities: [] },
  { number: "103", type: "Standard", status: "Available", floor: 1, rent: 2500, amenities: [] },
  { number: "104", type: "Standard", status: "Available", floor: 1, rent: 2500, amenities: [] },
  { number: "105", type: "Standard", status: "Available", floor: 1, rent: 2500, amenities: [] },
  { number: "106", type: "Standard", status: "Available", floor: 1, rent: 2500, amenities: [] },
  { number: "107", type: "Standard", status: "Available", floor: 1, rent: 2500, amenities: [] },
  { number: "108", type: "Standard", status: "Available", floor: 1, rent: 2500, amenities: [] },
  { number: "109", type: "Standard", status: "Available", floor: 1, rent: 2500, amenities: [] },
  { number: "201", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
  { number: "202", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
  { number: "203", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
  { number: "204", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
  { number: "205", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
  { number: "206", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
  { number: "207", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
  { number: "208", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
  { number: "209", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
  { number: "210", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
  { number: "211", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
  { number: "212", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
  { number: "213", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
  { number: "214", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
  { number: "215", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
  { number: "216", type: "Standard", status: "Available", floor: 2, rent: 2500, amenities: [] },
];

function rowToRoom(row: any): Room {
  return {
    number: row.number,
    type: row.type,
    status: row.status,
    floor: row.floor,
    rent: Number(row.rent),
    amenities: row.amenities || [],
    notes: row.notes || undefined,
  };
}

export async function getRooms(): Promise<Room[]> {
  const { data, error } = await supabase.from("rooms").select("*").order("number", { ascending: true });
  if (error) {
    console.error("getRooms failed:", error.message);
    return [];
  }
  return (data || []).map(rowToRoom);
}

export async function occupyRoom(roomNumber: string) {
  await updateRoomStatus(roomNumber, "Occupied");
}

export async function updateRoomStatus(roomNumber: string, status: RoomStatus) {
  const { error } = await supabase.from("rooms").update({ status }).eq("number", roomNumber);
  if (error) console.error("updateRoomStatus failed:", error.message);
  refreshRooms();
}

export async function updateRoom(roomNumber: string, updates: Partial<Room>) {
  const { error } = await supabase.from("rooms").update(updates).eq("number", roomNumber);
  if (error) console.error("updateRoom failed:", error.message);
  refreshRooms();
}

export async function resetRoomsToDefault() {
  const { error: delErr } = await supabase.from("rooms").delete().neq("number", "__none__");
  if (delErr) console.error("reset delete failed:", delErr.message);

  const { error } = await supabase.from("rooms").insert(DEFAULT_ROOMS);
  if (error) console.error("reset insert failed:", error.message);

  refreshRooms();
}

export async function addRoom(newRoom: Room) {
  const { data: existing } = await supabase
    .from("rooms")
    .select("number")
    .eq("number", newRoom.number)
    .maybeSingle();

  if (existing) {
    throw new Error("ROOM_EXISTS");
  }

  const { error } = await supabase.from("rooms").insert(newRoom);
  if (error) throw error;

  refreshRooms();
}

export async function deleteRoom(roomNumber: string) {
  const { error } = await supabase.from("rooms").delete().eq("number", roomNumber);
  if (error) console.error("deleteRoom failed:", error.message);
  refreshRooms();
}

export function refreshRooms() {
  window.dispatchEvent(new Event("roomsUpdated"));
}
