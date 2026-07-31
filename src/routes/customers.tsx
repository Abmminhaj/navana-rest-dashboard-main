import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Printer, X, ImageOff, Wallet } from "lucide-react";
import { Card, Field, PageHeader, SectionTitle, buttonGhost, buttonPrimary, inputClass } from "@/components/ui-kit";
import { getCustomerHistory, parseDuePayments, recordDuePayment, type CustomerHistoryRecord } from "@/lib/customer-history-storage";
import { PrintLetterhead } from "@/components/PrintLetterhead";

export const Route = createFileRoute("/customers")({
  head: () => ({ meta: [{ title: "Customer Information — Navana Rest House" }] }),
  validateSearch: (search: Record<string, unknown>): { highlight?: string } => ({
    highlight: typeof search.highlight === "string" ? search.highlight : undefined,
  }),
  component: CustomersPage,
});

interface CustomerProfile {
  key: string;
  name: string;
  fatherName?: string;
  phone: string;
  nid: string;
  profession?: string;
  nationality?: string;
  address: string;
  nidPhoto?: string | null;
  customerPhoto?: string | null;
  records: CustomerHistoryRecord[];
  totalStays: number;
  totalSpent: number;
  outstandingDue: number;
  lastVisit: string;
}

function depositsTotalOf(r: CustomerHistoryRecord) {
  return (r.deposits || []).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
}

function parseDate(value: string | undefined) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function buildProfiles(history: CustomerHistoryRecord[]): CustomerProfile[] {
  const expandedHistory = history.flatMap((record) => [
    record,
    ...(record.additionalGuests || []).map((guest) => ({
      ...record,
      id: `${record.id}-guest-${guest.id}`,
      customer: guest.name,
      fatherName: guest.fatherName || "",
      phone: guest.phone || "",
      nid: guest.nid || "",
      address: guest.address || record.address,
      advance: 0,
      remaining: 0,
      deposits: [],
      previousDue: 0,
      due: 0,
      additionalGuests: [],
      isAdditionalGuest: true,
    })),
  ]);
  const groups = new Map<string, CustomerHistoryRecord[]>();

  for (const record of expandedHistory) {
    const key = (record.phone || "").replace(/\D/g, "") || record.customer || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(record);
  }

  const profiles: CustomerProfile[] = [];

  groups.forEach((records, key) => {
    const sorted = [...records].sort(
      (a, b) => parseDate(b.checkoutDate) - parseDate(a.checkoutDate)
    );
    const latest = sorted[0];
    const nidPhoto = sorted.find((r) => r.nidPhoto)?.nidPhoto ?? null;
    const customerPhoto = sorted.find((r) => r.customerPhoto)?.customerPhoto ?? null;
    const totalSpent = sorted.reduce(
      (sum, r) => sum + (Number(r.advance) || 0) + depositsTotalOf(r) + (Number(r.remaining) || 0),
      0
    );
    const outstandingDue = Number(latest.due) || 0;

    profiles.push({
      key,
      name: latest.customer,
      fatherName: latest.fatherName,
      phone: latest.phone,
      nid: latest.nid,
      profession: latest.profession,
      nationality: latest.nationality,
      address: latest.address,
      nidPhoto,
      customerPhoto,
      records: sorted,
      totalStays: sorted.length,
      totalSpent,
      outstandingDue,
      lastVisit: latest.checkoutDate,
    });
  });

  return profiles.sort((a, b) => parseDate(b.lastVisit) - parseDate(a.lastVisit));
}

