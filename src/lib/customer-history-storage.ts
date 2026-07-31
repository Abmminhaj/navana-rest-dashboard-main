import { supabase } from "./supabaseClient";
import type { ActiveStay } from "./mock-data";
import { mergeAdditionalGuests, parseAdditionalGuests } from "./additional-guest-storage";

export interface CustomerHistoryRecord extends ActiveStay {
  checkoutDate: string;
  checkoutTime: string;
  paymentMethod?: string;
  checkoutNotes?: string;
  actualNights?: number;
  due?: number;
  isAdditionalGuest?: boolean;
}

export interface DuePayment {
  id: string;
  amount: number;
  date: string;
  method: string;
  note?: string;
}

const DUE_PAYMENT_MARKER = "__NAVANA_DUE_PAYMENTS__";

export function parseDuePayments(notes?: string | null): DuePayment[] {
  if (!notes) return [];
  const markerIndex = notes.indexOf(DUE_PAYMENT_MARKER);
  if (markerIndex < 0) return [];
  try {
    const parsed = JSON.parse(notes.slice(markerIndex + DUE_PAYMENT_MARKER.length).trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeDuePayments(notes: string | undefined, payments: DuePayment[]) {
  const baseNotes = (notes || "").split(DUE_PAYMENT_MARKER)[0].trimEnd();
  return `${baseNotes}${baseNotes ? "\n\n" : ""}${DUE_PAYMENT_MARKER}${JSON.stringify(payments)}`;
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
    additionalGuests: parseAdditionalGuests(row.notes),
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
    notes: mergeAdditionalGuests(customer.notes, customer.additionalGuests),
    checkout_date: customer.checkoutDate,
    checkout_time: customer.checkoutTime,
    payment_method: customer.paymentMethod,
    checkout_notes: customer.checkoutNotes,
    actual_nights: customer.actualNights,
    due: customer.due,
  });

  if (error) console.error("saveCustomerHistory failed:", error.message);
}

export async function recordDuePayment(
  record: CustomerHistoryRecord,
  amount: number,
  date: string,
  method: string,
  note?: string,
) {
  const due = Number(record.due) || 0;
  const paymentAmount = Math.min(Math.max(0, amount), due);
  if (!record.id || paymentAmount <= 0) return false;

  const payments = [
    ...parseDuePayments(record.checkoutNotes),
    { id: crypto.randomUUID(), amount: paymentAmount, date, method, note },
  ];
  const { error } = await supabase
    .from("customer_history")
    .update({
      due: Math.max(0, due - paymentAmount),
      checkout_notes: mergeDuePayments(record.checkoutNotes, payments),
    })
    .eq("id", record.id);

  if (error) {
    console.error("recordDuePayment failed:", error.message);
    return false;
  }

  window.dispatchEvent(new Event("customerHistoryUpdated"));
  return true;
}
