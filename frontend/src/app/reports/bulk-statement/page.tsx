"use client";

import { FileSpreadsheet, Download, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function BulkStatementPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-indigo-500" />
            Bulk Statement & Ledger Generation
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Generate printable customer billing ledgers, reseller commission sheets, and accounting journal entries in bulk.
          </p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
          <Download className="h-4 w-4" /> Generate Bulk PDF/Excel
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base font-bold">Filter Statement Batch Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-muted-foreground mb-1 font-medium">Branch / POP</label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-foreground">
                <option>All POP Branches</option>
                <option>Uttara Sector 10 Central POP</option>
                <option>Mirpur 10 NOC & Sub-POP</option>
              </select>
            </div>
            <div>
              <label className="block text-muted-foreground mb-1 font-medium">Billing Period</label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-foreground">
                <option>September 2026</option>
                <option>August 2026</option>
                <option>July 2026</option>
              </select>
            </div>
            <div>
              <label className="block text-muted-foreground mb-1 font-medium">Client Category</label>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-foreground">
                <option>All Subscribers (Active + Due)</option>
                <option>Due Subscribers Only</option>
                <option>Reseller Agents Only</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