function CustomersPage() {
  const { highlight } = Route.useSearch();
  const [history, setHistory] = useState<CustomerHistoryRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerProfile | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showDueOnly, setShowDueOnly] = useState(false);
  const [dueTarget, setDueTarget] = useState<CustomerHistoryRecord | null>(null);
  const [dueAmount, setDueAmount] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueMethod, setDueMethod] = useState("Cash");
  const [dueNote, setDueNote] = useState("");

  useEffect(() => {
    async function loadHistory() {
      setHistory(await getCustomerHistory());
    }
    loadHistory();
    window.addEventListener("customerHistoryUpdated", loadHistory);
    return () => window.removeEventListener("customerHistoryUpdated", loadHistory);
  }, []);

  const profiles = useMemo(() => buildProfiles(history), [history]);

  useEffect(() => {
    if (!highlight || profiles.length === 0) return;
    const match = profiles.find((p) => p.key === highlight);
    if (!match) return;
    setSelected(match);
    const row = document.getElementById(`customer-row-${highlight}`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight, profiles]);

 const filtered = useMemo(() => {
  const matchesDateRange = (p: CustomerProfile) => {
    if (!fromDate && !toDate) return true;

    const visit = new Date(p.lastVisit);
    if (fromDate && visit < new Date(fromDate)) return false;

    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      if (visit > end) return false;
    }

    return true;
  };

  const directMatches = profiles.filter((p) => {
    const bookingIds = p.records.map((r) => r.bookingId || "").join(" ");
    return `${p.name} ${p.phone} ${p.nid} ${p.address} ${bookingIds}`
      .toLowerCase()
      .includes(query.toLowerCase()) && matchesDateRange(p) && (!showDueOnly || p.outstandingDue > 0);
  });

  const linkedBookingIds = new Set(
    directMatches.flatMap((profile) => profile.records.map((record) => record.bookingId).filter(Boolean)),
  );

  return profiles.filter((profile) => {
    const isDirectMatch = directMatches.includes(profile);
    const isLinkedGuest = profile.records.some((record) => linkedBookingIds.has(record.bookingId));
    if (!isDirectMatch && !isLinkedGuest) return false;
    if (!matchesDateRange(profile)) return false;
    if (showDueOnly && profile.outstandingDue <= 0) return false;
    return true;
  });
}, [profiles, query, fromDate, toDate, showDueOnly]);

const totalDue = profiles.reduce((sum, profile) => sum + profile.outstandingDue, 0);

async function handleDuePayment() {
  if (!dueTarget) return;
  const amount = Number(dueAmount);
  if (!amount || amount <= 0) return;
  const saved = await recordDuePayment(dueTarget, amount, dueDate, dueMethod, dueNote || undefined);
  if (!saved) return;
  setDueTarget(null);
  setDueAmount("");
  setDueNote("");
}

