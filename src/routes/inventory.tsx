import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, PageHeader, StatusPill, buttonGhost } from "@/components/ui-kit";
import {
  Boxes,
  PackagePlus,
  PackageMinus,
  AlertTriangle,
  Plus,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  getAssets,
  addAsset,
  getConsumables,
  addConsumable,
  getStockInHistory,
  addStockIn,
  getStockOutHistory,
  addStockOut,
  getDamageLostHistory,
  addDamageLostForAsset,
  addDamageLostForConsumable,
  type Asset,
  type Consumable,
  type StockInEntry,
  type StockOutEntry,
  type DamageLostEntry,
  type AssetCondition,
  type ConsumableUnit,
  type StockOutUsedFor,
} from "@/lib/inventory-storage";

export const Route = createFileRoute("/inventory")({
  head: () => ({ meta: [{ title: "Inventory — Navana Rest House" }] }),
  component: InventoryPage,
});

type Tab = "Assets" | "Consumables" | "Stock In" | "Stock Out" | "Damage / Lost";
const tabs: Tab[] = ["Assets", "Consumables", "Stock In", "Stock Out", "Damage / Lost"];

const ASSET_LOCATIONS = ["Room 101", "Room 102", "Reception", "Kitchen", "Store Room"];
const CONDITIONS: AssetCondition[] = ["Good", "Repair Needed", "Damaged", "Lost"];
const UNITS: ConsumableUnit[] = ["Piece", "Bottle", "Packet", "Box", "Kg", "Liter"];
const USED_FOR: StockOutUsedFor[] = ["Room", "Reception", "Kitchen", "Cleaning"];

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const buttonPrimary =
  "inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90";

