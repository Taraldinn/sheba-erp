"use client";

import { useState } from "react";
import { Tag, Plus, CheckCircle2, Clock, Percent, Calendar, Sparkles, Gift } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const initialOffers = [
  {
    id: "off-1",
    title: "Eid Ul Fitr Mega Speed Double",
    code: "EID_DOUBLE_2026",
    discount: "Double Bandwidth",
    valid_till: "2026-10-15",
    subscribers: 420,
    status: "Active",
    description: "Upgrade from 15Mbps to 30Mbps at same price for 3 months.",
  },
  {
    id: "off-2",
    title: "Annual Advance 15% Cashback",
    code: "YEARLY_SAVER",
    discount: "15% Off Total",
    valid_till: "2026-12-31",
    subscribers: 180,
    status: "Active",
    description: "Pay 12 months advance and receive 1.8 months free broadband.",
  },
  {
    id: "off-3",
    title: "New Optical ONU Zero Install Fee",
    code: "FREE_FIBER_ONU",
    discount: "৳1,500 Waived",
    valid_till: "2026-09-30",
    subscribers: 85,
    status: "Expiring Soon",
    description: "Zero installation and fiber drop wire fee for corporate and residential subscribers.",
  },
];

export default function OffersPage() {
  const [offers] = useState(initialOffers);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Tag className="h-6 w-6 text-indigo-500" />
            Offer & Promotion Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create seasonal discounts, coupon codes, and promotional broadband booster plans.
          </p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
          <Plus className="h-4 w-4" />
          Create New Promotion
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {offers.map((offer) => (
          <Card key={offer.id} className="border-border bg-card shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
            <div className="absolute top-0 right-0 transform translate-x-6 -translate-y-6 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant={offer.status === "Active" ? "default" : "outline"}>
                  {offer.status}
                </Badge>
                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground font-semibold">
                  {offer.code}
                </span>
              </div>
              <CardTitle className="text-base font-bold text-foreground mt-2">
                {offer.title}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                {offer.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 text-xs">
              <div className="p-3 bg-muted/40 rounded-lg flex items-center justify-between">
                <span className="text-muted-foreground">Benefit:</span>
                <span className="font-bold text-indigo-500">{offer.discount}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Valid till {offer.valid_till}
                </span>
                <span className="font-medium text-foreground">{offer.subscribers} claims</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
