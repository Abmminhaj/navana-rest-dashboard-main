import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Save,
  User,
  BedDouble,
  CreditCard,
  Search,
  Upload,
  X,
  Camera,
  CheckCircle2,
} from "lucide-react";
import {
  Card,
  Field,
  PageHeader,
  SectionTitle,
  buttonGhost,
  buttonPrimary,
  inputClass,
  selectClass,
  textareaClass,
} from "@/components/ui-kit";
import { CameraCapture } from "@/components/CameraCapture";
import { type Room } from "@/lib/mock-data";
import { getCustomerHistory, type CustomerHistoryRecord } from "@/lib/customer-history-storage";
import { divisions, getDistrictsByDivision, getUpazilasByDistrict } from "@/lib/bd-locations";
import { saveBooking, getBookings } from "@/lib/booking-storage";
import { getRooms, occupyRoom, refreshRooms } from "@/lib/room-storage";
import { getActiveStays, saveActiveStay } from "@/lib/stay-storage";
import type { AdditionalGuest } from "@/lib/additional-guest-storage";
import { notifyCheckIn } from "@/lib/notification-engine";

const MIN_PHOTO_SIZE_BYTES = 10 * 1024; // 10KB minimum

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function compressImage(file: File, maxDimension = 1000, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File could not be read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image file"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const Route = createFileRoute("/booking")({
  head: () => ({ meta: [{ title: "New Booking — Navana Rest House" }] }),
  component: BookingPage,
});

