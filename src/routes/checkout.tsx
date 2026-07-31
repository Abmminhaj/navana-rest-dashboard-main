import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, X, Search, Wallet, Download, Printer, CheckCircle2 } from "lucide-react";
import {
  Card,
  Field,
  PageHeader,
  SectionTitle,
  StatusPill,
  buttonGhost,
  buttonPrimary,
  inputClass,
  selectClass,
  textareaClass,
} from "@/components/ui-kit";
import { getActiveStays, removeActiveStay, addDeposit } from "@/lib/stay-storage";
import { updateRoomStatus } from "@/lib/room-storage";
import type { ActiveStay } from "@/lib/mock-data";
import { saveCustomerHistory } from "@/lib/customer-history-storage";
import { notifyCheckOut } from "@/lib/notification-engine";
import { getHotelProfile } from "@/lib/settings-storage";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Check Out — Navana Rest House" }] }),
  component: CheckoutPage,
});

interface CompletedInvoice {
  invoiceNo: string;
  room: string;
  customer: string;
  phone: string;
  nid: string;
  address: string;
  checkIn: string;
  checkoutDate: string;
  checkoutTime: string;
  nights: number;
  rent: number;
  stayTotal: number;
  previousDue: number;
  advance: number;
  deposits: number;
  paidNow: number;
  paymentMethod: string;
  totalDue: number;
  finalDue: number;
  notes?: string;
  additionalGuests?: {
    id: string;
    name: string;
    nid: string;
    phone: string;
    fatherName: string;
    address: string;
  }[];
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function depositsTotalOf(stay: ActiveStay) {
  return (stay.deposits || []).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
}

function nightsBetween(checkIn: string, endDateISO: string) {
  const start = new Date(checkIn).getTime();
  const end = new Date(endDateISO).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 1;
  return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
}

function CheckoutPage() {
  const [list, setList] = useState<ActiveStay[]>([]);
  const [active, setActive] = useState<ActiveStay | null>(null);
  const [query, setQuery] = useState("");

  const [checkoutDate, setCheckoutDate] = useState(new Date().toISOString().slice(0, 10));
  const [checkoutTime, setCheckoutTime] = useState(nowHHMM());
  const [paidNow, setPaidNow] = useState(0);
  const [paidNowTouched, setPaidNowTouched] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [checkoutNotes, setCheckoutNotes] = useState("");

  const [depositTarget, setDepositTarget] = useState<ActiveStay | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10));
  const [completedInvoice, setCompletedInvoice] = useState<CompletedInvoice | null>(null);

  useEffect(() => {
    refreshList();
  }, []);

  async function refreshList() {
    setList(await getActiveStays());
  }

  function openCheckout(stay: ActiveStay) {
    const today = new Date().toISOString().slice(0, 10);
    const nights = nightsBetween(stay.checkIn, today);
    const stayTotal = stay.rent * nights;
    const totalDue = stayTotal + (stay.previousDue || 0) - stay.advance - depositsTotalOf(stay);

    setActive(stay);
    setCheckoutDate(today);
    setCheckoutTime(nowHHMM());
    setPaidNow(Math.max(0, totalDue));
    setPaidNowTouched(false);
    setPaymentMethod("Cash");
    setCheckoutNotes("");
  }

  async function handleSaveDeposit() {
    if (!depositTarget) return;
    const amt = Number(depositAmount);
    if (!amt || amt <= 0) return;

    await addDeposit(depositTarget.id, amt, depositDate);
    await refreshList();
    setDepositTarget(null);
    setDepositAmount("");
    setDepositDate(new Date().toISOString().slice(0, 10));
  }

  const filtered = list.filter(
    (s) =>
      s.customer.toLowerCase().includes(query.toLowerCase()) ||
      s.room.includes(query) ||
      s.phone.includes(query),
  );

  function handleExportList() {
    const today = new Date().toISOString().slice(0, 10);
    const header = [
      "Room",
      "Customer",
      "Phone",
      "NID",
      "Check In",
      "Expected Check Out",
      "Advance",
      "Deposits",
      "Total Paid",
      "Estimated Due (Today)",
    ];

    const rows = filtered.map((s) => {
      const dep = depositsTotalOf(s);
      const totalPaid = s.advance + dep;
      const nightsSoFar = nightsBetween(s.checkIn, today);
      const estDue = Math.max(0, s.rent * nightsSoFar + (s.previousDue || 0) - totalPaid);
      return [
        s.room,
        s.customer,
        s.phone,
        s.nid,
        s.checkIn,
        s.expectedCheckOut,
        String(s.advance),
        String(dep),
        String(totalPaid),
        String(estDue),
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `navana-pending-checkouts-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const actualNights = active ? nightsBetween(active.checkIn, checkoutDate) : 0;
  const activeDepositsTotal = active ? depositsTotalOf(active) : 0;
  const stayTotal = active ? active.rent * actualNights : 0;
  const totalDue = active
    ? stayTotal + (active.previousDue || 0) - active.advance - activeDepositsTotal
    : 0;
  const outstandingAfter = totalDue - paidNow;

  // If the checkout date (and therefore total due) changes after the modal
  // is opened, keep "Paid Now" in sync with the new full amount — but only
  // if the staff hasn't manually typed their own Paid Now value. Otherwise
  // a stale "Paid Now" silently leaves a due behind even though the button
  // was left on its "pay in full" default.
  useEffect(() => {
    if (active && !paidNowTouched) {
      setPaidNow(Math.max(0, totalDue));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutDate, active]);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Pending Check Outs"
          description="Guests currently checked-in. Complete checkout to settle balance and free the room."
          actions={
            <button
              onClick={handleExportList}
              className={buttonGhost}
              disabled={filtered.length === 0}
            >
              <Download className="h-4 w-4" /> Export List
            </button>
          }
        />

        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className={inputClass + " pl-9"}
                placeholder="Search by name, room or phone…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{filtered.length}</span> active stays
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Check In</th>
                  <th className="px-4 py-3">Expected Check Out</th>
                  <th className="px-4 py-3 text-right">Total Paid</th>
                  <th className="px-4 py-3 text-right">Est. Due (today)</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const dep = depositsTotalOf(s);
                  const totalPaid = s.advance + dep;
                  const nightsSoFar = nightsBetween(
                    s.checkIn,
                    new Date().toISOString().slice(0, 10),
                  );
                  const estDue = s.rent * nightsSoFar + (s.previousDue || 0) - totalPaid;
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex h-9 w-12 items-center justify-center rounded-md bg-primary-soft text-sm font-bold text-primary">
                          {s.room}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{s.customer}</div>
                        <div className="text-[11px] text-muted-foreground">NID {s.nid}</div>
                        {s.additionalGuests && s.additionalGuests.length > 0 && (
                          <div className="mt-1 text-[11px] text-blue-600">
                            + {s.additionalGuests.map((guest) => guest.name).join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-foreground">{s.phone}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.checkIn}</td>
                      <td className="px-4 py-3">
                        <div className="text-foreground">{s.expectedCheckOut}</div>
                        <StatusPill tone="warning">Due today</StatusPill>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        ৳{totalPaid.toLocaleString()}
                        {dep > 0 && (
                          <div className="text-[11px] font-normal text-emerald-600">
                            (Advance ৳{s.advance.toLocaleString()} + Deposit ৳{dep.toLocaleString()}
                            )
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-600">
                        ৳{Math.max(0, estDue).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setDepositTarget(s);
                              setDepositAmount("");
                              setDepositDate(new Date().toISOString().slice(0, 10));
                            }}
                            className={buttonGhost + " h-8 px-3 text-xs"}
                          >
                            <Wallet className="h-3.5 w-3.5" /> Deposit
                          </button>
                          <button
                            onClick={() => openCheckout(s)}
                            className={buttonPrimary + " h-8 px-3 text-xs"}
                          >
                            <LogOut className="h-3.5 w-3.5" /> Checkout
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-16 text-center text-sm text-muted-foreground"
                    >
                      No pending check-outs. 🎉
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {active && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
              <div className="flex items-start justify-between border-b border-border px-6 py-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Checkout — Room {active.room}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {active.customer} · {active.phone}
                  </p>
                  {active.additionalGuests && active.additionalGuests.length > 0 && (
                    <p className="mt-1 text-xs text-blue-600">
                      Additional Guests:{" "}
                      {active.additionalGuests.map((guest) => guest.name).join(", ")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setActive(null)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-1 border-b border-border bg-muted/20 px-6 py-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Actual Stay</span>
                  <span className="font-medium text-foreground">
                    {actualNights} night(s) × ৳{active.rent.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stay Total</span>
                  <span className="font-medium text-foreground">৳{stayTotal.toLocaleString()}</span>
                </div>
                {(active.previousDue || 0) > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>আগের বকেয়া (Carried)</span>
                    <span className="font-medium">
                      ৳{(active.previousDue || 0).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Advance Paid</span>
                  <span className="font-medium text-foreground">
                    − ৳{active.advance.toLocaleString()}
                  </span>
                </div>
                {activeDepositsTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deposits During Stay</span>
                    <span className="font-medium text-foreground">
                      − ৳{activeDepositsTotal.toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="mt-1 flex justify-between border-t border-border pt-1 text-base font-bold">
                  <span className="text-foreground">Total Due Now</span>
                  <span className="text-primary">৳{Math.max(0, totalDue).toLocaleString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
                <Field label="Checkout Date">
                  <input
                    type="date"
                    className={inputClass}
                    value={checkoutDate}
                    onChange={(e) => setCheckoutDate(e.target.value)}
                  />
                </Field>
                <Field label="Checkout Time">
                  <input
                    type="time"
                    className={inputClass}
                    value={checkoutTime}
                    onChange={(e) => setCheckoutTime(e.target.value)}
                  />
                </Field>
                <Field label="Paid Now (৳)">
                  <input
                    type="number"
                    className={inputClass}
                    value={paidNow}
                    onChange={(e) => {
                      setPaidNowTouched(true);
                      setPaidNow(Number(e.target.value));
                    }}
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
                <div className="md:col-span-2">
                  <Field label="Notes">
                    <textarea
                      className={textareaClass}
                      placeholder="Damage charges, late check-out fee, etc."
                      value={checkoutNotes}
                      onChange={(e) => setCheckoutNotes(e.target.value)}
                    />
                  </Field>
                </div>

                <div className="md:col-span-2 rounded-xl bg-primary-soft p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {outstandingAfter > 0 ? "বাকি থাকবে (Due)" : "Status"}
                    </span>
                    <span
                      className={`text-lg font-bold ${outstandingAfter > 0 ? "text-amber-600" : "text-emerald-600"}`}
                    >
                      {outstandingAfter > 0
                        ? `৳${outstandingAfter.toLocaleString()}`
                        : "Fully Paid ✓"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
                <button onClick={() => setActive(null)} className={buttonGhost}>
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const finalDue = Math.max(0, totalDue - paidNow);
                    await saveCustomerHistory({
                      ...active,
                      remaining: paidNow,
                      due: finalDue,
                      actualNights,
                      paymentMethod,
                      checkoutNotes,
                      checkoutDate,
                      checkoutTime,
                    });
                    await removeActiveStay(active.id);
                    await updateRoomStatus(active.room, "Available");

                    try {
                      notifyCheckOut(active.customer, active.room, finalDue);
                    } catch (err) {
                      console.error("notifyCheckOut failed:", err);
                    }

                    await refreshList();

                    try {
                      setCompletedInvoice({
                        invoiceNo: `INV-${active.id}`,
                        room: active.room,
                        customer: active.customer,
                        phone: active.phone,
                        nid: active.nid,
                        address: active.address,
                        checkIn: active.checkIn,
                        checkoutDate,
                        checkoutTime,
                        nights: actualNights,
                        rent: active.rent,
                        stayTotal,
                        previousDue: active.previousDue || 0,
                        advance: active.advance,
                        deposits: activeDepositsTotal,
                        paidNow,
                        paymentMethod,
                        totalDue,
                        finalDue,
                        notes: checkoutNotes || undefined,
                        additionalGuests: active.additionalGuests,
                      });
                    } catch (err) {
                      console.error("Could not prepare invoice popup:", err);
                      alert(
                        finalDue > 0
                          ? `Guest checked out. ৳${finalDue.toLocaleString()} বকেয়া থাকলো, পরের বার Booking-এ দেখাবে।`
                          : "Guest checked out successfully. Fully paid.",
                      );
                    }

                    setActive(null);
                  }}
                  className={buttonPrimary}
                >
                  Complete Checkout
                </button>
              </div>
            </div>
          </div>
        )}

        {depositTarget &&
          (() => {
            const live = list.find((s) => s.id === depositTarget.id) || depositTarget;
            const history = [...(live.deposits || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
                <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
                  <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <h3 className="text-base font-bold text-foreground">
                      Add Deposit — Room {live.room}
                    </h3>
                    <button
                      onClick={() => setDepositTarget(null)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-3 p-6">
                    <p className="text-sm text-muted-foreground">
                      {live.customer} · এখন পর্যন্ত জমা: ৳
                      {(live.advance + depositsTotalOf(live)).toLocaleString()}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Date">
                        <input
                          type="date"
                          className={inputClass}
                          value={depositDate}
                          onChange={(e) => setDepositDate(e.target.value)}
                        />
                      </Field>
                      <Field label="Deposit Amount (৳)">
                        <input
                          type="number"
                          className={inputClass}
                          placeholder="0"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                        />
                      </Field>
                    </div>
                    {history.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Deposit History
                        </p>
                        <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                              <tr>
                                <th className="px-3 py-1.5">Date</th>
                                <th className="px-3 py-1.5 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {history.map((d, i) => (
                                <tr key={i} className="border-t border-border">
                                  <td className="px-3 py-1.5 text-muted-foreground">{d.date}</td>
                                  <td className="px-3 py-1.5 text-right font-medium text-foreground">
                                    ৳{d.amount.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
                    <button onClick={() => setDepositTarget(null)} className={buttonGhost}>
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveDeposit}
                      className="rounded-lg bg-primary px-5 py-2 font-semibold text-primary-foreground transition hover:opacity-90"
                    >
                      Save Deposit
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

        {completedInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="mt-3 text-base font-bold text-foreground">Checkout Complete</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {completedInvoice.customer} · Room {completedInvoice.room}
              </p>
              <p className="mt-2 text-sm">
                {completedInvoice.finalDue > 0 ? (
                  <span className="font-bold text-amber-600">
                    ৳{completedInvoice.finalDue.toLocaleString()} বকেয়া থাকলো
                  </span>
                ) : (
                  <span className="font-bold text-emerald-600">Fully Paid ✓</span>
                )}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">Invoice Print করতে চান?</p>
              <div className="mt-4 flex justify-center gap-2">
                <button onClick={() => setCompletedInvoice(null)} className={buttonGhost}>
                  Close
                </button>
                <button onClick={() => window.print()} className={buttonPrimary}>
                  <Printer className="h-4 w-4" /> Print Invoice
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {completedInvoice &&
        (() => {
          const profile = getHotelProfile();
          const phones = Array.isArray(profile.contactPhones)
            ? profile.contactPhones.filter(Boolean)
            : [];
          const inv = completedInvoice;
          const totalPaid = inv.advance + inv.deposits + inv.paidNow;

          return (
            <div className="hidden print:block">
              <style>{`@media print { @page { size: A4; margin: 16mm; } }`}</style>
              <div className="mx-auto max-w-[720px] p-4 text-black">
                <div className="mb-6 flex items-start justify-between border-b-2 border-black pb-4">
                  <div>
                    <h1 className="text-xl font-bold">{profile.hotelName}</h1>
                    {profile.address && (
                      <p className="mt-1 max-w-[280px] text-xs text-gray-700">{profile.address}</p>
                    )}
                    {phones.length > 0 && (
                      <p className="text-xs text-gray-700">{phones.join("  ·  ")}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <h2 className="text-2xl font-bold uppercase tracking-widest">Invoice</h2>
                    <p className="mt-1 text-xs text-gray-700">Invoice No: {inv.invoiceNo}</p>
                    <p className="text-xs text-gray-700">
                      Date: {inv.checkoutDate} {inv.checkoutTime}
                    </p>
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="mb-1 text-[11px] font-bold uppercase text-gray-500">Bill To</h3>
                    <p className="text-sm font-semibold">{inv.customer}</p>
                    <p className="text-xs text-gray-700">{inv.phone}</p>
                    {inv.nid && <p className="text-xs text-gray-700">NID: {inv.nid}</p>}
                    <p className="text-xs text-gray-700">{inv.address}</p>
                    {inv.additionalGuests && inv.additionalGuests.length > 0 && (
                      <div className="mt-1 text-xs text-gray-700">
                        <p>Additional Guests:</p>
                        <ul className="ml-4 list-disc">
                          {inv.additionalGuests.map((guest) => (
                            <li key={guest.id}>
                              {guest.name} · Phone: {guest.phone || "—"} · Father:{" "}
                              {guest.fatherName || "—"} · NID: {guest.nid || "—"} · Address:{" "}
                              {guest.address || "—"}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <h3 className="mb-1 text-[11px] font-bold uppercase text-gray-500">
                      Stay Details
                    </h3>
                    <p className="text-xs text-gray-700">Room: {inv.room}</p>
                    <p className="text-xs text-gray-700">Check In: {inv.checkIn}</p>
                    <p className="text-xs text-gray-700">
                      Check Out: {inv.checkoutDate} {inv.checkoutTime}
                    </p>
                    <p className="text-xs text-gray-700">{inv.nights} night(s)</p>
                  </div>
                </div>

                <table className="mb-5 w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b-2 border-black text-left">
                      <th className="py-1.5">Description</th>
                      <th className="py-1.5 text-right">Amount (৳)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-300">
                      <td className="py-1.5">
                        Room Charge ({inv.nights} night(s) × ৳{inv.rent.toLocaleString()})
                      </td>
                      <td className="py-1.5 text-right">{inv.stayTotal.toLocaleString()}</td>
                    </tr>
                    {inv.previousDue > 0 && (
                      <tr className="border-b border-gray-300">
                        <td className="py-1.5">Previous Due (Carried)</td>
                        <td className="py-1.5 text-right">{inv.previousDue.toLocaleString()}</td>
                      </tr>
                    )}
                    <tr className="border-b border-gray-300">
                      <td className="py-1.5">Advance Paid</td>
                      <td className="py-1.5 text-right">− {inv.advance.toLocaleString()}</td>
                    </tr>
                    {inv.deposits > 0 && (
                      <tr className="border-b border-gray-300">
                        <td className="py-1.5">Deposits During Stay</td>
                        <td className="py-1.5 text-right">− {inv.deposits.toLocaleString()}</td>
                      </tr>
                    )}
                    <tr className="border-b-2 border-black font-semibold">
                      <td className="py-1.5">Total Due at Checkout</td>
                      <td className="py-1.5 text-right">
                        {Math.max(0, inv.totalDue).toLocaleString()}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-300">
                      <td className="py-1.5">Paid Now ({inv.paymentMethod})</td>
                      <td className="py-1.5 text-right">− {inv.paidNow.toLocaleString()}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="text-base font-bold">
                      <td className="py-2">{inv.finalDue > 0 ? "Balance Due" : "Status"}</td>
                      <td className="py-2 text-right">
                        {inv.finalDue > 0 ? `৳${inv.finalDue.toLocaleString()}` : "Fully Paid ✓"}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                <div className="mb-8 flex justify-between text-xs text-gray-600">
                  <span>Total Paid: ৳{totalPaid.toLocaleString()}</span>
                  <span>Payment Method: {inv.paymentMethod}</span>
                </div>

                {inv.notes && (
                  <div className="mb-8">
                    <h3 className="mb-1 text-[11px] font-bold uppercase text-gray-500">Notes</h3>
                    <p className="text-xs">{inv.notes}</p>
                  </div>
                )}

                <div className="mt-16 flex justify-between text-xs">
                  <div className="text-center">
                    <div className="w-40 border-t border-black pt-1">Guest Signature</div>
                  </div>
                  <div className="text-center">
                    <div className="w-40 border-t border-black pt-1">Authorized Signature</div>
                  </div>
                </div>

                <p className="mt-8 text-center text-[11px] text-gray-500">
                  Thank you for staying with us.
                </p>
              </div>
            </div>
          );
        })()}
    </>
  );
}
