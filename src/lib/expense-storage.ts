import { supabase } from "./supabaseClient";
import type { Expense } from "./mock-data";

function rowToExpense(row: any): Expense {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    description: row.description || "",
    amount: Number(row.amount),
    method: row.method,
    notes: row.notes || undefined,
  };
}

export async function getExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getExpenses failed:", error.message);
    return [];
  }

  return (data || []).map(rowToExpense);
}

// Generates EXP-YYYYMMDD-0001, EXP-YYYYMMDD-0002... resets every day,
// same pattern as the Booking ID (NRH-YYYYMMDD-0001).
function generateExpenseId(existingExpenses: Expense[]): string {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  const todaysNumbers = existingExpenses
    .filter((e) => e.id.startsWith(`EXP-${datePart}-`))
    .map((e) => parseInt(e.id.split("-")[2], 10))
    .filter((n) => !isNaN(n));

  const nextNumber = todaysNumbers.length > 0 ? Math.max(...todaysNumbers) + 1 : 1;

  return `EXP-${datePart}-${String(nextNumber).padStart(4, "0")}`;
}

export async function addExpense(newExpense: Omit<Expense, "id">): Promise<Expense> {
  const allExpenses = await getExpenses();

  const expenseWithId: Expense = {
    ...newExpense,
    id: generateExpenseId(allExpenses),
  };

  const { error } = await supabase.from("expenses").insert({
    id: expenseWithId.id,
    date: expenseWithId.date,
    category: expenseWithId.category,
    description: expenseWithId.description,
    amount: expenseWithId.amount,
    method: expenseWithId.method,
    notes: expenseWithId.notes || null,
  });

  if (error) console.error("addExpense failed:", error.message);

  refreshExpenses();
  return expenseWithId;
}

export async function updateExpense(id: string, updates: Partial<Expense>) {
  const { error } = await supabase.from("expenses").update(updates).eq("id", id);
  if (error) console.error("updateExpense failed:", error.message);
  refreshExpenses();
}

export async function deleteExpense(id: string) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) console.error("deleteExpense failed:", error.message);
  refreshExpenses();
}

// --- Helpers the Dashboard can use for real Today's Expense / Profit ---

export async function getTodayExpenseTotal(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);

  return (await getExpenses())
    .filter((e) => e.date === today)
    .reduce((sum, e) => sum + e.amount, 0);
}

// month is 1-12
export async function getMonthExpenseTotal(year: number, month: number): Promise<number> {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;

  return (await getExpenses())
    .filter((e) => e.date.startsWith(prefix))
    .reduce((sum, e) => sum + e.amount, 0);
}

export function refreshExpenses() {
  window.dispatchEvent(new Event("expensesUpdated"));
}
