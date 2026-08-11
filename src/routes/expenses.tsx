import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { Plus, Download, Search, Trash2, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import type { Expense } from "@/lib/mock-data";
import { getExpenses, addExpense, deleteExpense } from "@/lib/expense-storage";
import {
  getExpenseCategories,
  addExpenseCategory,
  deleteExpenseCategory,
} from "@/lib/expense-category-storage";

export const Route = createFileRoute("/expenses")({
  head: () => ({ meta: [{ title: "Expenses — Navana Rest House" }] }),
  component: ExpensesPage,
});

const METHODS = ["Cash", "bKash", "Nagad", "Card", "Bank Transfer"];

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days + 1);
  return date.toISOString().slice(0, 10);
}

function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState("All time");
  const [showFilters, setShowFilters] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [date, setDate] = useState(todayDate());
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(METHODS[0]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [categoryError, setCategoryError] = useState("");

  useEffect(() => {
    const loadExpenses = async () => setExpenses(await getExpenses());
    const loadCategories = async () => {
      const cats = await getExpenseCategories();
      setCategories(cats);
      setCategory((current) => current || cats[0] || "");
    };

    loadExpenses();
    loadCategories();

    window.addEventListener("expensesUpdated", loadExpenses);
    window.addEventListener("expenseCategoriesUpdated", loadCategories);
    return () => {
      window.removeEventListener("expensesUpdated", loadExpenses);
      window.removeEventListener("expenseCategoriesUpdated", loadCategories);
    };
  }, []);

  const filtered = expenses.filter((e) => {
    if (fromDate && e.date < fromDate) return false;
    if (toDate && e.date > toDate) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;

    return (
      e.description.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      e.method.toLowerCase().includes(q)
    );
  });

  function applyDatePreset(preset: string) {
    setDatePreset(preset);
    const end = todayDate();
    setToDate(preset === "All time" ? "" : end);
    if (preset === "Last 7 days") setFromDate(daysAgo(7));
    else if (preset === "Last 15 days") setFromDate(daysAgo(15));
    else if (preset === "Last 30 days") setFromDate(daysAgo(30));
    else if (preset === "Last year") setFromDate(daysAgo(365));
    else setFromDate("");
  }

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  function resetForm() {
    setDate(todayDate());
    setCategory(categories[0] || "");
    setDescription("");
    setAmount("");
    setMethod(METHODS[0]);
    setNotes("");
    setError("");
  }

  async function handleSave() {
    const amountNum = parseFloat(amount);

    if (!category) {
      setError("একটা Category বেছে নিন।");
      return;
    }
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError("সঠিক Amount দিন।");
      return;
    }

    await addExpense({
      date,
      category,
      description: description.trim(),
      amount: amountNum,
      method,
      notes: notes.trim() || undefined,
    });

    resetForm();
  }

  async function handleDelete(id: string) {
    if (window.confirm("এটি মুছে ফেলতে চান?")) {
      await deleteExpense(id);
    }
  }

  async function handleAddCategory() {
    setCategoryError("");

    try {
      const updated = await addExpenseCategory(newCategory);
      setCategory(newCategory.trim());
      setNewCategory("");
      setShowAddCategory(false);
      setCategories(updated);
    } catch (err: any) {
      if (err.message === "CATEGORY_EXISTS") {
        setCategoryError("এই Category আগে থেকেই আছে।");
      } else {
        setCategoryError("Category-র নাম লিখুন।");
      }
    }
  }

  async function handleDeleteCategory(cat: string) {
    if (
      !window.confirm(
        `"${cat}" Category মুছে ফেলতে চান? (আগের Expense-এ এই Category-র নাম থেকে যাবে)`,
      )
    )
      return;

    const updated = await deleteExpenseCategory(cat);
    setCategories(updated);
    if (category === cat) {
      setCategory(updated[0] || "");
    }
  }

  function handleExport() {
    const header = ["Date", "Category", "Description", "Method", "Amount"];
    const rows = filtered.map((e) => [
      e.date,
      e.category,
      e.description,
      e.method,
      String(e.amount),
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `navana-expenses-${todayDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Track operational spend and reconcile against income."
        actions={
          <button className={buttonGhost} onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <SectionTitle
            title="Add New Expense"
            action={<Plus className="h-4 w-4 text-muted-foreground" />}
          />
          <div className="space-y-4 p-6">
            <Field label="Date">
              <input
                type="date"
                className={inputClass}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>

            <Field label="Category">
              <div className="space-y-2">
                <div className={inputClass + " flex items-center"}>
                  {category ? (
                    <span className="font-semibold text-foreground">{category}</span>
                  ) : (
                    <span className="text-muted-foreground">নিচে থেকে একটা Category বেছে নিন</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {categories.map((c) => (
                    <span
                      key={c}
                      className={`inline-flex items-center overflow-hidden rounded-full text-xs font-semibold transition ${
                        category === c
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setCategory(c)}
                        className={`px-3 py-1.5 ${category === c ? "" : "hover:bg-muted/70"}`}
                      >
                        {c}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(c)}
                        title={`Remove ${c}`}
                        className={`border-l px-2 py-1.5 ${
                          category === c
                            ? "border-primary-foreground/30 text-primary-foreground/70 hover:bg-red-500 hover:text-white"
                            : "border-border text-muted-foreground hover:bg-red-500 hover:text-white"
                        }`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowAddCategory((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" /> New
                  </button>
                </div>

                {showAddCategory && (
                  <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        className={inputClass}
                        placeholder="নতুন Category-র নাম"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                      />
                      <button
                        type="button"
                        className={buttonPrimary + " shrink-0 px-3"}
                        onClick={handleAddCategory}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        className={buttonGhost + " shrink-0 px-2"}
                        onClick={() => {
                          setShowAddCategory(false);
                          setNewCategory("");
                          setCategoryError("");
                        }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {categoryError && (
                      <p className="text-xs font-medium text-red-500">{categoryError}</p>
                    )}
                  </div>
                )}
              </div>
            </Field>

            <Field label="Amount (৳)">
              <input
                className={inputClass}
                placeholder="0"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Description">
              <input
                className={inputClass}
                placeholder="Short description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <Field label="Payment Method">
              <select
                className={selectClass}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <textarea
                className={textareaClass}
                placeholder="Optional"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>

            {error && <p className="text-xs font-medium text-red-500">{error}</p>}

            <button className={buttonPrimary + " w-full"} onClick={handleSave}>
              <Plus className="h-4 w-4" /> Save Expense
            </button>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Expense History</h2>
              <p className="text-[11px] text-muted-foreground">
                Total{search && " (filtered)"}:{" "}
                <span className="font-bold text-foreground">৳{total.toLocaleString()}</span>
              </p>
            </div>
            <div className="flex w-full items-center gap-2 lg:w-auto">
              <div className="relative w-full max-w-xs flex-1 lg:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className={inputClass + " pl-9"}
                  placeholder="Search expenses…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={`relative inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${
                  showFilters
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filter
                {datePreset !== "All time" && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary" />
                )}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${showFilters ? "rotate-180" : ""}`}
                />
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 p-4">
              {["All time", "Last 7 days", "Last 15 days", "Last 30 days", "Last year"].map(
                (preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyDatePreset(preset)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                      datePreset === preset
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {preset}
                  </button>
                ),
              )}
              <input
                type="date"
                className={inputClass + " h-8 w-32 text-xs"}
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setDatePreset("Custom");
                }}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                className={inputClass + " h-8 w-32 text-xs"}
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setDatePreset("Custom");
                }}
              />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      কোনো Expense পাওয়া যায়নি
                    </td>
                  </tr>
                ) : (
                  filtered.map((e) => (
                    <tr key={e.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground">{e.date}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                          {e.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground">{e.description}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.method}</td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">
                        ৳{e.amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(e.id)}
                          className="text-muted-foreground transition-colors hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 text-sm">
                  <td
                    colSpan={4}
                    className="px-4 py-3 text-right font-semibold text-muted-foreground"
                  >
                    Total
                  </td>
                  <td className="px-4 py-3 text-right text-base font-bold text-foreground">
                    ৳{total.toLocaleString()}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}


