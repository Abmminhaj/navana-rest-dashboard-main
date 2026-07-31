import { supabase } from "./supabaseClient";
import { addNotificationLogEntry } from "./notification-log-storage";

// =========================================================
// Types
// =========================================================

export type AssetCondition = "Good" | "Repair Needed" | "Damaged" | "Lost";
export type ConsumableUnit = "Piece" | "Bottle" | "Packet" | "Box" | "Kg" | "Liter";
export type StockOutUsedFor = "Room" | "Reception" | "Kitchen" | "Cleaning";

export interface Asset {
  id: string;
  itemName: string;
  category: string | null;
  quantity: number;
  condition: AssetCondition;
  location: string;
  purchaseDate: string | null;
  remarks: string | null;
}

export interface Consumable {
  id: string;
  itemName: string;
  category: string | null;
  currentStock: number;
  minimumStock: number;
  unit: ConsumableUnit;
  location: string;
  remarks: string | null;
}

export interface StockInEntry {
  id: string;
  date: string;
  consumableId: string | null;
  itemName: string;
  quantity: number;
  supplier: string | null;
  notes: string | null;
}

export interface StockOutEntry {
  id: string;
  date: string;
  consumableId: string | null;
  itemName: string;
  quantity: number;
  usedFor: StockOutUsedFor;
  notes: string | null;
}

export interface DamageLostEntry {
  id: string;
  date: string;
  itemType: "Asset" | "Consumable";
  assetId: string | null;
  consumableId: string | null;
  itemName: string;
  quantity: number;
  reason: string | null;
}

// =========================================================
// Row <-> app-shape mappers (DB is snake_case, app is camelCase)
// =========================================================

function rowToAsset(row: any): Asset {
  return {
    id: row.id,
    itemName: row.item_name,
    category: row.category,
    quantity: row.quantity,
    condition: row.condition,
    location: row.location,
    purchaseDate: row.purchase_date,
    remarks: row.remarks,
  };
}

function rowToConsumable(row: any): Consumable {
  return {
    id: row.id,
    itemName: row.item_name,
    category: row.category,
    currentStock: Number(row.current_stock),
    minimumStock: Number(row.minimum_stock),
    unit: row.unit,
    location: row.location,
    remarks: row.remarks,
  };
}

function rowToStockIn(row: any): StockInEntry {
  return {
    id: row.id,
    date: row.date,
    consumableId: row.consumable_id,
    itemName: row.item_name,
    quantity: Number(row.quantity),
    supplier: row.supplier,
    notes: row.notes,
  };
}

function rowToStockOut(row: any): StockOutEntry {
  return {
    id: row.id,
    date: row.date,
    consumableId: row.consumable_id,
    itemName: row.item_name,
    quantity: Number(row.quantity),
    usedFor: row.used_for,
    notes: row.notes,
  };
}

function rowToDamageLost(row: any): DamageLostEntry {
  return {
    id: row.id,
    date: row.date,
    itemType: row.item_type,
    assetId: row.asset_id,
    consumableId: row.consumable_id,
    itemName: row.item_name,
    quantity: Number(row.quantity),
    reason: row.reason,
  };
}

// =========================================================
// Assets
// =========================================================

export async function getAssets(): Promise<Asset[]> {
  const { data, error } = await supabase
    .from("inventory_assets")
    .select("*")
    .order("item_name", { ascending: true });

  if (error) {
    console.error("getAssets failed:", error.message);
    return [];
  }
  return (data || []).map(rowToAsset);
}

export async function addAsset(input: {
  itemName: string;
  category?: string;
  quantity: number;
  condition: AssetCondition;
  location: string;
  purchaseDate?: string;
  remarks?: string;
}) {
  const { error } = await supabase.from("inventory_assets").insert({
    item_name: input.itemName,
    category: input.category || null,
    quantity: input.quantity,
    condition: input.condition,
    location: input.location,
    purchase_date: input.purchaseDate || null,
    remarks: input.remarks || null,
  });
  if (error) console.error("addAsset failed:", error.message);
  refreshInventory();
}

export async function updateAsset(id: string, updates: Partial<Asset>) {
  const payload: Record<string, any> = {};
  if (updates.itemName !== undefined) payload.item_name = updates.itemName;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.quantity !== undefined) payload.quantity = updates.quantity;
  if (updates.condition !== undefined) payload.condition = updates.condition;
  if (updates.location !== undefined) payload.location = updates.location;
  if (updates.purchaseDate !== undefined) payload.purchase_date = updates.purchaseDate;
  if (updates.remarks !== undefined) payload.remarks = updates.remarks;
  payload.updated_at = new Date().toISOString();

  const { error } = await supabase.from("inventory_assets").update(payload).eq("id", id);
  if (error) console.error("updateAsset failed:", error.message);
  refreshInventory();
}

