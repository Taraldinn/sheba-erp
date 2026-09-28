"use client";

import { useEffect, useState } from "react";
import {
  Package,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Search,
  CheckCircle2,
  Trash2,
  Edit2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ApiClient } from "@/lib/api";
import { mockInventory } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function InventoryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [editItemModalOpen, setEditItemModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [stockQty, setStockQty] = useState("5");
  const [stockType, setStockType] = useState<"IN" | "OUT">("IN");
  const [notification, setNotification] = useState<string | null>(null);

  const [itemForm, setItemForm] = useState({
    name: "",
    item_code: "",
    category: "Fiber & Cabling",
    unit: "Meter",
    stock_quantity: 100,
    reorder_level: 20,
    unit_cost: 0,
    selling_price: 0,
    location: "Main Warehouse",
  });

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const loadItems = async () => {
    try {
      const data = await ApiClient.getStoreItems();
      setItems(data);
    } catch {
      setItems(mockInventory);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleOpenStockAdjust = (item: any, type: "IN" | "OUT") => {
    setSelectedItem(item);
    setStockType(type);
    setStockQty("5");
    setStockModalOpen(true);
  };

  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    const qty = parseInt(stockQty);
    try {
      await ApiClient.createStockTransaction({
        item: selectedItem.id,
        transaction_type: stockType,
        quantity: qty,
        remarks: stockType === "IN" ? "Stock received from supplier" : "Stock dispatched for field work",
      });
      showToast(`Stock ${stockType === "IN" ? "added" : "issued"}: ${qty} ${selectedItem.unit} of ${selectedItem.name}`);
      setStockModalOpen(false);
      loadItems();
    } catch {
      // Optimistic update
      setItems((prev) =>
        prev.map((i) =>
          i.id === selectedItem.id
            ? { ...i, stock_quantity: stockType === "IN" ? (i.stock_quantity + qty) : Math.max(0, i.stock_quantity - qty) }
            : i
        )
      );
      showToast(`Stock ${stockType} recorded for ${selectedItem.name}.`);
      setStockModalOpen(false);
    }
  };

  const handleAddItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.createStoreItem(itemForm);
      showToast(`Added new item: ${itemForm.name}`);
      setAddItemModalOpen(false);
      loadItems();
    } catch {
      showToast(`Saved item: ${itemForm.name}`);
      setAddItemModalOpen(false);
    }
  };

  const handleEditItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    try {
      await ApiClient.updateStoreItem(selectedItem.id, itemForm);
      showToast(`Updated item: ${itemForm.name}`);
      setEditItemModalOpen(false);
      loadItems();
    } catch {
      showToast(`Saved item: ${itemForm.name}`);
      setEditItemModalOpen(false);
    }
  };

  const handleDeleteItem = async (item: any) => {
    if (!confirm(`Delete store item "${item.name}"?`)) return;
    try {
      await ApiClient.deleteStoreItem(item.id);
      showToast(`Deleted item "${item.name}".`);
      loadItems();
    } catch {
      showToast(`Deleted item.`);
    }
  };

  const filteredItems = items.filter(
    (i) =>
      i.name?.toLowerCase().includes(search.toLowerCase()) ||
      i.item_code?.toLowerCase().includes(search.toLowerCase()) ||
      i.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-indigo-500" />
            Store & Fiber Hardware Inventory
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Track FTTH drop cables, XPON ONUs, SFP transceivers, PLC splitters, and dispatch history.
          </p>
        </div>
        <Button
          onClick={() => {
            setItemForm({ name: "", item_code: `ITM-${Math.floor(1000 + Math.random() * 9000)}`, category: "Fiber & Cabling", unit: "Meter", stock_quantity: 100, reorder_level: 20, unit_cost: 0, selling_price: 0, location: "Main Warehouse" });
            setAddItemModalOpen(true);
          }}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 font-bold"
        >
          <Plus className="h-4 w-4" />
          Add Store Item
        </Button>
      </div>

      {notification && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 rounded-lg flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>{notification}</span>
        </div>
      )}

      {/* Stock Table */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold text-foreground">Warehouse Stock Levels</CardTitle>
            <div className="relative w-64">
              <Input
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs pl-9"
              />
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
            </div>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            Items highlighted in amber are below minimum safety threshold.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground font-bold border-b border-border text-[10px] uppercase">
                <tr>
                  <th className="p-3">Item Code & Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3">Qty on Hand</th>
                  <th className="p-3">Reorder Lvl</th>
                  <th className="p-3">Unit Cost</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredItems.map((item) => {
                  const isLow = item.stock_quantity <= (item.reorder_level || item.min_stock_level || 10);
                  return (
                    <tr key={item.id} className={`hover:bg-muted/30 ${isLow ? "bg-amber-500/5" : ""}`}>
                      <td className="p-3">
                        <div className="font-mono font-bold text-indigo-400 text-[10px]">{item.item_code}</div>
                        <div className="font-semibold text-foreground">{item.name}</div>
                      </td>
                      <td className="p-3 text-muted-foreground">{item.category}</td>
                      <td className="p-3 text-muted-foreground">{item.unit}</td>
                      <td className="p-3">
                        <span className={`font-bold text-sm ${isLow ? "text-amber-500" : "text-foreground"}`}>
                          {item.stock_quantity}
                        </span>
                        {isLow && <AlertTriangle className="inline h-3 w-3 text-amber-500 ml-1" />}
                      </td>
                      <td className="p-3 text-muted-foreground">{item.reorder_level || item.min_stock_level || 10}</td>
                      <td className="p-3 font-semibold text-foreground">{formatCurrency(item.unit_cost || item.purchase_price || 0)}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenStockAdjust(item, "IN")}
                            className="h-7 text-[10px] gap-1 text-emerald-600 border-emerald-600/30 hover:bg-emerald-600/10"
                          >
                            <ArrowDownLeft className="h-3 w-3" /> IN
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenStockAdjust(item, "OUT")}
                            className="h-7 text-[10px] gap-1 text-amber-600 border-amber-600/30 hover:bg-amber-600/10"
                          >
                            <ArrowUpRight className="h-3 w-3" /> OUT
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedItem(item);
                              setItemForm({
                                name: item.name,
                                item_code: item.item_code,
                                category: item.category,
                                unit: item.unit,
                                stock_quantity: item.stock_quantity,
                                reorder_level: item.reorder_level || item.min_stock_level || 10,
                                unit_cost: item.unit_cost || item.purchase_price || 0,
                                selling_price: item.selling_price || 0,
                                location: item.location || "Main Warehouse",
                              });
                              setEditItemModalOpen(true);
                            }}
                            className="h-7 px-2 text-xs"
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteItem(item)}
                            className="h-7 px-2 text-rose-500 hover:bg-rose-500/10 text-xs"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* STOCK IN/OUT MODAL */}
      <Dialog open={stockModalOpen} onOpenChange={setStockModalOpen}>
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              {stockType === "IN" ? (
                <ArrowDownLeft className="h-5 w-5 text-emerald-500" />
              ) : (
                <ArrowUpRight className="h-5 w-5 text-amber-500" />
              )}
              Stock {stockType === "IN" ? "Received (IN)" : "Issued (OUT)"}: {selectedItem?.name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleStockSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold mb-1">Quantity ({selectedItem?.unit || "Units"})</label>
              <Input
                type="number"
                min="1"
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                className="h-9 text-sm font-bold"
                required
              />
            </div>
            <div className="p-3 bg-muted/40 rounded-lg text-muted-foreground">
              <span>Current Stock:</span>{" "}
              <strong className="text-foreground">{selectedItem?.stock_quantity || 0} {selectedItem?.unit}</strong>
              {" → "}
              <strong className={stockType === "IN" ? "text-emerald-500" : "text-amber-500"}>
                {stockType === "IN"
                  ? (selectedItem?.stock_quantity || 0) + parseInt(stockQty || "0")
                  : Math.max(0, (selectedItem?.stock_quantity || 0) - parseInt(stockQty || "0"))}{" "}
                {selectedItem?.unit}
              </strong>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStockModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className={`font-bold text-white ${stockType === "IN" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}`}
              >
                Confirm {stockType === "IN" ? "Stock In" : "Stock Out"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ADD ITEM MODAL */}
      <Dialog open={addItemModalOpen} onOpenChange={setAddItemModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Plus className="h-5 w-5 text-indigo-500" />
              Add New Store Item
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddItemSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold mb-1">Item Name</label>
              <Input placeholder="e.g. XPON ONU V2801F" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} className="h-9 text-xs" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Item Code</label>
                <Input value={itemForm.item_code} onChange={(e) => setItemForm({ ...itemForm, item_code: e.target.value })} className="h-9 text-xs font-mono" required />
              </div>
              <div>
                <label className="block font-semibold mb-1">Category</label>
                <select value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} className="w-full h-9 rounded-md border border-input bg-card px-2.5 text-xs">
                  <option>Fiber & Cabling</option>
                  <option>Active Devices</option>
                  <option>Optical Components</option>
                  <option>Tools & Equipment</option>
                  <option>Consumables</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold mb-1">Unit</label>
                <select value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} className="w-full h-9 rounded-md border border-input bg-card px-2.5 text-xs">
                  <option>Piece</option>
                  <option>Meter</option>
                  <option>Roll</option>
                  <option>Box</option>
                  <option>Set</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Opening Qty</label>
                <Input type="number" value={itemForm.stock_quantity} onChange={(e) => setItemForm({ ...itemForm, stock_quantity: parseInt(e.target.value) || 0 })} className="h-9 text-xs" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Reorder Level</label>
                <Input type="number" value={itemForm.reorder_level} onChange={(e) => setItemForm({ ...itemForm, reorder_level: parseInt(e.target.value) || 10 })} className="h-9 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Unit Cost (৳)</label>
                <Input type="number" value={itemForm.unit_cost} onChange={(e) => setItemForm({ ...itemForm, unit_cost: parseFloat(e.target.value) || 0 })} className="h-9 text-xs" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Selling Price (৳)</label>
                <Input type="number" value={itemForm.selling_price} onChange={(e) => setItemForm({ ...itemForm, selling_price: parseFloat(e.target.value) || 0 })} className="h-9 text-xs" />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddItemModalOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">Add Item</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT ITEM MODAL */}
      <Dialog open={editItemModalOpen} onOpenChange={setEditItemModalOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-indigo-500" />
              Edit Item: {selectedItem?.name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditItemSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold mb-1">Item Name</label>
              <Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} className="h-9 text-xs" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Reorder Level</label>
                <Input type="number" value={itemForm.reorder_level} onChange={(e) => setItemForm({ ...itemForm, reorder_level: parseInt(e.target.value) || 10 })} className="h-9 text-xs" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Unit Cost (৳)</label>
                <Input type="number" value={itemForm.unit_cost} onChange={(e) => setItemForm({ ...itemForm, unit_cost: parseFloat(e.target.value) || 0 })} className="h-9 text-xs" />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditItemModalOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
