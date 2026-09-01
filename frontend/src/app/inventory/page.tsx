"use client";

import { useState } from "react";
import {
  Package,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Search,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { mockInventory, InventoryItem } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>(mockInventory);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [stockQty, setStockQty] = useState("5");
  const [stockType, setStockType] = useState<"IN" | "OUT">("IN");

  const handleOpenStockAdjust = (item: InventoryItem, type: "IN" | "OUT") => {
    setSelectedItem(item);
    setStockType(type);
    setStockModalOpen(true);
  };

  const handleStockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    const qty = parseInt(stockQty);
    const updated = items.map((i) => {
      if (i.id === selectedItem.id) {
        return {
          ...i,
          stock_quantity: stockType === "IN" ? i.stock_quantity + qty : Math.max(0, i.stock_quantity - qty),
        };
      }
      return i;
    });
    setItems(updated);
    setStockModalOpen(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Store & Fiber Hardware Inventory</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Track FTTH drop cables, XPON ONUs, SFP optical transceivers, PLC splitters, and dispatch history.
          </p>
        </div>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5">
          <Plus className="h-4 w-4" />
          Add Store Item
        </Button>
      </div>

      {/* Stock Table */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">Warehouse Stock Levels</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Items highlighted in amber/red are below minimum safety threshold.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground border-b border-border">
                <tr>
                  <th className="pb-2 font-medium">Item Code & Name</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium">Unit</th>
                  <th className="pb-2 font-medium">Unit Cost</th>
                  <th className="pb-2 font-medium">Available Quantity</th>
                  <th className="pb-2 font-medium">Stock Status</th>
                  <th className="pb-2 font-medium text-right">Quick Stock In/Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {items.map((item) => {
                  const isLow = item.stock_quantity <= item.min_alert;
                  return (
                    <tr key={item.id} className="hover:bg-muted/50">
                      <td className="py-3 font-semibold text-foreground">
                        {item.name}
                        <span className="block text-[10px] font-mono text-indigo-400">{item.code}</span>
                      </td>
                      <td className="py-3 text-muted-foreground">{item.category}</td>
                      <td className="py-3 text-muted-foreground font-mono">{item.unit}</td>
                      <td className="py-3 font-medium text-foreground">{formatCurrency(item.unit_price)}</td>
                      <td className="py-3">
                        <span className={`font-bold font-mono text-sm ${isLow ? "text-amber-400" : "text-emerald-400"}`}>
                          {item.stock_quantity}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1">/ Min {item.min_alert}</span>
                      </td>
                      <td className="py-3">
                        <Badge variant={isLow ? "warning" : "success"} className="text-[10px]">
                          {isLow ? "Low Stock Alert" : "In Stock"}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px] border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 gap-1"
                            onClick={() => handleOpenStockAdjust(item, "IN")}
                          >
                            <ArrowDownLeft className="h-3 w-3" /> Stock In
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-1"
                            onClick={() => handleOpenStockAdjust(item, "OUT")}
                          >
                            <ArrowUpRight className="h-3 w-3" /> Dispatch
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

      {/* Stock In/Out Modal */}
      <Dialog open={stockModalOpen} onOpenChange={setStockModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-indigo-400" />
              {stockType === "IN" ? "Stock In / Purchase" : "Dispatch to Subscriber / Field Tech"}
            </DialogTitle>
            <DialogDescription>{selectedItem?.name}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleStockSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Quantity to {stockType === "IN" ? "Add to Warehouse" : "Dispatch"} ({selectedItem?.unit})
              </label>
              <Input
                type="number"
                required
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {stockType === "IN" ? "Supplier Name / Purchase Invoice #" : "Field Lineman / Subscriber Reference"}
              </label>
              <Input
                required
                placeholder={stockType === "IN" ? "e.g. FiberTech Ltd. / PO-882" : "e.g. Dispatched to Tanvir (SB-1001)"}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setStockModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className={stockType === "IN" ? "bg-emerald-600 hover:bg-emerald-700 text-foreground" : "bg-indigo-600 hover:bg-indigo-700 text-white"}
              >
                Confirm Stock Movement
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
