import { supabase } from "./supabaseClient";
import { mergeAdditionalGuests, parseAdditionalGuests } from "./additional-guest-storage";

function rowToStay(row: any) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    guestType: row.guest_type,
    room: row.room,
    customer: row.customer,
    fatherName: row.father_name,
    phone: row.phone,
    nid: row.nid,
    profession: row.profession,
    nationality: row.nationality,
    address: row.address,
    divisionId: row.division_id,
    districtId: row.district_id,
    upazilaId: row.upazila_id,
    village: row.village,
    houseRoad: row.house_road,
    checkIn: row.check_in,
    expectedCheckOut: row.expected_check_out,
    rent: Number(row.rent),
    advance: Number(row.advance),
    remaining: Number(row.remaining),
    previousDue: Number(row.previous_due) || 0,
    nidPhoto: row.nid_photo,
    customerPhoto: row.customer_photo,
    notes: row.notes,
    additionalGuests: parseAdditionalGuests(row.notes),
    deposits: (row.stay_deposits || []).map((d: any) => ({
      amount: Number(d.amount),
      date: d.date,
      method: d.method,
      note: d.note,
    })),
  };
}

export async function getActiveStays(): Promise<any[]> {
  const { data, error } = await supabase
    .from("active_stays")
    .select("*, stay_deposits(*)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getActiveStays failed:", error.message);
    return [];
  }
  return (data || []).map(rowToStay);
}

export async function saveActiveStay(stay: any) {
  const { error } = await supabase.from("active_stays").insert({
    booking_id: stay.bookingId,
    guest_type: stay.guestType,
    room: stay.room,
    customer: stay.customer,
    father_name: stay.fatherName,
    phone: stay.phone,
    nid: stay.nid,
    profession: stay.profession,
    nationality: stay.nationality,
    address: stay.address,
    division_id: stay.divisionId,
    district_id: stay.districtId,
    upazila_id: stay.upazilaId,
    village: stay.village,
    house_road: stay.houseRoad,
    check_in: stay.checkIn,
    expected_check_out: stay.expectedCheckOut,
    rent: stay.rent,
    advance: stay.advance,
    remaining: stay.remaining,
    previous_due: stay.previousDue || 0,
    nid_photo: stay.nidPhoto,
    customer_photo: stay.customerPhoto,
    notes: mergeAdditionalGuests(stay.notes, stay.additionalGuests),
  });

  if (error) console.error("saveActiveStay failed:", error.message);
  if (!error) window.dispatchEvent(new Event("activeStaysUpdated"));
}

export async function removeActiveStay(id: string) {
  const { error } = await supabase.from("active_stays").delete().eq("id", id);
  if (error) console.error("removeActiveStay failed:", error.message);
  if (!error) window.dispatchEvent(new Event("activeStaysUpdated"));
}

export async function addDeposit(id: string, amount: number, date?: string) {
  const { error } = await supabase.from("stay_deposits").insert({
    stay_id: id,
    amount,
    date: date || new Date().toISOString().slice(0, 10),
  });

  if (error) console.error("addDeposit failed:", error.message);
}