function conditionTone(condition: AssetCondition) {
  switch (condition) {
    case "Good":
      return "success" as const;
    case "Repair Needed":
      return "warning" as const;
    case "Damaged":
    case "Lost":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function InventoryPage() {
  const [tab, setTab] = useState<Tab>("Assets");

  const [assets, setAssets] = useState<Asset[]>([]);
  const [consumables, setConsumables] = useState<Consumable[]>([]);
  const [stockIn, setStockIn] = useState<StockInEntry[]>([]);
  const [stockOut, setStockOut] = useState<StockOutEntry[]>([]);
  const [damageLost, setDamageLost] = useState<DamageLostEntry[]>([]);

  async function loadAll() {
    const [a, c, si, so, dl] = await Promise.all([
      getAssets(),
      getConsumables(),
      getStockInHistory(),
      getStockOutHistory(),
      getDamageLostHistory(),
    ]);
    setAssets(a);
    setConsumables(c);
    setStockIn(si);
    setStockOut(so);
    setDamageLost(dl);
  }

  useEffect(() => {
    loadAll();
    window.addEventListener("inventoryUpdated", loadAll);
    return () => window.removeEventListener("inventoryUpdated", loadAll);
  }, []);

  const dashboard = useMemo(() => {
    const totalAssets = assets.reduce((sum, a) => sum + a.quantity, 0);
    const good = assets.filter((a) => a.condition === "Good").length;
    const repair = assets.filter((a) => a.condition === "Repair Needed").length;
    const damaged = assets.filter((a) => a.condition === "Damaged").length;
    const lost = assets.filter((a) => a.condition === "Lost").length;

    const totalConsumables = consumables.length;
    const lowStock = consumables.filter(
      (c) => c.currentStock > 0 && c.currentStock <= c.minimumStock
    ).length;
    const outOfStock = consumables.filter((c) => c.currentStock <= 0).length;

    return { totalAssets, good, repair, damaged, lost, totalConsumables, lowStock, outOfStock };
  }, [assets, consumables]);

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Assets ও Consumables ট্র্যাক করুন — stock in/out এবং damage/lost রেকর্ড সহ।"
      />

      {/* Dashboard */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Total Assets
          </div>
          <div className="mt-1 text-2xl font-bold text-foreground">{dashboard.totalAssets}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            <StatusPill tone="success">{dashboard.good} Good</StatusPill>
            <StatusPill tone="warning">{dashboard.repair} Repair</StatusPill>
            <StatusPill tone="danger">{dashboard.damaged} Damaged</StatusPill>
            <StatusPill tone="danger">{dashboard.lost} Lost</StatusPill>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <PackagePlus className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Total Consumable Items
          </div>
          <div className="mt-1 text-2xl font-bold text-foreground">{dashboard.totalConsumables}</div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Low Stock
          </div>
          <div className="mt-1 text-2xl font-bold text-foreground">{dashboard.lowStock}</div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-500">
              <PackageMinus className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Out of Stock
          </div>
          <div className="mt-1 text-2xl font-bold text-foreground">{dashboard.outOfStock}</div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="mt-6 mb-6 inline-flex flex-wrap rounded-xl border border-border bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Assets" && <AssetsTab assets={assets} />}
      {tab === "Consumables" && <ConsumablesTab consumables={consumables} />}
      {tab === "Stock In" && <StockInTab consumables={consumables} history={stockIn} />}
      {tab === "Stock Out" && <StockOutTab consumables={consumables} history={stockOut} />}
      {tab === "Damage / Lost" && (
        <DamageLostTab assets={assets} consumables={consumables} history={damageLost} />
      )}
    </div>
  );
}

// =========================================================
// Assets Tab
// =========================================================

function AssetsTab({ assets }: { assets: Asset[] }) {
  const [showForm, setShowForm] = useState(false);
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState<AssetCondition>("Good");
  const [location, setLocation] = useState(ASSET_LOCATIONS[0]);
  const [purchaseDate, setPurchaseDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!itemName.trim() || !quantity) return;
    setSaving(true);
    await addAsset({
      itemName: itemName.trim(),
      category: category.trim() || undefined,
      quantity: Number(quantity),
      condition,
      location,
      purchaseDate: purchaseDate || undefined,
      remarks: remarks.trim() || undefined,
    });
    setSaving(false);
    setItemName("");
    setCategory("");
    setQuantity("1");
    setCondition("Good");
    setPurchaseDate("");
    setRemarks("");
    setShowForm(false);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Assets</h3>
        <button className={buttonPrimary} onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" />
          {showForm ? "Cancel" : "Add Asset"}
        </button>
      </div>

      {showForm && (
        <Card className="mb-6 p-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className={labelClass}>Item Name</label>
              <input className={inputClass} value={itemName} onChange={(e) => setItemName(e.target.value)} required />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <input className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Furniture, Electronics" />
            </div>
            <div>
              <label className={labelClass}>Quantity</label>
              <input type="number" min="1" className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </div>
            <div>
              <label className={labelClass}>Condition</label>
              <select className={inputClass} value={condition} onChange={(e) => setCondition(e.target.value as AssetCondition)}>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Location</label>
              <select className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)}>
                {ASSET_LOCATIONS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Purchase Date (Optional)</label>
              <input type="date" className={inputClass} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <label className={labelClass}>Remarks</label>
              <input className={inputClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <button type="submit" disabled={saving} className={buttonPrimary}>
                {saving ? "Saving..." : "Save Asset"}
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3">Condition</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    কোনো Asset পাওয়া যায়নি
                  </td>
                </tr>
              ) : (
                assets.map((a) => (
                  <tr key={a.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-semibold text-foreground">{a.itemName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.category || "—"}</td>
                    <td className="px-4 py-3 text-right text-foreground">{a.quantity}</td>
                    <td className="px-4 py-3"><StatusPill tone={conditionTone(a.condition)}>{a.condition}</StatusPill></td>
                    <td className="px-4 py-3 text-muted-foreground">{a.location}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.remarks || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// =========================================================
// Consumables Tab
// =========================================================

function ConsumablesTab({ consumables }: { consumables: Consumable[] }) {
  const [showForm, setShowForm] = useState(false);
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("");
  const [currentStock, setCurrentStock] = useState("0");
  const [minimumStock, setMinimumStock] = useState("0");
  const [unit, setUnit] = useState<ConsumableUnit>("Piece");
  const [location, setLocation] = useState(ASSET_LOCATIONS[0]);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!itemName.trim()) return;
    setSaving(true);
    await addConsumable({
      itemName: itemName.trim(),
      category: category.trim() || undefined,
      currentStock: Number(currentStock),
      minimumStock: Number(minimumStock),
      unit,
      location,
      remarks: remarks.trim() || undefined,
    });
    setSaving(false);
    setItemName("");
    setCategory("");
    setCurrentStock("0");
    setMinimumStock("0");
    setUnit("Piece");
    setRemarks("");
    setShowForm(false);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Consumables</h3>
        <button className={buttonPrimary} onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" />
          {showForm ? "Cancel" : "Add Consumable"}
        </button>
      </div>

      {showForm && (
        <Card className="mb-6 p-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className={labelClass}>Item Name</label>
              <input className={inputClass} value={itemName} onChange={(e) => setItemName(e.target.value)} required />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <input className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Unit</label>
              <select className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value as ConsumableUnit)}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Current Stock</label>
              <input type="number" min="0" className={inputClass} value={currentStock} onChange={(e) => setCurrentStock(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Minimum Stock</label>
              <input type="number" min="0" className={inputClass} value={minimumStock} onChange={(e) => setMinimumStock(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Location</label>
              <select className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)}>
                {ASSET_LOCATIONS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className={labelClass}>Remarks</label>
              <input className={inputClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <button type="submit" disabled={saving} className={buttonPrimary}>
                {saving ? "Saving..." : "Save Consumable"}
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Current Stock</th>
                <th className="px-4 py-3 text-right">Minimum</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {consumables.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    কোনো Consumable পাওয়া যায়নি
                  </td>
                </tr>
              ) : (
                consumables.map((c) => {
                  const isOut = c.currentStock <= 0;
                  const isLow = !isOut && c.currentStock <= c.minimumStock;
                  return (
                    <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">{c.itemName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.category || "—"}</td>
                      <td className="px-4 py-3 text-right text-foreground">{c.currentStock} {c.unit}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{c.minimumStock} {c.unit}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.location}</td>
                      <td className="px-4 py-3">
                        {isOut ? (
                          <StatusPill tone="danger">Out of Stock</StatusPill>
                        ) : isLow ? (
                          <StatusPill tone="warning">Low Stock</StatusPill>
                        ) : (
                          <StatusPill tone="success">OK</StatusPill>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// =========================================================
// Stock In Tab
// =========================================================

function StockInTab({ consumables, history }: { consumables: Consumable[]; history: StockInEntry[] }) {
  const [consumableId, setConsumableId] = useState(consumables[0]?.id || "");
  const [quantity, setQuantity] = useState("1");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!consumableId && consumables.length > 0) setConsumableId(consumables[0].id);
  }, [consumables, consumableId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const item = consumables.find((c) => c.id === consumableId);
    if (!item || !quantity) return;
    setSaving(true);
    await addStockIn({
      date,
      consumableId: item.id,
      itemName: item.itemName,
      quantity: Number(quantity),
      supplier: supplier.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setSaving(false);
    setQuantity("1");
    setSupplier("");
    setNotes("");
  }

  return (
    <div>
      <Card className="mb-6 p-6">
        <h3 className="mb-4 text-sm font-semibold text-foreground">নতুন Stock In এন্ট্রি</h3>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className={labelClass}>Date</label>
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Item</label>
            <select className={inputClass} value={consumableId} onChange={(e) => setConsumableId(e.target.value)} required>
              {consumables.length === 0 && <option value="">প্রথমে একটি Consumable যোগ করুন</option>}
              {consumables.map((c) => (
                <option key={c.id} value={c.id}>{c.itemName} ({c.currentStock} {c.unit})</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Quantity</label>
            <input type="number" min="1" className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Supplier (Optional)</label>
            <input className={inputClass} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Notes</label>
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <button type="submit" disabled={saving || !consumableId} className={buttonPrimary}>
              <PackagePlus className="h-4 w-4" />
              {saving ? "Saving..." : "Add Stock In"}
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="border-b border-border px-6 py-4">
          <h3 className="text-sm font-semibold text-foreground">Stock In History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    কোনো Data পাওয়া যায়নি
                  </td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 text-foreground">{h.date}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{h.itemName}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">+{h.quantity}</td>
                    <td className="px-4 py-3 text-muted-foreground">{h.supplier || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{h.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// =========================================================
// Stock Out Tab
// =========================================================

function StockOutTab({ consumables, history }: { consumables: Consumable[]; history: StockOutEntry[] }) {
  const [consumableId, setConsumableId] = useState(consumables[0]?.id || "");
  const [quantity, setQuantity] = useState("1");
  const [usedFor, setUsedFor] = useState<StockOutUsedFor>("Room");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!consumableId && consumables.length > 0) setConsumableId(consumables[0].id);
  }, [consumables, consumableId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const item = consumables.find((c) => c.id === consumableId);
    if (!item || !quantity) return;
    setSaving(true);
    await addStockOut({
      date,
      consumableId: item.id,
      itemName: item.itemName,
      quantity: Number(quantity),
      usedFor,
      notes: notes.trim() || undefined,
    });
    setSaving(false);
    setQuantity("1");
    setNotes("");
  }

  return (
    <div>
      <Card className="mb-6 p-6">
        <h3 className="mb-4 text-sm font-semibold text-foreground">নতুন Stock Out এন্ট্রি</h3>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className={labelClass}>Date</label>
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Item</label>
            <select className={inputClass} value={consumableId} onChange={(e) => setConsumableId(e.target.value)} required>
              {consumables.length === 0 && <option value="">প্রথমে একটি Consumable যোগ করুন</option>}
              {consumables.map((c) => (
                <option key={c.id} value={c.id}>{c.itemName} ({c.currentStock} {c.unit})</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Quantity</label>
            <input type="number" min="1" className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Used For</label>
            <select className={inputClass} value={usedFor} onChange={(e) => setUsedFor(e.target.value as StockOutUsedFor)}>
              {USED_FOR.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Notes</label>
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <button type="submit" disabled={saving || !consumableId} className={buttonPrimary}>
              <PackageMinus className="h-4 w-4" />
              {saving ? "Saving..." : "Add Stock Out"}
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="border-b border-border px-6 py-4">
          <h3 className="text-sm font-semibold text-foreground">Stock Out History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3">Used For</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    কোনো Data পাওয়া যায়নি
                  </td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 text-foreground">{h.date}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{h.itemName}</td>
                    <td className="px-4 py-3 text-right text-amber-600">-{h.quantity}</td>
                    <td className="px-4 py-3 text-muted-foreground">{h.usedFor}</td>
                    <td className="px-4 py-3 text-muted-foreground">{h.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// =========================================================
// Damage / Lost Tab
// =========================================================

function DamageLostTab({
  assets,
  consumables,
  history,
}: {
  assets: Asset[];
  consumables: Consumable[];
  history: DamageLostEntry[];
}) {
  const [itemType, setItemType] = useState<"Asset" | "Consumable">("Asset");
  const [selectedId, setSelectedId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [assetNewCondition, setAssetNewCondition] = useState<"Damaged" | "Lost">("Damaged");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !quantity) return;
    setSaving(true);

    if (itemType === "Asset") {
      const asset = assets.find((a) => a.id === selectedId);
      if (asset) {
        await addDamageLostForAsset({
          date,
          assetId: asset.id,
          itemName: asset.itemName,
          quantity: Number(quantity),
          reason: reason.trim() || undefined,
          newCondition: assetNewCondition,
        });
      }
    } else {
      const consumable = consumables.find((c) => c.id === selectedId);
      if (consumable) {
        await addDamageLostForConsumable({
          date,
          consumableId: consumable.id,
          itemName: consumable.itemName,
          quantity: Number(quantity),
          reason: reason.trim() || undefined,
        });
      }
    }

    setSaving(false);
    setQuantity("1");
    setReason("");
  }

  const options = itemType === "Asset" ? assets : consumables;

  return (
    <div>
      <Card className="mb-6 p-6">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Damage / Lost রেকর্ড</h3>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className={labelClass}>Date</label>
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Item Type</label>
            <select
              className={inputClass}
              value={itemType}
              onChange={(e) => {
                setItemType(e.target.value as "Asset" | "Consumable");
                setSelectedId("");
              }}
            >
              <option value="Asset">Asset</option>
              <option value="Consumable">Consumable</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Item</label>
            <select className={inputClass} value={selectedId} onChange={(e) => setSelectedId(e.target.value)} required>
              <option value="">নির্বাচন করুন</option>
              {options.map((o: any) => (
                <option key={o.id} value={o.id}>{o.itemName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Quantity</label>
            <input type="number" min="1" className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          </div>
          {itemType === "Asset" && (
            <div>
              <label className={labelClass}>Mark As</label>
              <select className={inputClass} value={assetNewCondition} onChange={(e) => setAssetNewCondition(e.target.value as "Damaged" | "Lost")}>
                <option value="Damaged">Damaged</option>
                <option value="Lost">Lost</option>
              </select>
            </div>
          )}
          <div className="md:col-span-2">
            <label className={labelClass}>Reason</label>
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <button type="submit" disabled={saving || !selectedId} className={buttonPrimary}>
              {itemType === "Asset" ? <Wrench className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {saving ? "Saving..." : "Save Record"}
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="border-b border-border px-6 py-4">
          <h3 className="text-sm font-semibold text-foreground">Damage / Lost History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    কোনো Data পাওয়া যায়নি
                  </td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 text-foreground">{h.date}</td>
                    <td className="px-4 py-3 text-muted-foreground">{h.itemType}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{h.itemName}</td>
                    <td className="px-4 py-3 text-right text-red-500">{h.quantity}</td>
                    <td className="px-4 py-3 text-muted-foreground">{h.reason || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