export async function deleteAsset(id: string) {
  const { error } = await supabase.from("inventory_assets").delete().eq("id", id);
  if (error) console.error("deleteAsset failed:", error.message);
  refreshInventory();
}

// =========================================================
// Consumables
// =========================================================

export async function getConsumables(): Promise<Consumable[]> {
  const { data, error } = await supabase
    .from("inventory_consumables")
    .select("*")
    .order("item_name", { ascending: true });

  if (error) {
    console.error("getConsumables failed:", error.message);
    return [];
  }
  return (data || []).map(rowToConsumable);
}

export async function addConsumable(input: {
  itemName: string;
  category?: string;
  currentStock: number;
  minimumStock: number;
  unit: ConsumableUnit;
  location: string;
  remarks?: string;
}) {
  const { error } = await supabase.from("inventory_consumables").insert({
    item_name: input.itemName,
    category: input.category || null,
    current_stock: input.currentStock,
    minimum_stock: input.minimumStock,
    unit: input.unit,
    location: input.location,
    remarks: input.remarks || null,
  });
  if (error) console.error("addConsumable failed:", error.message);
  refreshInventory();
}

export async function updateConsumable(id: string, updates: Partial<Consumable>) {
  const payload: Record<string, any> = {};
  if (updates.itemName !== undefined) payload.item_name = updates.itemName;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.currentStock !== undefined) payload.current_stock = updates.currentStock;
  if (updates.minimumStock !== undefined) payload.minimum_stock = updates.minimumStock;
  if (updates.unit !== undefined) payload.unit = updates.unit;
  if (updates.location !== undefined) payload.location = updates.location;
  if (updates.remarks !== undefined) payload.remarks = updates.remarks;
  payload.updated_at = new Date().toISOString();

  const { error } = await supabase.from("inventory_consumables").update(payload).eq("id", id);
  if (error) console.error("updateConsumable failed:", error.message);
  refreshInventory();
}

export async function deleteConsumable(id: string) {
  const { error } = await supabase.from("inventory_consumables").delete().eq("id", id);
  if (error) console.error("deleteConsumable failed:", error.message);
  refreshInventory();
}

// Checks stock after a stock-out and pushes a notification if low/out.
async function checkLowStockAndNotify(consumable: Consumable) {
  if (consumable.currentStock <= 0) {
    await addNotificationLogEntry({
      title: "স্টক শেষ (Out of Stock)",
      body: `${consumable.itemName} — stock is now 0 ${consumable.unit}.`,
    });
  } else if (consumable.currentStock <= consumable.minimumStock) {
    await addNotificationLogEntry({
      title: "স্টক কম (Low Stock)",
      body: `${consumable.itemName} — only ${consumable.currentStock} ${consumable.unit} left (minimum: ${consumable.minimumStock}).`,
    });
  }
}

// =========================================================
// Stock In (purchases) — increases consumable stock
// =========================================================

export async function getStockInHistory(): Promise<StockInEntry[]> {
  const { data, error } = await supabase
    .from("inventory_stock_in")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getStockInHistory failed:", error.message);
    return [];
  }
  return (data || []).map(rowToStockIn);
}

export async function addStockIn(input: {
  date?: string;
  consumableId: string;
  itemName: string;
  quantity: number;
  supplier?: string;
  notes?: string;
}) {
  const { error: insertError } = await supabase.from("inventory_stock_in").insert({
    date: input.date || new Date().toISOString().slice(0, 10),
    consumable_id: input.consumableId,
    item_name: input.itemName,
    quantity: input.quantity,
    supplier: input.supplier || null,
    notes: input.notes || null,
  });
  if (insertError) {
    console.error("addStockIn failed:", insertError.message);
    return;
  }

  // Increase current_stock on the consumable
  const { data: current, error: fetchError } = await supabase
    .from("inventory_consumables")
    .select("current_stock")
    .eq("id", input.consumableId)
    .single();

  if (fetchError) {
    console.error("addStockIn: could not read current stock:", fetchError.message);
  } else {
    const newStock = Number(current.current_stock) + input.quantity;
    const { error: updateError } = await supabase
      .from("inventory_consumables")
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq("id", input.consumableId);
    if (updateError) console.error("addStockIn: stock update failed:", updateError.message);
  }

  refreshInventory();
}

// =========================================================
// Stock Out (usage) — decreases consumable stock
// =========================================================

export async function getStockOutHistory(): Promise<StockOutEntry[]> {
  const { data, error } = await supabase
    .from("inventory_stock_out")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getStockOutHistory failed:", error.message);
    return [];
  }
  return (data || []).map(rowToStockOut);
}

