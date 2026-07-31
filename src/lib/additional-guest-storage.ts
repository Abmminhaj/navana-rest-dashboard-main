export interface AdditionalGuest {
  id: string;
  name: string;
  nid: string;
  phone: string;
  fatherName: string;
  address: string;
  divisionId?: string;
  districtId?: string;
  upazilaId?: string;
  village?: string;
  sameAsMain?: boolean;
}

const MARKER = "__NAVANA_ADDITIONAL_GUESTS__";

export function parseAdditionalGuests(notes?: string | null): AdditionalGuest[] {
  if (!notes) return [];
  const markerIndex = notes.indexOf(MARKER);
  if (markerIndex < 0) return [];

  try {
    const parsed = JSON.parse(notes.slice(markerIndex + MARKER.length).trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function mergeAdditionalGuests(
  notes: string | undefined,
  guests: AdditionalGuest[] | undefined,
) {
  const baseNotes = (notes || "").split(MARKER)[0].trimEnd();
  if (!guests || guests.length === 0) return baseNotes;
  return `${baseNotes}${baseNotes ? "\n\n" : ""}${MARKER}${JSON.stringify(guests)}`;
}
