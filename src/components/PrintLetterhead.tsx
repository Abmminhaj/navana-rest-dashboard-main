import { getHotelProfile } from "@/lib/settings-storage";

/**
 * "Navana Letter Pad" style header — used for Customer Details and Report
 * print-outs. Pulls Hotel Name / Address / Contact Number(s) live from
 * Settings so the print-out always reflects the latest saved profile.
 */
export function PrintLetterhead({ documentTitle }: { documentTitle: string }) {
  const profile = getHotelProfile();
  const phones = profile.contactPhones.filter(Boolean);

  return (
    <div className="mb-6 border-b-2 border-black pb-4 text-center">
      <h1 className="text-2xl font-bold tracking-wide">{profile.hotelName}</h1>
      {profile.address && <p className="mt-1 text-xs text-gray-700">{profile.address}</p>}
      {phones.length > 0 && (
        <p className="text-xs text-gray-700">Contact: {phones.join("  ·  ")}</p>
      )}
      <p className="mt-2 text-sm font-semibold uppercase tracking-widest">{documentTitle}</p>
      <p className="mt-1 text-[11px] text-gray-500">
        Printed on{" "}
        {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
      </p>
    </div>
  );
}

/** Small helper so any print view can show hotel contact info inline (e.g. invoice footer). */
export function useHotelProfileForPrint() {
  return getHotelProfile();
}