export async function addStockOut(input: {
  date?: string;
  consumableId: string;
  itemName: string;
  quantity: number;
  usedFor: StockOutUsedFor;
  notes?: string;
}) {
  const { error: insertError } = await supabase.from("inventory_stock_out").insert({
    date: input.date || new Date().toISOString().slice(0, 10),
    consumable_id: input.consumableId,
    item_name: input.itemName,
    quantity: input.quantity,
    used_for: input.usedFor,
    notes: input.notes || null,
  });
  if (insertError) {
    console.error("addStockOut failed:", insertError.message);
    return;
  }

  // Decrease current_stock on the consumable, then check for low-stock notification
  const { data: current, error: fetchError } = await supabase
    .from("inventory_consumables")
    .select("*")
    .eq("id", input.consumableId)
    .single();

  if (fetchError) {
    console.error("addStockOut: could not read current stock:", fetchError.message);
  } else {
    const newStock = Math.max(0, Number(current.current_stock) - input.quantity);
    const { error: updateError } = await supabase
      .from("inventory_consumables")
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq("id", input.consumableId);
    if (updateError) {
      console.error("addStockOut: stock update failed:", updateError.message);
    } else {
      await checkLowStockAndNotify(rowToConsumable({ ...current, current_stock: newStock }));
    }
  }

  refreshInventory();
}

// =========================================================
// Damage / Lost
// =========================================================

export async function getDamageLostHistory(): Promise<DamageLostEntry[]> {
  const { data, error } = await supabase
    .from("inventory_damage_lost")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getDamageLostHistory failed:", error.message);
    return [];
  }
  return (data || []).map(rowToDamageLost);
}

export async function addDamageLostForAsset(input: {
  date?: string;
  assetId: string;
  itemName: string;
  quantity: number;
  reason?: string;
  newCondition: "Damaged" | "Lost";
}) {
  const { error: insertError } = await supabase.from("inventory_damage_lost").insert({
    date: input.date || new Date().toISOString().slice(0, 10),
    item_type: "Asset",
    asset_id: input.assetId,
    item_name: input.itemName,
    quantity: input.quantity,
    reason: input.reason || null,
  });
  if (insertError) console.error("addDamageLostForAsset failed:", insertError.message);

  await updateAsset(input.assetId, { condition: input.newCondition });
  refreshInventory();
}

export async function addDamageLostForConsumable(input: {
  date?: string;
  consumableId: string;
  itemName: string;
  quantity: number;
  reason?: string;
}) {
  const { error: insertError } = await supabase.from("inventory_damage_lost").insert({
    date: input.date || new Date().toISOString().slice(0, 10),
    item_type: "Consumable",
    consumable_id: input.consumableId,
    item_name: input.itemName,
    quantity: input.quantity,
    reason: input.reason || null,
  });
  if (insertError) console.error("addDamageLostForConsumable failed:", insertError.message);

  const { data: current, error: fetchError } = await supabase
    .from("inventory_consumables")
    .select("*")
    .eq("id", input.consumableId)
    .single();

  if (!fetchError && current) {
    const newStock = Math.max(0, Number(current.current_stock) - input.quantity);
    await supabase
      .from("inventory_consumables")
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq("id", input.consumableId);
    await checkLowStockAndNotify(rowToConsumable({ ...current, current_stock: newStock }));
  }

  refreshInventory();
}

/** Remove a damage/lost log while keeping the current inventory unchanged. */
export async function deleteDamageLost(id: string) {
  const { error } = await supabase.from("inventory_damage_lost").delete().eq("id", id);
  if (error) console.error("deleteDamageLost failed:", error.message);
  refreshInventory();
}

/** Undo a damage/lost entry: restore the asset condition or consumable stock, then remove the log. */
export async function restoreDamageLost(entry: DamageLostEntry) {
  if (entry.itemType === "Asset" && entry.assetId) {
    await updateAsset(entry.assetId, { condition: "Good" });
  } else if (entry.itemType === "Consumable" && entry.consumableId) {
    const { data: current, error } = await supabase
      .from("inventory_consumables")
      .select("current_stock")
      .eq("id", entry.consumableId)
      .single();
    if (!error && current) {
      await supabase
        .from("inventory_consumables")
        .update({ current_stock: Number(current.current_stock) + entry.quantity, updated_at: new Date().toISOString() })
        .eq("id", entry.consumableId);
    }
  }
  await supabase.from("inventory_damage_lost").delete().eq("id", entry.id);
  refreshInventory();
}

// =========================================================
// Reactivity — mirrors the window-event pattern used by
// room-storage / expense-storage / notification-log-storage
// =========================================================

export function refreshInventory() {
  window.dispatchEvent(new Event("inventoryUpdated"));
}
