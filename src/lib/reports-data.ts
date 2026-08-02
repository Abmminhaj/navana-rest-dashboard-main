import { getBookings } from "./booking-storage";
import {
  getCustomerHistory,
  parseDuePayments,
  type CustomerHistoryRecord,
} from "./customer-history-storage";
import { getActiveStays } from "./stay-storage";
import { getExpenses } from "./expense-storage";
import { getRooms } from "./room-storage";

export type ReportPeriod = "Daily" | "Weekly" | "Monthly" | "Yearly";

export interface PeriodRow {
  label: string;
  income: number;
  expense: number;
  profit: number;
  occupancy: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateOnly(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// "NRH-20260721-0004" -> "2026-07-21"
function bookingDate(bookingId: string | undefined): string | null {
  const match = /NRH-(\d{4})(\d{2})(\d{2})-\d{4}/.exec(bookingId || "");
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function parseDateOnly(str: string | undefined | null): Date | null {
  if (!str) return null;
  const d = new Date(`${str.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getPeriodRanges(period: ReportPeriod): { label: string; start: Date; end: Date }[] {
  const today = dateOnly(new Date());
  const ranges: { label: string; start: Date; end: Date }[] = [];

  if (period === "Daily") {
    for (let i = 6; i >= 0; i--) {
      const start = new Date(today);
      start.setDate(today.getDate() - i);
      const end = new Date(start);
      end.setDate(start.getDate() + 1);
      ranges.push({
        label: start.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
        start,
        end,
      });
    }
  } else if (period === "Weekly") {
    // Rolling last-7-days blocks, most recent block ends today (not calendar Mon-Sun weeks)
    for (let i = 5; i >= 0; i--) {
      const end = new Date(today);
      end.setDate(today.getDate() - i * 7 + 1); // exclusive upper bound
      const start = new Date(end);
      start.setDate(end.getDate() - 7);
      const startLabel = start.toLocaleDateString("en-US", { day: "numeric", month: "short" });
      const endLabel = new Date(end.getTime() - MS_PER_DAY).toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
      });
      ranges.push({ label: `${startLabel} - ${endLabel}`, start, end });
    }
  } else if (period === "Monthly") {
    for (let i = 5; i >= 0; i--) {
      const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
      ranges.push({ label: start.toLocaleString("en-US", { month: "short" }), start, end });
    }
  } else {
    for (let i = 3; i >= 0; i--) {
      const start = new Date(today.getFullYear() - i, 0, 1);
      const end = new Date(today.getFullYear() - i + 1, 0, 1);
      ranges.push({ label: String(start.getFullYear()), start, end });
    }
  }

  return ranges;
}

export async function getReportData(period: ReportPeriod): Promise<PeriodRow[]> {
  const bookings = await getBookings();
  const history = await getCustomerHistory();
  const activeStays = await getActiveStays();
  const expenses = await getExpenses();
  const rooms = await getRooms();
  const totalRooms = rooms.length || 1;
  const now = new Date();

  // Build real stay intervals (check-in -> actual/ongoing check-out) for occupancy math
  const stayIntervals: { start: Date; end: Date }[] = [];

  activeStays.forEach((s: any) => {
    const start = parseDateOnly(s.checkIn);
    if (!start) return;
    stayIntervals.push({ start, end: now }); // still occupied, counts up to now
  });

  history.forEach((r: CustomerHistoryRecord) => {
    const start = parseDateOnly(r.checkIn);
    const end = parseDateOnly(r.checkoutDate);
    if (!start) return;
    // include the checkout day itself as one occupied night
    stayIntervals.push({ start, end: end ? new Date(end.getTime() + MS_PER_DAY) : now });
  });

  const ranges = getPeriodRanges(period);

  return ranges.map(({ label, start, end }) => {
    const bookingIncome = bookings
      .filter((b: any) => {
        const d = parseDateOnly(bookingDate(b.bookingId));
        return d && d >= start && d < end;
      })
      .reduce((sum: number, b: any) => sum + (Number(b.advancePayment) || 0), 0);

    const checkoutIncome = history
      .filter((r) => {
        const d = parseDateOnly(r.checkoutDate);
        return d && d >= start && d < end;
      })
      .reduce((sum, r) => sum + (Number(r.remaining) || 0), 0);

    const duePaymentIncome = history
      .flatMap((r) => parseDuePayments(r.checkoutNotes))
      .filter((p) => {
        const d = parseDateOnly(p.date);
        return d && d >= start && d < end;
      })
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // Deposits added during an active stay are datable directly. Once a stay
    // checks out, its individual deposit dates collapse into a single total
    // (see customer-history-storage.ts), so that total is attributed to the
    // checkout day — the same convention already used for checkoutIncome.
    const activeDepositIncome = activeStays.reduce((sum: number, s: any) => {
      const dated = (s.deposits || []).filter((d: any) => {
        const dd = parseDateOnly(d.date);
        return dd && dd >= start && dd < end;
      });
      return sum + dated.reduce((s2: number, d: any) => s2 + (Number(d.amount) || 0), 0);
    }, 0);

    const checkedOutDepositIncome = history
      .filter((r) => {
        const d = parseDateOnly(r.checkoutDate);
        return d && d >= start && d < end;
      })
      .reduce((sum, r) => sum + (Number((r as any).deposits) || 0), 0);

    const depositIncome = activeDepositIncome + checkedOutDepositIncome;

    const expense = expenses
      .filter((e) => {
        const d = parseDateOnly(e.date);
        return d && d >= start && d < end;
      })
      .reduce((sum, e) => sum + e.amount, 0);

    const periodDays = Math.max(1, (end.getTime() - start.getTime()) / MS_PER_DAY);

    const occupiedNights = stayIntervals.reduce((sum, s) => {
      const overlapStart = s.start > start ? s.start : start;
      const overlapEnd = s.end < end ? s.end : end;
      const nights = (overlapEnd.getTime() - overlapStart.getTime()) / MS_PER_DAY;
      return sum + Math.max(0, nights);
    }, 0);

    const occupancy = Math.max(
      0,
      Math.min(100, Math.round((occupiedNights / (totalRooms * periodDays)) * 100)),
    );

    const income = bookingIncome + checkoutIncome + duePaymentIncome + depositIncome;

    return { label, income, expense, profit: income - expense, occupancy };
  });
}

export function percentDelta(current: number, previous: number): string {
  if (previous === 0) {
    return current > 0 ? "New" : "0%";
  }
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Room-wise income breakdown (for a chosen day, defaults to today)
// ---------------------------------------------------------------------------

export interface RoomIncomeRow {
  room: string;
  roomType?: string;
  booking: number; // advance taken when the booking was made, that day
  due: number; // old due cleared that day
  deposit: number; // interim deposit added during an active stay, that day
  checkout: number; // remaining balance settled at actual checkout, that day
  total: number;
}

/**
 * Breaks a single day's income down by room: booking advance, due payments
 * cleared, interim deposits, and the remaining balance settled at actual
 * checkout — the same four sources that make up Reports' period income
 * total, so the two stay reconciled. Deposits are read from currently
 * active stays (dated per-deposit) plus stays that checked out that day
 * (their deposit total is attributed to the checkout day, since per-deposit
 * dates aren't kept after checkout).
 */
export async function getRoomIncomeForDate(
  targetDate: Date = new Date(),
): Promise<RoomIncomeRow[]> {
  const [bookings, history, activeStays] = await Promise.all([
    getBookings(),
    getCustomerHistory(),
    getActiveStays(),
  ]);

  const start = dateOnly(targetDate);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  const inToday = (d: Date | null) => !!d && d >= start && d < end;

  const rows = new Map<string, RoomIncomeRow>();
  function rowFor(room: string, roomType?: string): RoomIncomeRow {
    if (!rows.has(room)) {
      rows.set(room, { room, roomType, booking: 0, due: 0, deposit: 0, checkout: 0, total: 0 });
    }
    const existing = rows.get(room)!;
    if (roomType && !existing.roomType) existing.roomType = roomType;
    return existing;
  }

  bookings.forEach((b: any) => {
    if (!b.room || !inToday(parseDateOnly(bookingDate(b.bookingId)))) return;
    rowFor(b.room, b.roomType).booking += Number(b.advancePayment) || 0;
  });

  history.forEach((r: CustomerHistoryRecord) => {
    parseDuePayments(r.checkoutNotes)
      .filter((p) => inToday(parseDateOnly(p.date)))
      .forEach((p) => {
        rowFor(r.room).due += Number(p.amount) || 0;
      });

    // Once a stay checks out, its individual deposit dates collapse into a
    // single total (see customer-history-storage.ts) — so if the checkout
    // itself happened today, attribute that whole deposit total to today.
    if (inToday(parseDateOnly(r.checkoutDate))) {
      rowFor(r.room).deposit += Number((r as any).deposits) || 0;
      rowFor(r.room).checkout += Number(r.remaining) || 0;
    }
  });

  (activeStays as any[]).forEach((s) => {
    (s.deposits || [])
      .filter((d: any) => inToday(parseDateOnly(d.date)))
      .forEach((d: any) => {
        rowFor(s.room).deposit += Number(d.amount) || 0;
      });
  });

  return Array.from(rows.values())
    .map((row) => ({ ...row, total: row.booking + row.due + row.deposit + row.checkout }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// Room popularity (booking count per room, over the Monthly/Yearly window)
// ---------------------------------------------------------------------------

export interface RoomPopularityRow {
  room: string;
  roomType?: string;
  count: number;
}

/**
 * Counts how many bookings each room got within the currently visible
 * Monthly (last 6 months) or Yearly (last 4 years) window, most-booked
 * first — so it's easy to see which rooms sell well and which barely get
 * booked at all.
 */
export async function getRoomPopularity(
  period: Extract<ReportPeriod, "Monthly" | "Yearly">,
): Promise<RoomPopularityRow[]> {
  const bookings = await getBookings();
  const ranges = getPeriodRanges(period);
  const start = ranges[0].start;
  const end = ranges[ranges.length - 1].end;

  const rows = new Map<string, RoomPopularityRow>();

  bookings.forEach((b: any) => {
    if (!b.room) return;
    const d = parseDateOnly(bookingDate(b.bookingId));
    if (!d || d < start || d >= end) return;

    const existing = rows.get(b.room) || { room: b.room, roomType: b.roomType, count: 0 };
    existing.count += 1;
    rows.set(b.room, existing);
  });

  return Array.from(rows.values()).sort((a, b) => b.count - a.count);
}