function exportExcel() {
  const rows = filtered.flatMap((p) =>
    p.records.map((r) => ({
      BookingID: r.bookingId || "",
      Name: p.name,
      FatherName: p.fatherName || "",
      Phone: p.phone,
      NID: p.nid,
      Address: p.address,
      CustomerType: r.guestType || "",
      Room: r.room,
      CheckIn: r.checkIn,
      CheckoutDate: r.checkoutDate || "",
      Advance: r.advance || 0,
      Deposits: depositsTotalOf(r),
      PaidAtCheckout: r.remaining || 0,
      Due: r.due || 0,
      PaymentMethod: r.paymentMethod || "",
    }))
  );

  const header = Object.keys(rows[0] || {});
  const csv = [
    header.join(","),
    ...rows.map((r) =>
      header.map((h) => `"${(r as any)[h] ?? ""}"`).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `Customer_Report_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  link.click();

  URL.revokeObjectURL(url);
}

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="Customer Information"
          description="Real guest history from completed checkouts — click a guest to view full profile and print details."
        />

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className={inputClass + " pl-9"}
                placeholder="Search by name, phone, NID, address or booking ID…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
  <button
    onClick={() => setShowDueOnly((value) => !value)}
    className={showDueOnly ? buttonPrimary : buttonGhost}
  >
    <Wallet className="h-4 w-4" /> Due ৳{totalDue.toLocaleString()}
  </button>
  <input
    type="date"
    value={fromDate}
    onChange={(e) => setFromDate(e.target.value)}
    className={inputClass}
  />

  <input
    type="date"
    value={toDate}
    onChange={(e) => setToDate(e.target.value)}
    className={inputClass}
  />

  <button
    onClick={exportExcel}
    className={buttonPrimary}
  >
    Download Report
  </button>
</div>
            <div className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {profiles.length} guests
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Last Visit</th>
                  <th className="px-4 py-3">Customer Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">National ID</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3 text-right">Total Stays</th>
                  <th className="px-4 py-3 text-right">Total Spent</th>
                  <th className="px-4 py-3 text-right">Due</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.key}
                    id={`customer-row-${p.key}`}
                    className={`border-t border-border hover:bg-muted/30 ${
                      highlight === p.key ? "bg-primary-soft/60 ring-2 ring-inset ring-primary/40" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-muted-foreground">{p.lastVisit || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        onClick={() => setSelected(p)}
                        className="cursor-pointer font-semibold text-primary hover:underline"
                      >
                        {p.name || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{p.phone || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.nid || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.address || "—"}</td>
                    <td className="px-4 py-3 text-right text-foreground">{p.totalStays}</td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      ৳{p.totalSpent.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {p.outstandingDue > 0 ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-amber-600">৳{p.outstandingDue.toLocaleString()}</span>
                          <button
                            className="text-xs font-semibold text-primary hover:underline"
                            onClick={() => {
                              const target = p.records.find((record) => (Number(record.due) || 0) > 0);
                              if (!target) return;
                              setDueTarget(target);
                              setDueAmount(String(target.due));
                              setDueDate(new Date().toISOString().slice(0, 10));
                            }}
                          >
                            Pay Due
                          </button>
                        </div>
                      ) : (
                        <span className="text-emerald-600">৳0</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-sm text-muted-foreground">
                      {profiles.length === 0
                        ? "এখনো কোনো Guest Checkout সম্পন্ন হয়নি। Checkout সম্পন্ন হলে এখানে Customer History দেখা যাবে।"
                        : "No matching guests found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {dueTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground">Clear Customer Due</h3>
                <p className="mt-1 text-sm text-muted-foreground">{dueTarget.customer} · Room {dueTarget.room}</p>
              </div>
              <button onClick={() => setDueTarget(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Current due: <span className="font-bold">৳{(Number(dueTarget.due) || 0).toLocaleString()}</span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Payment Date">
                <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
              <Field label="Amount (৳)">
                <input type="number" className={inputClass} value={dueAmount} onChange={(e) => setDueAmount(e.target.value)} />
              </Field>
              <Field label="Payment Method">
                <select className={inputClass} value={dueMethod} onChange={(e) => setDueMethod(e.target.value)}>
                  <option>Cash</option><option>bKash</option><option>Nagad</option><option>Card</option><option>Bank Transfer</option>
                </select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Note (Optional)">
                  <input className={inputClass} placeholder="e.g. Paid from home by bKash" value={dueNote} onChange={(e) => setDueNote(e.target.value)} />
                </Field>
              </div>
            </div>
            {parseDuePayments(dueTarget.checkoutNotes).length > 0 && (
              <div className="mt-4 rounded-lg border border-border p-3 text-xs">
                <p className="mb-2 font-semibold text-foreground">Previous Due Payments</p>
                <div className="space-y-1 text-muted-foreground">
                  {parseDuePayments(dueTarget.checkoutNotes).map((payment) => (
                    <div key={payment.id} className="flex justify-between gap-3">
                      <span>{payment.date} · {payment.method}</span><span>৳{payment.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button className={buttonGhost} onClick={() => setDueTarget(null)}>Cancel</button>
              <button className={buttonPrimary} onClick={handleDuePayment}>Save Payment</button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm print:hidden">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
              <div className="flex items-start justify-between border-b border-border px-6 py-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">{selected.name}</h3>
                  <p className="text-xs text-muted-foreground">{selected.phone} · {selected.totalStays} stay(s)</p>
                  {selected.outstandingDue > 0 && (
                    <p className="mt-1 text-sm font-bold text-amber-600">⚠️ বকেয়া আছে: ৳{selected.outstandingDue.toLocaleString()}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => window.print()} className={buttonGhost}>
                    <Printer className="h-4 w-4" /> Print
                  </button>
                  <button onClick={() => setSelected(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-6 p-6">
                <div>
                  <SectionTitle title="Personal Information" />
                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label="Full Name"><input className={inputClass} value={selected.name || ""} readOnly /></Field>
                    <Field label="Father's Name"><input className={inputClass} value={selected.fatherName || ""} readOnly /></Field>
                    <Field label="Phone"><input className={inputClass} value={selected.phone || ""} readOnly /></Field>
                    <Field label="National ID"><input className={inputClass} value={selected.nid || ""} readOnly /></Field>
                    <Field label="Profession"><input className={inputClass} value={selected.profession || ""} readOnly /></Field>
                    <Field label="Nationality"><input className={inputClass} value={selected.nationality || ""} readOnly /></Field>
                    <div className="md:col-span-2">
                      <Field label="Address"><input className={inputClass} value={selected.address || ""} readOnly /></Field>
                    </div>
                  </div>
                </div>

                <div>
                  <SectionTitle title="Identity Documents" />
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">NID Photo</p>
                      {selected.nidPhoto ? (
                        <img src={selected.nidPhoto} alt="NID" className="h-32 w-full rounded-lg border border-border object-cover" />
                      ) : (
                        <div className="flex h-32 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                          <ImageOff className="h-4 w-4" /> Not uploaded
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Customer Photo</p>
                      {selected.customerPhoto ? (
                        <img src={selected.customerPhoto} alt="Customer" className="h-32 w-full rounded-lg border border-border object-cover" />
                      ) : (
                        <div className="flex h-32 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                          <ImageOff className="h-4 w-4" /> Not uploaded
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {selected.records.some((record) => (record.additionalGuests || []).length > 0) && (
                  <div>
                    <SectionTitle title="Additional Guests" />
                    <div className="mt-3 space-y-2">
                      {selected.records.flatMap((record) =>
                        (record.additionalGuests || []).map((guest) => (
                          <div key={`${record.bookingId}-${guest.id}`} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                            <div>
                              <span className="font-semibold text-foreground">{guest.name}</span>
                              <span className="ml-2 text-xs text-muted-foreground">Room {record.room}</span>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              {guest.phone && <div>Phone: {guest.phone}</div>}
                              {guest.fatherName && <div>Father: {guest.fatherName}</div>}
                              {guest.nid && <div>NID: {guest.nid}</div>}
                              {guest.address && <div>Address: {guest.address}</div>}
                            </div>
                          </div>
                        )),
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <SectionTitle title="Room / Stay History" />
                  <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Booking ID</th>
                          <th className="px-3 py-2">Room</th>
                          <th className="px-3 py-2">Guest Type</th>
                          <th className="px-3 py-2">Check In</th>
                          <th className="px-3 py-2">Expected Check Out</th>
                          <th className="px-3 py-2">Checkout Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.records.map((r, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.bookingId || "—"}</td>
                            <td className="px-3 py-2 font-semibold text-foreground">{r.room}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.guestType || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.checkIn}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.expectedCheckOut}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.checkoutDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <SectionTitle title="Payment History" />
                  <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Checkout Date</th>
                          <th className="px-3 py-2 text-right">Advance</th>
                          <th className="px-3 py-2 text-right">Deposits</th>
                          <th className="px-3 py-2 text-right">Paid at Checkout</th>
                          <th className="px-3 py-2 text-right">Total Paid</th>
                          <th className="px-3 py-2 text-right">Due Left</th>
                          <th className="px-3 py-2">Method</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.records.map((r, i) => {
                          const dep = depositsTotalOf(r);
                          return (
                          <tr key={i} className="border-t border-border">
                            <td className="px-3 py-2 text-muted-foreground">{r.checkoutDate}</td>
                            <td className="px-3 py-2 text-right text-foreground">৳{(Number(r.advance) || 0).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-foreground">৳{dep.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-foreground">৳{(Number(r.remaining) || 0).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-semibold text-foreground">
                              ৳{((Number(r.advance) || 0) + dep + (Number(r.remaining) || 0)).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">
                              {(Number(r.due) || 0) > 0 ? (
                                <span className="text-amber-600">৳{(Number(r.due) || 0).toLocaleString()}</span>
                              ) : (
                                <span className="text-emerald-600">৳0</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{r.paymentMethod || "—"}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border bg-muted/20">
                          <td className="px-3 py-2 font-semibold text-foreground">Total</td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 text-right font-bold text-primary">৳{selected.totalSpent.toLocaleString()}</td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2" />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {selected.records.some((r) => r.notes || r.checkoutNotes) && (
                  <div>
                    <SectionTitle title="Notes" />
                    <ul className="mt-3 space-y-2 text-sm">
                      {selected.records.map((r, i) => (
                        <li key={i}>
                          {r.notes && (
                            <p className="text-foreground">
                              <span className="text-xs text-muted-foreground">[Booking, Room {r.room}]</span> {r.notes}
                            </p>
                          )}
                          {r.checkoutNotes && (
                            <p className="text-foreground">
                              <span className="text-xs text-muted-foreground">[Checkout, Room {r.room}]</span> {r.checkoutNotes}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="hidden print:block">
            <style>{`@media print { @page { size: A4; margin: 16mm; } }`}</style>
            <div className="mx-auto max-w-[720px] p-4 text-black">
              <PrintLetterhead documentTitle="Customer Details" />

              <div className="mb-5">
                <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase">Personal Information</h2>
                <div className="grid grid-cols-2 gap-y-1 text-sm">
                  <span className="text-gray-600">Full Name</span><span>{selected.name || "—"}</span>
                  <span className="text-gray-600">Father's Name</span><span>{selected.fatherName || "—"}</span>
                  <span className="text-gray-600">Phone</span><span>{selected.phone || "—"}</span>
                  <span className="text-gray-600">National ID</span><span>{selected.nid || "—"}</span>
                  <span className="text-gray-600">Profession</span><span>{selected.profession || "—"}</span>
                  <span className="text-gray-600">Nationality</span><span>{selected.nationality || "—"}</span>
                </div>
              </div>

              <div className="mb-5">
                <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase">Address</h2>
                <p className="text-sm">{selected.address || "—"}</p>
              </div>

              {selected.records.some((record) => (record.additionalGuests || []).length > 0) && (
                <div className="mb-5">
                  <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase">Additional Guests</h2>
                  <ul className="space-y-1 text-sm">
                    {selected.records.flatMap((record) =>
                      (record.additionalGuests || []).map((guest) => (
                        <li key={`${record.bookingId}-${guest.id}`}>
                          {guest.name}{guest.phone ? ` — Phone: ${guest.phone}` : ""}{guest.nid ? ` — NID: ${guest.nid}` : ""} (Room {record.room})
                        </li>
                      )),
                    )}
                  </ul>
                </div>
              )}

              <div className="mb-5">
                <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase">Stay Details</h2>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-400 text-left">
                      <th className="py-1 pr-6">Booking ID</th>
                      <th className="py-1 pr-6">Room</th>
                      <th className="py-1 pr-6">Check In</th>
                      <th className="py-1 pr-6">Expected Check Out</th>
                      <th className="py-1 pr-6">Checkout Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.records.map((r, i) => (
                      <tr key={i} className="border-b border-gray-200">
                        <td className="py-1 pr-6">{r.bookingId || "—"}</td>
                        <td className="py-1 pr-6">{r.room}</td>
                        <td className="py-1 pr-6">{r.checkIn}</td>
                        <td className="py-1 pr-6">{r.expectedCheckOut}</td>
                        <td className="py-1 pr-6">{r.checkoutDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mb-5">
                <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase">Payment Details</h2>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-400 text-left">
                      <th className="py-1 pr-6">Checkout Date</th>
                      <th className="py-1 pr-6 text-right">Advance</th>
                      <th className="py-1 pr-6 text-right">Deposits</th>
                      <th className="py-1 pr-6 text-right">Paid at Checkout</th>
                      <th className="py-1 pr-6 text-right">Total</th>
                      <th className="py-1 pr-6 text-right">Due Left</th>
                      <th className="py-1">Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.records.map((r, i) => {
                      const dep = depositsTotalOf(r);
                      return (
                      <tr key={i} className="border-b border-gray-200">
                        <td className="py-1 pr-6">{r.checkoutDate}</td>
                        <td className="py-1 pr-6 text-right">৳{(Number(r.advance) || 0).toLocaleString()}</td>
                        <td className="py-1 pr-6 text-right">৳{dep.toLocaleString()}</td>
                        <td className="py-1 pr-6 text-right">৳{(Number(r.remaining) || 0).toLocaleString()}</td>
                        <td className="py-1 pr-6 text-right">৳{((Number(r.advance) || 0) + dep + (Number(r.remaining) || 0)).toLocaleString()}</td>
                        <td className="py-1 pr-6 text-right">৳{(Number(r.due) || 0).toLocaleString()}</td>
                        <td className="py-1">{r.paymentMethod || "—"}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold">
                      <td className="py-1 pr-6">Grand Total</td>
                      <td /><td /><td />
                      <td className="py-1 pr-6 text-right">৳{selected.totalSpent.toLocaleString()}</td>
                      <td className="py-1 pr-6 text-right">
                        {selected.outstandingDue > 0 ? `৳${selected.outstandingDue.toLocaleString()}` : "৳0"}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {selected.records.some((r) => r.notes || r.checkoutNotes) && (
                <div className="mb-5">
                  <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase">Notes</h2>
                  <ul className="list-disc pl-5 text-xs">
                    {selected.records.map((r, i) => (
                      <li key={i}>
                        {r.notes && <div>Room {r.room} (Booking): {r.notes}</div>}
                        {r.checkoutNotes && <div>Room {r.room} (Checkout): {r.checkoutNotes}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(selected.nidPhoto || selected.customerPhoto) && (
                <div className="mb-5">
                  <h2 className="mb-2 border-b border-gray-300 pb-1 text-sm font-bold uppercase">Photos</h2>
                  <div className="flex gap-4">
                    {selected.nidPhoto && (
                      <div>
                        <p className="mb-1 text-xs text-gray-600">NID Photo</p>
                        <img src={selected.nidPhoto} alt="NID" className="h-28 w-40 border border-gray-300 object-cover" />
                      </div>
                    )}
                    {selected.customerPhoto && (
                      <div>
                        <p className="mb-1 text-xs text-gray-600">Customer Photo</p>
                        <img src={selected.customerPhoto} alt="Customer" className="h-28 w-40 border border-gray-300 object-cover" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
