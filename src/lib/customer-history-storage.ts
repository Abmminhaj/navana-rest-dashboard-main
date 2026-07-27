import { supabase } from "./supabaseClient";
import type { ActiveStay } from "./mock-data";

export interface CustomerHistoryRecord extends ActiveStay {
  checkoutDate: string;
  checkoutTime: string;
  paymentMethod?: string;
  checkoutNotes?: string;
  actualNights?: number;
  due?: number;
}

function rowToHistory(row: any): CustomerHistoryRecord {
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
    rent: Number(row.rent) || 0,
    advance: Number(row.advance) || 0,
    remaining: Number(row.remaining) || 0,
    previousDue: Number(row.previous_due) || 0,
    deposits: row.deposits || [],
    nidPhoto: row.nid_photo,
    customerPhoto: row.customer_photo,
    notes: row.notes,
    checkoutDate: row.checkout_date,
    checkoutTime: row.checkout_time,
    paymentMethod: row.payment_method,
    checkoutNotes: row.checkout_notes,
    actualNights: row.actual_nights != null ? Number(row.actual_nights) : undefined,
    due: row.due != null ? Number(row.due) : undefined,
  };
}

export async function getCustomerHistory(): Promise<CustomerHistoryRecord[]> {
  const { data, error } = await supabase
    .from("customer_history")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getCustomerHistory failed:", error.message);
    return [];
  }

  return (data || []).map(rowToHistory);
}

export async function saveCustomerHistory(customer: CustomerHistoryRecord) {
  const { error } = await supabase.from("customer_history").insert({
    id: customer.id,
    booking_id: customer.bookingId,
    guest_type: customer.guestType,
    room: customer.room,
    customer: customer.customer,
    father_name: customer.fatherName,
    phone: customer.phone,
    nid: customer.nid,
    profession: customer.profession,
    nationality: customer.nationality,
    address: customer.address,
    division_id: customer.divisionId,
    district_id: customer.districtId,
    upazila_id: customer.upazilaId,
    village: customer.village,
    house_road: customer.houseRoad,
    check_in: customer.checkIn,
    expected_check_out: customer.expectedCheckOut,
    rent: customer.rent,
    advance: customer.advance,
    remaining: customer.remaining,
    previous_due: customer.previousDue || 0,
    deposits: customer.deposits || [],
    nid_photo: customer.nidPhoto,
    customer_photo: customer.customerPhoto,
    notes: customer.notes,
    checkout_date: customer.checkoutDate,
    checkout_time: customer.checkoutTime,
    payment_method: customer.paymentMethod,
    checkout_notes: customer.checkoutNotes,
    actual_nights: customer.actualNights,
    due: customer.due,
  });

  if (error) console.error("saveCustomerHistory failed:", error.message);
}
