export const ROOM_TYPE_PRESETS = ["Standard", "Deluxe", "Suite", "Duplex", "VIP"];

const ROOM_TYPE_COLORS: Record<string, string> = {
  Standard: "text-slate-700",
  Deluxe: "text-blue-600",
  Suite: "text-purple-600",
  Duplex: "text-teal-600",
  VIP: "text-amber-600",
};

const FALLBACK_TYPE_COLORS = [
  "text-rose-600",
  "text-emerald-600",
  "text-indigo-600",
  "text-orange-600",
  "text-cyan-600",
  "text-fuchsia-600",
];

export function getRoomTypeColor(type: string): string {
  if (ROOM_TYPE_COLORS[type]) return ROOM_TYPE_COLORS[type];

  let hash = 0;
  for (let i = 0; i < type.length; i++) {
    hash = (hash * 31 + type.charCodeAt(i)) >>> 0;
  }

  return FALLBACK_TYPE_COLORS[hash % FALLBACK_TYPE_COLORS.length];
}
