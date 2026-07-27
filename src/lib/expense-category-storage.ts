import { supabase } from "./supabaseClient";

const DEFAULT_CATEGORIES = [
  "Rent",
  "Utilities",
  "Maintenance",
  "Supplies",
  "Salary",
  "Food & Beverage",
  "Marketing",
  "Other",
];

export async function getExpenseCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from("expense_categories")
    .select("name")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getExpenseCategories failed:", error.message);
    return [];
  }

  return (data || []).map((row) => row.name as string);
}

// Returns the updated list. Throws CATEGORY_EMPTY / CATEGORY_EXISTS on bad input.
export async function addExpenseCategory(name: string): Promise<string[]> {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new Error("CATEGORY_EMPTY");
  }

  const categories = await getExpenseCategories();

  if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("CATEGORY_EXISTS");
  }

  const { error } = await supabase.from("expense_categories").insert({ name: trimmed });
  if (error) throw error;

  const updated = [...categories, trimmed];
  refreshExpenseCategories();
  return updated;
}

export async function deleteExpenseCategory(name: string): Promise<string[]> {
  const { error } = await supabase.from("expense_categories").delete().eq("name", name);
  if (error) console.error("deleteExpenseCategory failed:", error.message);

  const updated = await getExpenseCategories();
  refreshExpenseCategories();
  return updated;
}

export async function resetExpenseCategoriesToDefault(): Promise<string[]> {
  const { error: delErr } = await supabase.from("expense_categories").delete().neq("name", "__none__");
  if (delErr) console.error("reset delete failed:", delErr.message);

  const { error } = await supabase
    .from("expense_categories")
    .insert(DEFAULT_CATEGORIES.map((name) => ({ name })));
  if (error) console.error("reset insert failed:", error.message);

  refreshExpenseCategories();
  return [...DEFAULT_CATEGORIES];
}

export function refreshExpenseCategories() {
  window.dispatchEvent(new Event("expenseCategoriesUpdated"));
}
