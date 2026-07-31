import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui-kit";

interface Stay {
  id: string;
  room: string;
  customer: string;
  remaining: number;
  rent?: number;
  checkIn?: string;
  advance?: number;
  previousDue?: number;
  deposits?: { amount: number; date: string }[];
}

interface Props {
  activeStays: Stay[];
}

function depositsTotalOf(stay: Stay) {
  return (stay.deposits || []).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
}

function nightsSoFar(checkIn?: string) {
  if (!checkIn) return 1;
  const start = new Date(checkIn).getTime();
  const end = Date.now();
  if (Number.isNaN(start)) return 1;
  return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
}

// Live due = today's estimated due, factoring in any deposits paid during
// the stay. Falls back to the frozen `remaining` if we don't have enough
// stay detail to recompute it (e.g. older/mock data).
function liveDueOf(stay: Stay) {
  if (stay.rent == null || !stay.checkIn) return stay.remaining;
  const total =
    stay.rent * nightsSoFar(stay.checkIn) +
    (stay.previousDue || 0) -
    (stay.advance || 0) -
    depositsTotalOf(stay);
  return Math.max(0, total);
}

export default function PendingCheckout({ activeStays }: Props) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h2 className="text-sm font-semibold">Pending Check Outs</h2>

        <Link to="/checkout" className="text-xs font-semibold text-primary hover:underline">
          View all
        </Link>
      </div>

      <ul className="divide-y divide-border">
        {activeStays.slice(0, 5).map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-6 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-sm font-bold text-primary">
              {s.room}
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">{s.customer}</div>

              <div className="text-[11px] text-muted-foreground">
                Remaining ৳{liveDueOf(s).toLocaleString()}
              </div>
            </div>

            <Link
              to="/checkout"
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Checkout
            </Link>
          </li>
        ))}
        {activeStays.length === 0 && (
          <li className="px-6 py-10 text-center text-sm text-muted-foreground">
            No guests currently checked in.
          </li>
        )}
      </ul>
    </Card>
  );
}
