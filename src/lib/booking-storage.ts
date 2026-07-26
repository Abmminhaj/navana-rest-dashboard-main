import { supabase } from "./supabaseClient";

function rowToBooking(row: any) {
  return {
    bookingId: row.booking_id,
    guestType: row.guest_type,
    customerName: row.customer_name,
    fatherName: row.father_name,
    phone: row.phone,
    nid: row.nid,
    profession: row.profession,
    nationality: row.nationality,
    division: row.division,
    district: row.district,
    upazila: row.upazila,
    village: row.village,
    houseRoad: row.house_road,
    address: row.address,
    nidPhoto: row.nid_photo,
    customerPhoto: row.customer_photo,
    room: row.room,
    roomType: row.room_type,
    roomRent: Number(row.room_rent),
    checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date,
    nights: row.nights,
    discount: Number(row.discount),
    advancePayment: Number(row.advance_payment),
    totalRent: Number(row.total_rent),
    due: Number(row.due),
    paymentMethod: row.payment_method,
    notes: row.notes,
  };
}

export async function getBookings(): Promise<any[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getBookings failed:", error.message);
    return [];
  }
  return (data || []).map(rowToBooking);
}

export async function saveBooking(booking: any) {
  const { error } = await supabase.from("bookings").insert({
    booking_id: booking.bookingId,
    guest_type: booking.guestType,
    customer_name: booking.customerName,
    father_name: booking.fatherName,
    phone: booking.phone,
    nid: booking.nid,
    profession: booking.profession,
    nationality: booking.nationality,
    division: booking.division,
    district: booking.district,
    upazila: booking.upazila,
    village: booking.village,
    house_road: booking.houseRoad,
    address: booking.address,
    nid_photo: booking.nidPhoto,
    customer_photo: booking.customerPhoto,
    room: booking.room,
    room_type: booking.roomType,
    room_rent: booking.roomRent,
    check_in_date: booking.checkInDate,
    check_out_date: booking.checkOutDate,
    nights: booking.nights,
    discount: booking.discount,
    advance_payment: booking.advancePayment,
    total_rent: booking.totalRent,
    due: booking.due,
    payment_method: booking.paymentMethod,
    notes: booking.notes,
  });

  if (error) console.error("saveBooking failed:", error.message);
}
