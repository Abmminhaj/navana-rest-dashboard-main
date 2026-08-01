import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { Card, StatusPill, buttonGhost, buttonPrimary } from "@/components/ui-kit";
import { getRoomTypeColor } from "@/lib/room-type-colors";

interface Room {
  number: string;
  type: string;
  status: string;
  amenities?: string[];
}

interface ActiveStayInfo {
  room: string;
  customer: string;
  phone: string;
  checkIn: string;
  expectedCheckOut: string;
}

interface Props {
  rooms: Room[];
  statusColor: Record<string, string>;
  activeStays?: ActiveStayInfo[];
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${swatch}`} />
      <span>{label}</span>
    </div>
  );
}

const statusTone: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  Available: "success",
  Occupied: "danger",
  Cleaning: "warning",
  Maintenance: "neutral",
  Reserved: "neutral",
};

export default function RoomStatus({ rooms, statusColor, activeStays = [] }: Props) {
  const [preview, setPreview] = useState<Room | null>(null);
  const guest = preview ? activeStays.find((s) => s.room === preview.number) : undefined;

  return (
    <Card className="xl:col-span-2">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h2 className="text-sm font-semibold">Room Status Overview</h2>

        <div className="flex items-center gap-3 text-[11px]">
          <Legend swatch="bg-emerald-500" label="Available" />
          <Legend swatch="bg-rose-500" label="Occupied" />
          <Legend swatch="bg-amber-500" label="Cleaning" />
          <Legend swatch="bg-slate-400" label="Maintenance" />
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {rooms.map((r) => (
            <button
              key={r.number}
              type="button"
              onClick={() => setPreview(r)}
              className={`rounded-xl border px-3 py-3 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-md ${statusColor[r.status]}`}
            >
              <div className={`text-lg font-bold ${getRoomTypeColor(r.type)}`}>{r.number}</div>

              <div className="mt-1 text-[10px] uppercase opacity-80">{r.type}</div>

              {(r.amenities || []).length > 0 && (
                <div
                  className="mt-1 truncate text-[10px] opacity-70"
                  title={(r.amenities || []).join(", ")}
                >
                  {(r.amenities || []).slice(0, 2).join(" · ")}
                  {(r.amenities || []).length > 2 ? ` +${(r.amenities || []).length - 2}` : ""}
                </div>
              )}

              <div className="mt-2 text-[11px] font-semibold">{r.status}</div>
            </button>
          ))}
        </div>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className={`text-2xl font-bold ${getRoomTypeColor(preview.type)}`}>
                  Room {preview.number}
                </div>
                <div className="mt-0.5 text-xs uppercase text-muted-foreground">{preview.type}</div>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3">
              <StatusPill tone={statusTone[preview.status] || "neutral"}>
                {preview.status}
              </StatusPill>
            </div>

            {guest ? (
              <div className="mt-4 space-y-1.5 rounded-xl bg-muted/40 p-3 text-sm">
                <div className="font-semibold text-foreground">{guest.customer}</div>
                <div className="text-muted-foreground">{guest.phone}</div>
                <div className="text-xs text-muted-foreground">
                  Check-in: {guest.checkIn} · Checkout: {guest.expectedCheckOut}
                </div>
              </div>
            ) : (
              (preview.amenities || []).length > 0 && (
                <div className="mt-4 text-sm text-muted-foreground">
                  {(preview.amenities || []).join(", ")}
                </div>
              )
            )}

            <div className="mt-5 flex gap-2">
              <Link
                to="/rooms"
                search={{ status: preview.status } as any}
                className={buttonGhost + " flex-1 justify-center"}
                onClick={() => setPreview(null)}
              >
                Rooms Page
              </Link>
              {guest && (
                <Link
                  to="/checkout"
                  className={buttonPrimary + " flex-1 justify-center"}
                  onClick={() => setPreview(null)}
                >
                  Go to Checkout
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