function BookingPage() {
  const [phone, setPhone] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [guestType, setGuestType] = useState("Walk-in Guest");
  const [advancePayment, setAdvancePayment] = useState(0);
  const [notes, setNotes] = useState("");
  const [roomRent, setRoomRent] = useState("");
  const [discount, setDiscount] = useState("");
  const [checkInDate, setCheckInDate] = useState(todayISO());
  const [checkInTime, setCheckInTime] = useState(nowHHMM());
  const [checkOutDate, setCheckOutDate] = useState(tomorrowISO());
  const [checkOutTime, setCheckOutTime] = useState("12:00");
  const [customerName, setCustomerName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [nid, setNid] = useState("");
  const [profession, setProfession] = useState("");
  const [nationality, setNationality] = useState("Bangladeshi");
  const [divisionId, setDivisionId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [upazilaId, setUpazilaId] = useState("");
  const [village, setVillage] = useState("");
  const [houseRoad, setHouseRoad] = useState("");
  const [nidPhoto, setNidPhoto] = useState<string | null>(null);
  const [nidPhotoName, setNidPhotoName] = useState("");
  const [customerPhoto, setCustomerPhoto] = useState<string | null>(null);
  const [customerPhotoName, setCustomerPhotoName] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [cameraFor, setCameraFor] = useState<"nid" | "customer" | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [showSuggestion, setShowSuggestion] = useState(true);
  const [previousDue, setPreviousDue] = useState(0);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypeFilter, setRoomTypeFilter] = useState("");
  const [customerHistory, setCustomerHistory] = useState<CustomerHistoryRecord[]>([]);
  const [bookingId, setBookingId] = useState("");
  const [validationError, setValidationError] = useState("");
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [bookingComplete, setBookingComplete] = useState<{
    bookingId: string;
    room: string;
    customerName: string;
  } | null>(null);
  const [duplicateGuest, setDuplicateGuest] = useState<{
    room: string;
    customerName: string;
    phone: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [additionalGuests, setAdditionalGuests] = useState<AdditionalGuest[]>([]);
  const customerNameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const fatherNameRef = useRef<HTMLInputElement>(null);
  const villageRef = useRef<HTMLInputElement>(null);

  function requiredFieldClass(value: string) {
    return validationAttempted && !value.trim()
      ? `${inputClass} border-red-500 ring-1 ring-red-200 focus:border-red-500 focus:ring-red-200`
      : inputClass;
  }

  async function generateBookingId() {
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const allBookings = await getBookings();
    const todaysCount = allBookings.filter(
      (b: any) => typeof b.bookingId === "string" && b.bookingId.startsWith(`NRH-${todayStr}-`),
    ).length;
    const nextSeq = String(todaysCount + 1).padStart(4, "0");
    return `NRH-${todayStr}-${nextSeq}`;
  }

  const availableDistricts = useMemo(
    () => (divisionId ? getDistrictsByDivision(divisionId) : []),
    [divisionId],
  );

  const availableUpazilas = useMemo(
    () => (districtId ? getUpazilasByDistrict(districtId) : []),
    [districtId],
  );

  async function handlePhotoSelect(
    file: File | undefined,
    setPhoto: (value: string | null) => void,
    setName: (value: string) => void,
  ) {
    setPhotoError("");
    if (!file) return;

    if (file.size < MIN_PHOTO_SIZE_BYTES) {
      setPhotoError("ছবির সাইজ অনেক ছোট (কমপক্ষে 10KB হতে হবে)। স্পষ্ট একটা ছবি আপলোড করো।");
      return;
    }

    try {
      const compressed = await compressImage(file);
      setPhoto(compressed);
      setName(file.name);
    } catch {
      setPhotoError("ছবিটি আপলোড করা যায়নি, অন্য একটি ছবি চেষ্টা করো।");
    }
  }

  function handleCameraCapture(dataUrl: string) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (cameraFor === "nid") {
      setNidPhoto(dataUrl);
      setNidPhotoName(`nid-camera-${stamp}.jpg`);
    } else if (cameraFor === "customer") {
      setCustomerPhoto(dataUrl);
      setCustomerPhotoName(`customer-camera-${stamp}.jpg`);
    }
    setPhotoError("");
    setCameraFor(null);
  }

  useEffect(() => {
    async function loadRooms() {
      setRooms(await getRooms());
    }

    loadRooms();
    getCustomerHistory().then(setCustomerHistory);
    generateBookingId().then(setBookingId);

    window.addEventListener("roomsUpdated", loadRooms);
    return () => window.removeEventListener("roomsUpdated", loadRooms);
  }, []);

  const suggestion = useMemo(() => {
    if (phone.replace(/\D/g, "").length < 4) return null;
    const digits = phone.replace(/\D/g, "");
    const matches = customerHistory
      .filter((c) => c.phone.replace(/\D/g, "").includes(digits))
      .sort((a, b) => new Date(b.checkoutDate).getTime() - new Date(a.checkoutDate).getTime());
    return matches[0] || null;
  }, [phone, customerHistory]);

  const availableRooms = rooms.filter((r) => r.status === "Available");
  const roomTypesInUse = Array.from(new Set(rooms.map((r) => r.type))).sort();
  const filteredAvailableRooms = roomTypeFilter
    ? availableRooms.filter((r) => r.type === roomTypeFilter)
    : availableRooms;

  const roomInfo = availableRooms.find((r) => r.number === selectedRoom);

  const divisionName = divisions.find((d) => d.id === divisionId)?.name || "";
  const districtName = availableDistricts.find((d) => d.id === districtId)?.name || "";
  const upazilaName = availableUpazilas.find((u) => u.id === upazilaId)?.name || "";

  const fullAddress = [houseRoad, village, upazilaName, districtName, divisionName]
    .filter(Boolean)
    .join(", ");

  useEffect(() => {
    if (!additionalGuests.some((guest) => guest.sameAsMain)) return;
    setAdditionalGuests((current) =>
      current.map((guest) =>
        guest.sameAsMain
          ? { ...guest, divisionId, districtId, upazilaId, village, address: fullAddress }
          : guest,
      ),
    );
  }, [divisionId, districtId, upazilaId, village, fullAddress]);

  const nights = Math.max(
    1,
    Math.ceil(
      (new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / (1000 * 60 * 60 * 24),
    ),
  );

  const totalRent = (Number(roomRent) || 0) * nights - (Number(discount) || 0);

  const due = totalRent - (Number(advancePayment) || 0) + (Number(previousDue) || 0);

  async function handleSaveBooking(options?: { skipDuplicateCheck?: boolean }) {
    if (isSaving) return;
    setIsSaving(true);
    setValidationAttempted(true);
    const missingFields: string[] = [];
    if (!customerName.trim()) missingFields.push("Customer Name");
    if (!phone.trim()) missingFields.push("Phone Number");
    if (!fatherName.trim()) missingFields.push("Father's Name");
    if (!fullAddress.trim()) missingFields.push("Address");
    additionalGuests.forEach((guest, index) => {
      if (!guest.name.trim()) missingFields.push(`Additional Guest ${index + 1} Name`);
      if (!guest.phone.trim()) missingFields.push(`Additional Guest ${index + 1} Phone`);
      if (!guest.fatherName.trim())
        missingFields.push(`Additional Guest ${index + 1} Father's Name`);
      if (!guest.divisionId || !guest.districtId || !guest.upazilaId || !guest.village?.trim()) {
        missingFields.push(`Additional Guest ${index + 1} Address`);
      }
    });

    if (missingFields.length > 0) {
      setIsSaving(false);
      setValidationError(`Booking save করতে এই তথ্যগুলো দিতে হবে: ${missingFields.join(", ")}`);
      const firstMissingRef = !customerName.trim()
        ? customerNameRef
        : !phone.trim()
          ? phoneRef
          : !fatherName.trim()
            ? fatherNameRef
            : villageRef;
      window.setTimeout(() => {
        firstMissingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        firstMissingRef.current?.focus();
      }, 0);
      return;
    }

    setValidationError("");

    if (!options?.skipDuplicateCheck) {
      const normalizedPhone = phone.replace(/\D/g, "");
      const activeStays = await getActiveStays();
      const existingGuest = activeStays.find(
        (stay) => stay.phone?.replace(/\D/g, "") === normalizedPhone,
      );

      if (existingGuest) {
        setIsSaving(false);
        setDuplicateGuest({
          room: existingGuest.room,
          customerName: existingGuest.customer,
          phone: existingGuest.phone,
        });
        return;
      }
    }

    const bookingData = {
      bookingId,
      guestType,
      customerName,
      fatherName,
      phone,
      nid,
      profession,
      nationality,
      division: divisionName,
      district: districtName,
      upazila: upazilaName,
      village,
      houseRoad,
      address: fullAddress,
      nidPhoto,
      customerPhoto,
      room: selectedRoom,
      roomType: roomInfo?.type,
      roomRent: Number(roomRent) || 0,
      checkInDate,
      checkOutDate,
      nights,
      discount: Number(discount) || 0,
      advancePayment: Number(advancePayment) || 0,
      totalRent,
      due,
      paymentMethod,
      notes,
      additionalGuests,
    };

    const activeStay = {
      id: Date.now().toString(),
      bookingId,
      guestType,
      room: selectedRoom,
      customer: customerName,
      fatherName,
      phone,
      nid,
      profession,
      nationality,
      address: fullAddress,
      divisionId,
      districtId,
      upazilaId,
      village,
      houseRoad,
      checkIn: checkInDate,
      expectedCheckOut: checkOutDate,
      rent: Number(roomRent) || 0,
      advance: Number(advancePayment || 0),
      remaining: due,
      previousDue,
      nidPhoto,
      customerPhoto,
      additionalGuests,
      notes,
    };

    await saveBooking(bookingData);
    await saveActiveStay(activeStay);
    await occupyRoom(selectedRoom);
    refreshRooms();
    notifyCheckIn(customerName, selectedRoom, bookingId);

    console.log("Booking Saved:", bookingData);
    setBookingComplete({ bookingId, room: selectedRoom, customerName });
    setIsSaving(false);
  }

  async function resetForm() {
    setPhone("");
    setSelectedRoom("");
    setRoomTypeFilter("");
    setGuestType("Walk-in Guest");
    setAdvancePayment(0);
    setNotes("");
    setRoomRent("");
    setDiscount("");
    setCheckInDate(todayISO());
    setCheckInTime(nowHHMM());
    setCheckOutDate(tomorrowISO());
    setCheckOutTime("12:00");
    setCustomerName("");
    setFatherName("");
    setNid("");
    setProfession("");
    setNationality("Bangladeshi");
    setDivisionId("");
    setDistrictId("");
    setUpazilaId("");
    setVillage("");
    setHouseRoad("");
    setNidPhoto(null);
    setNidPhotoName("");
    setCustomerPhoto(null);
    setCustomerPhotoName("");
    setAdditionalGuests([]);
    setPhotoError("");
    setPaymentMethod("Cash");
    setShowSuggestion(true);
    setPreviousDue(0);
    setBookingId(await generateBookingId());
    setValidationError("");
    setValidationAttempted(false);
    setIsSaving(false);
  }

  return (
    <div>
      <PageHeader
        title="New Booking"
        description="Register a new guest and assign a room in under a minute."
        actions={
          <>
            <button
              className={buttonPrimary + " disabled:cursor-not-allowed disabled:opacity-60"}
              onClick={() => handleSaveBooking()}
              disabled={isSaving}
              aria-busy={isSaving}
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save Booking"}
            </button>
          </>
        }
      />

      {validationError && (
        <div
          className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          role="alert"
        >
          {validationError}
        </div>
      )}

      <div className="border-b border-border p-6">
        <Field label="Guest Type">
          <select
            className={selectClass}
            value={guestType}
            onChange={(e) => setGuestType(e.target.value)}
          >
            <option>Walk-in Guest</option>
            <option>Online Booking</option>
            <option>Corporate Guest</option>
            <option>Regular Guest</option>
            <option>VIP Guest</option>
          </select>
        </Field>
        <Field label="Booking ID">
          <input className={inputClass} value={bookingId} readOnly />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <SectionTitle
              title="Customer Information"
              action={<User className="h-4 w-4 text-muted-foreground" />}
            />
            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
              <Field label="Customer Name *">
                <input
                  ref={customerNameRef}
                  className={requiredFieldClass(customerName)}
                  placeholder="e.g. Md. Tanvir Ahmed"
                  value={customerName}
                  required
                  aria-required="true"
                  aria-invalid={validationAttempted && !customerName.trim()}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setValidationError("");
                  }}
                />
              </Field>
              <Field label="Phone Number *">
                <div className="relative">
                  <input
                    ref={phoneRef}
                    className={requiredFieldClass(phone) + " pl-9"}
                    placeholder="017XX-XXXXXX"
                    value={phone}
                    required
                    aria-required="true"
                    aria-invalid={validationAttempted && !phone.trim()}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setShowSuggestion(true);
                      setValidationError("");
                    }}
                  />
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </Field>

              {suggestion && showSuggestion && (
                <div className="rounded-lg bg-white p-4 shadow-sm md:col-start-2">
                  <h3 className="mb-3 text-base font-bold text-blue-700">👤 Existing Customer</h3>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="font-medium">Name</span>
                    <span>{suggestion.customer}</span>
                    <span className="font-medium">Phone</span>
                    <span>{suggestion.phone}</span>
                    <span className="font-medium">NID</span>
                    <span>{suggestion.nid}</span>
                    <span className="font-medium">Address</span>
                    <span>{suggestion.address}</span>
                  </div>
                  <hr className="my-4" />
                  <div className="mb-3 flex items-center gap-2">
                    <BedDouble className="h-5 w-5 text-blue-600" />
                    <h4 className="font-semibold text-gray-800">Last Stay</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="font-medium">Room</span>
                    <span>{suggestion.room}</span>
                    <span className="font-medium">Check In</span>
                    <span>{suggestion.checkIn}</span>
                    <span className="font-medium">Checked Out</span>
                    <span>{suggestion.checkoutDate}</span>
                    <span className="font-medium">Room Rent</span>
                    <span>৳{suggestion.rent}</span>
                  </div>
                  {(suggestion.due || 0) > 0 && (
                    <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                      ⚠️ আগের বকেয়া আছে: ৳{(suggestion.due || 0).toLocaleString()}
                    </div>
                  )}
                  <button
                    className={buttonPrimary + " mt-5 w-full"}
                    onClick={() => {
                      if (!suggestion) return;
                      setCustomerName(suggestion.customer);
                      setPhone(suggestion.phone);
                      setNid(suggestion.nid);
                      setFatherName(suggestion.fatherName || "");
                      setProfession(suggestion.profession || "");
                      setNationality(suggestion.nationality || "Bangladeshi");
                      setDivisionId(suggestion.divisionId || "");
                      setDistrictId(suggestion.districtId || "");
                      setUpazilaId(suggestion.upazilaId || "");
                      setVillage(suggestion.village || suggestion.address || "");
                      setHouseRoad(suggestion.houseRoad || "");
                      setPreviousDue(suggestion.due || 0);
                      setShowSuggestion(false);
                    }}
                  >
                    Use Details
                  </button>
                </div>
              )}

              <Field label="National ID">
                <input
                  className={inputClass}
                  placeholder="13 or 17 digit NID"
                  value={nid}
                  onChange={(e) => setNid(e.target.value)}
                />
              </Field>
              <Field label="Profession">
                <input
                  className={inputClass}
                  placeholder="e.g. Banker, Doctor"
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                />
              </Field>
              <Field label="Father's Name *">
                <input
                  ref={fatherNameRef}
                  className={requiredFieldClass(fatherName)}
                  placeholder="e.g. Md. Rahim Uddin"
                  value={fatherName}
                  required
                  aria-required="true"
                  aria-invalid={validationAttempted && !fatherName.trim()}
                  onChange={(e) => {
                    setFatherName(e.target.value);
                    setValidationError("");
                  }}
                />
              </Field>
              <Field label="Nationality">
                <input
                  className={inputClass}
                  placeholder="e.g. Bangladeshi"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                />
              </Field>

              <div className="md:col-span-2">
                <SectionTitle title="Address" />
              </div>
              <Field label="Division">
                <select
                  className={selectClass}
                  value={divisionId}
                  onChange={(e) => {
                    setDivisionId(e.target.value);
                    setDistrictId("");
                    setUpazilaId("");
                  }}
                >
                  <option value="">Select Division</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="District">
                <select
                  className={selectClass}
                  value={districtId}
                  disabled={!divisionId}
                  onChange={(e) => {
                    setDistrictId(e.target.value);
                    setUpazilaId("");
                  }}
                >
                  <option value="">
                    {divisionId ? "Select District" : "Select Division first"}
                  </option>
                  {availableDistricts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Thana / Upazila">
                <select
                  className={selectClass}
                  value={upazilaId}
                  disabled={!districtId}
                  onChange={(e) => setUpazilaId(e.target.value)}
                >
                  <option value="">
                    {districtId ? "Select Thana / Upazila" : "Select District first"}
                  </option>
                  {availableUpazilas.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Village / Address *">
                <input
                  ref={villageRef}
                  className={requiredFieldClass(village)}
                  placeholder="Village name"
                  value={village}
                  required
                  aria-required="true"
                  aria-invalid={validationAttempted && !village.trim()}
                  onChange={(e) => {
                    setVillage(e.target.value);
                    setValidationError("");
                  }}
                />
              </Field>

              <div className="md:col-span-2">
                <Field label="House / Road (Optional)">
                  <input
                    className={inputClass}
                    placeholder="House no, Road no"
                    value={houseRoad}
                    onChange={(e) => setHouseRoad(e.target.value)}
                  />
                </Field>
              </div>

              <div className="md:col-span-2 border-t border-border pt-4">
                <SectionTitle title="Uploads (Optional)" />
              </div>
              <Field label="NID Photo">
                <div className="flex gap-2">
                  <label className={buttonGhost + " flex-1 cursor-pointer justify-center"}>
                    <Upload className="h-4 w-4" />
                    {nidPhotoName ? "Change Photo" : "Upload"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        handlePhotoSelect(e.target.files?.[0], setNidPhoto, setNidPhotoName)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setCameraFor("nid")}
                    className={buttonGhost + " flex-1 justify-center"}
                  >
                    <Camera className="h-4 w-4" /> Take Photo
                  </button>
                </div>
                {nidPhoto && (
                  <div className="mt-2 flex items-center gap-2">
                    <img
                      src={nidPhoto}
                      alt="NID preview"
                      className="h-12 w-12 rounded object-cover"
                    />
                    <span className="truncate text-xs text-muted-foreground">{nidPhotoName}</span>
                    <button
                      type="button"
                      className="ml-auto text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setNidPhoto(null);
                        setNidPhotoName("");
                      }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </Field>
              <Field label="Customer Photo">
                <div className="flex gap-2">
                  <label className={buttonGhost + " flex-1 cursor-pointer justify-center"}>
                    <Upload className="h-4 w-4" />
                    {customerPhotoName ? "Change Photo" : "Upload"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        handlePhotoSelect(
                          e.target.files?.[0],
                          setCustomerPhoto,
                          setCustomerPhotoName,
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setCameraFor("customer")}
                    className={buttonGhost + " flex-1 justify-center"}
                  >
                    <Camera className="h-4 w-4" /> Take Photo
                  </button>
                </div>
                {customerPhoto && (
                  <div className="mt-2 flex items-center gap-2">
                    <img
                      src={customerPhoto}
                      alt="Customer preview"
                      className="h-12 w-12 rounded object-cover"
                    />
                    <span className="truncate text-xs text-muted-foreground">
                      {customerPhotoName}
                    </span>
                    <button
                      type="button"
                      className="ml-auto text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setCustomerPhoto(null);
                        setCustomerPhotoName("");
                      }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </Field>
              {photoError && <div className="md:col-span-2 text-xs text-red-600">{photoError}</div>}
            </div>
          </Card>

          <Card>
            <SectionTitle
              title="Additional Guests (Optional)"
              action={
                <button
                  type="button"
                  className={buttonGhost + " h-8 px-3 text-xs"}
                  onClick={() =>
                    setAdditionalGuests((current) => [
                      ...current,
                      {
                        id: crypto.randomUUID(),
                        name: "",
                        nid: "",
                        phone: "",
                        fatherName: "",
                        address: "",
                        divisionId: "",
                        districtId: "",
                        upazilaId: "",
                        village: "",
                        sameAsMain: false,
                      },
                    ])
                  }
                >
                  + Add Guest
                </button>
              }
            />
            <div className="space-y-3 p-6">
              <p className="text-xs text-muted-foreground">
                একই room ও bill-এর সঙ্গে থাকা family/group member-দের তথ্য এখানে যোগ করো।
              </p>
              {additionalGuests.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                  এখনো কোনো additional guest যোগ করা হয়নি।
                </div>
              ) : (
                additionalGuests.map((guest, index) => (
                  <div key={guest.id} className="rounded-xl border border-border bg-muted/20 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">Guest {index + 2}</p>
                      <button
                        type="button"
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                        onClick={() =>
                          setAdditionalGuests((current) =>
                            current.filter((item) => item.id !== guest.id),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Field label="Name *">
                        <input
                          className={inputClass}
                          placeholder="Guest name"
                          value={guest.name}
                          onChange={(e) =>
                            setAdditionalGuests((current) =>
                              current.map((item) =>
                                item.id === guest.id ? { ...item, name: e.target.value } : item,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="NID (Optional)">
                        <input
                          className={inputClass}
                          placeholder="NID number"
                          value={guest.nid}
                          onChange={(e) =>
                            setAdditionalGuests((current) =>
                              current.map((item) =>
                                item.id === guest.id ? { ...item, nid: e.target.value } : item,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="Phone *">
                        <input
                          className={inputClass}
                          placeholder="Phone number"
                          value={guest.phone}
                          onChange={(e) =>
                            setAdditionalGuests((current) =>
                              current.map((item) =>
                                item.id === guest.id ? { ...item, phone: e.target.value } : item,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="Father's Name *">
                        <input
                          className={inputClass}
                          placeholder="Father's name"
                          value={guest.fatherName}
                          onChange={(e) =>
                            setAdditionalGuests((current) =>
                              current.map((item) =>
                                item.id === guest.id
                                  ? { ...item, fatherName: e.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>
                      <div className="md:col-span-2 space-y-3 rounded-lg border border-border bg-background p-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <input
                            type="checkbox"
                            checked={Boolean(guest.sameAsMain)}
                            onChange={(e) =>
                              setAdditionalGuests((current) =>
                                current.map((item) =>
                                  item.id === guest.id
                                    ? {
                                        ...item,
                                        sameAsMain: e.target.checked,
                                        divisionId: e.target.checked ? divisionId : item.divisionId,
                                        districtId: e.target.checked ? districtId : item.districtId,
                                        upazilaId: e.target.checked ? upazilaId : item.upazilaId,
                                        village: e.target.checked ? village : item.village,
                                        address: e.target.checked ? fullAddress : item.address,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                          Same as Main Guest Address
                        </label>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <Field label="Division *">
                            <select
                              className={selectClass}
                              value={guest.divisionId || ""}
                              disabled={Boolean(guest.sameAsMain)}
                              onChange={(e) =>
                                setAdditionalGuests((current) =>
                                  current.map((item) =>
                                    item.id === guest.id
                                      ? {
                                          ...item,
                                          divisionId: e.target.value,
                                          districtId: "",
                                          upazilaId: "",
                                          village: "",
                                          address: "",
                                          sameAsMain: false,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            >
                              <option value="">Select Division</option>
                              {divisions.map((division) => (
                                <option key={division.id} value={division.id}>
                                  {division.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="District *">
                            <select
                              className={selectClass}
                              value={guest.districtId || ""}
                              disabled={Boolean(guest.sameAsMain) || !guest.divisionId}
                              onChange={(e) =>
                                setAdditionalGuests((current) =>
                                  current.map((item) =>
                                    item.id === guest.id
                                      ? {
                                          ...item,
                                          districtId: e.target.value,
                                          upazilaId: "",
                                          village: "",
                                          address: "",
                                          sameAsMain: false,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            >
                              <option value="">
                                {guest.divisionId ? "Select District" : "Select Division first"}
                              </option>
                              {(guest.divisionId
                                ? getDistrictsByDivision(guest.divisionId)
                                : []
                              ).map((district) => (
                                <option key={district.id} value={district.id}>
                                  {district.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Thana / Upazila *">
                            <select
                              className={selectClass}
                              value={guest.upazilaId || ""}
                              disabled={Boolean(guest.sameAsMain) || !guest.districtId}
                              onChange={(e) =>
                                setAdditionalGuests((current) =>
                                  current.map((item) => {
                                    if (item.id !== guest.id) return item;
                                    const upazilaName =
                                      getUpazilasByDistrict(item.districtId || "").find(
                                        (upazila) => upazila.id === e.target.value,
                                      )?.name || "";
                                    const districtName =
                                      getDistrictsByDivision(item.divisionId || "").find(
                                        (district) => district.id === item.districtId,
                                      )?.name || "";
                                    const divisionName =
                                      divisions.find((division) => division.id === item.divisionId)
                                        ?.name || "";
                                    return {
                                      ...item,
                                      upazilaId: e.target.value,
                                      village: "",
                                      address: [divisionName, districtName, upazilaName]
                                        .filter(Boolean)
                                        .join(", "),
                                      sameAsMain: false,
                                    };
                                  }),
                                )
                              }
                            >
                              <option value="">
                                {guest.districtId
                                  ? "Select Thana / Upazila"
                                  : "Select District first"}
                              </option>
                              {(guest.districtId
                                ? getUpazilasByDistrict(guest.districtId)
                                : []
                              ).map((upazila) => (
                                <option key={upazila.id} value={upazila.id}>
                                  {upazila.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Village *">
                            <input
                              className={inputClass}
                              placeholder="Village name"
                              value={guest.village || ""}
                              disabled={Boolean(guest.sameAsMain)}
                              onChange={(e) =>
                                setAdditionalGuests((current) =>
                                  current.map((item) => {
                                    if (item.id !== guest.id) return item;
                                    const divisionName =
                                      divisions.find((division) => division.id === item.divisionId)
                                        ?.name || "";
                                    const districtName =
                                      getDistrictsByDivision(item.divisionId || "").find(
                                        (district) => district.id === item.districtId,
                                      )?.name || "";
                                    const upazilaName =
                                      getUpazilasByDistrict(item.districtId || "").find(
                                        (upazila) => upazila.id === item.upazilaId,
                                      )?.name || "";
                                    return {
                                      ...item,
                                      village: e.target.value,
                                      address: [
                                        divisionName,
                                        districtName,
                                        upazilaName,
                                        e.target.value,
                                      ]
                                        .filter(Boolean)
                                        .join(", "),
                                      sameAsMain: false,
                                    };
                                  }),
                                )
                              }
                            />
                          </Field>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <SectionTitle
              title="Room Information"
              action={<BedDouble className="h-4 w-4 text-muted-foreground" />}
            />
            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
              <Field label="Room Type">
                <select
                  className={selectClass}
                  value={roomTypeFilter}
                  onChange={(e) => {
                    const newFilter = e.target.value;
                    setRoomTypeFilter(newFilter);
                    if (newFilter && selectedRoom) {
                      const stillValid = availableRooms.find(
                        (r) => r.number === selectedRoom && r.type === newFilter,
                      );
                      if (!stillValid) {
                        setSelectedRoom("");
                        setRoomRent("");
                      }
                    }
                  }}
                >
                  <option value="">All Types</option>
                  {roomTypesInUse.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Room Number">
                <select
                  className={selectClass}
                  value={selectedRoom}
                  onChange={(e) => {
                    const roomNumber = e.target.value;
                    setSelectedRoom(roomNumber);
                    const room = availableRooms.find((r) => r.number === roomNumber);
                    setRoomRent(room ? room.rent.toString() : "");
                    if (room) setRoomTypeFilter(room.type);
                  }}
                >
                  <option value="">Select Room</option>
                  {filteredAvailableRooms.map((r) => (
                    <option key={r.number} value={r.number}>
                      {r.number}
                    </option>
                  ))}
                </select>
                {roomTypeFilter && filteredAvailableRooms.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    এই মুহূর্তে কোনো Available {roomTypeFilter} Room নেই।
                  </p>
                )}
              </Field>
              <Field label="Check-in Date">
                <input
                  type="date"
                  className={inputClass}
                  value={checkInDate}
                  onChange={(e) => setCheckInDate(e.target.value)}
                />
              </Field>
              <Field label="Check-in Time">
                <input
                  type="time"
                  className={inputClass}
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                />
              </Field>
              <Field label="Expected Check-out Date">
                <input
                  type="date"
                  className={inputClass}
                  value={checkOutDate}
                  onChange={(e) => setCheckOutDate(e.target.value)}
                />
              </Field>
              <Field label="Expected Check-out Time">
                <input
                  type="time"
                  className={inputClass}
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <SectionTitle
              title="Payment Information"
              action={<CreditCard className="h-4 w-4 text-muted-foreground" />}
            />
            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
              <Field label="Room Rent (per night)">
                <input
                  className={inputClass}
                  value={roomRent}
                  onChange={(e) => setRoomRent(e.target.value)}
                  placeholder="Select a room first"
                />
              </Field>
              <Field label="Discount">
                <input
                  className={inputClass}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Advance Payment">
                <input
                  className={inputClass}
                  type="number"
                  placeholder="0"
                  value={advancePayment}
                  onChange={(e) => setAdvancePayment(Number(e.target.value))}
                />
              </Field>
              <Field label="Payment Method">
                <select
                  className={selectClass}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option>Cash</option>
                  <option>bKash</option>
                  <option>Nagad</option>
                  <option>Card</option>
                  <option>Bank Transfer</option>
                </select>
              </Field>

              <div className="md:col-span-3">
                <Field label="Notes">
                  <textarea
                    className={textareaClass}
                    placeholder="Special requests, ID verification notes, etc."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </Card>

          <div className="flex justify-end">
            <button
              className={
                buttonPrimary +
                " h-12 px-8 text-base disabled:cursor-not-allowed disabled:opacity-60"
              }
              onClick={() => handleSaveBooking()}
              disabled={isSaving}
              aria-busy={isSaving}
            >
              <Save className="h-5 w-5" />
              {isSaving ? "Saving..." : "Save Booking"}
            </button>
          </div>
        </div>

        <Card className="h-fit p-6">
          <h3 className="text-sm font-semibold text-foreground">Booking Summary</h3>
          <p className="text-xs text-muted-foreground">Live preview of charges</p>
          <dl className="mt-4 space-y-3 text-sm">
            <Row
              label="Room"
              value={selectedRoom ? `${selectedRoom} · ${roomInfo?.type ?? ""}` : "-"}
            />
            <Row label="Nights" value={String(nights)} />
            <Row label="Room Rent" value={`৳${roomRent || 0}`} />
            <Row label="Discount" value={`৳${discount || 0}`} />
            <div className="my-2 border-t border-border" />
            <Row label="Estimated Total" value={`৳${totalRent}`} bold />
            <Row label="Advance" value={`৳${advancePayment || 0}`} />
            {previousDue > 0 && (
              <Row label="আগের বকেয়া (Carried)" value={`৳${previousDue.toLocaleString()}`} />
            )}
            <Row label="Estimated Due" value={`৳${due}`} bold />
          </dl>
        </Card>
      </div>

      <CameraCapture
        open={cameraFor !== null}
        title={cameraFor === "nid" ? "NID-এর ছবি তোলো" : "Customer-এর ছবি তোলো"}
        onClose={() => setCameraFor(null)}
        onCapture={handleCameraCapture}
      />

      {bookingComplete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-complete-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
            <h2 id="booking-complete-title" className="mt-4 text-xl font-bold text-slate-900">
              Booking Complete
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Room <span className="font-bold text-emerald-700">{bookingComplete.room}</span> has
              been booked successfully.
            </p>
            <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <div className="font-semibold">{bookingComplete.customerName}</div>
              <div className="mt-1 text-xs text-emerald-700">
                Booking ID: {bookingComplete.bookingId}
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                className={buttonGhost + " justify-center"}
                onClick={async () => {
                  setBookingComplete(null);
                  await resetForm();
                }}
              >
                Close
              </button>
              <button
                type="button"
                className={buttonPrimary + " justify-center"}
                onClick={async () => {
                  setBookingComplete(null);
                  await resetForm();
                }}
              >
                New Booking
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateGuest && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="duplicate-guest-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl">
                ⚠️
              </div>
              <div>
                <h2 id="duplicate-guest-title" className="text-lg font-bold text-slate-900">
                  Active guest found
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Phone number{" "}
                  <span className="font-semibold text-slate-900">{duplicateGuest.phone}</span> is
                  already checked in for{" "}
                  <span className="font-semibold text-slate-900">
                    {duplicateGuest.customerName}
                  </span>{" "}
                  in Room{" "}
                  <span className="font-semibold text-slate-900">{duplicateGuest.room}</span>.
                </p>
                <p className="mt-2 text-sm font-medium text-amber-700">
                  Do you want to create another booking for this family or group?
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className={buttonGhost + " justify-center"}
                onClick={() => setDuplicateGuest(null)}
              >
                No, Cancel
              </button>
              <button
                type="button"
                className={buttonPrimary + " justify-center"}
                onClick={async () => {
                  setDuplicateGuest(null);
                  await handleSaveBooking({ skipDuplicateCheck: true });
                }}
              >
                Yes, Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={bold ? "font-bold text-foreground" : "font-medium text-foreground"}>
        {value}
      </dd>
    </div>
  );
}
