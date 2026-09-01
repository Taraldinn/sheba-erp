"use client";

import { ShieldCheck, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function SalaryPoliciesPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-indigo-500" />
            Salary Structures & Allowance Policies
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Grade pay, festival bonus formulas, optical field allowance, and overtime multiplier rules.
          </p>
        </div>
        <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20">
          <Plus className="h-4 w-4" /> Create Policy Rule
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[
          { title: "NOC Lead Engineer Grade A", basic: "60% of Gross", house: "30%", medical: "10%", bonus: "100% Basic on 2 Eids", allowance: "Night Shift ৳500/night" },
          { title: "Field Support Technician Grade C", basic: "55% of Gross", house: "30%", medical: "15%", bonus: "100% Basic on 2 Eids", allowance: "Optical Splicing ৳100/joint" },
        ].map((p, i) => (
          <Card key={i} className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold">{p.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs text-muted-foreground">
              <p><span className="font-semibold text-foreground">Basic Pay:</span> {p.basic}</p>
              <p><span className="font-semibold text-foreground">House Rent:</span> {p.house}</p>
              <p><span className="font-semibold text-foreground">Medical Allowance:</span> {p.medical}</p>
              <p><span className="font-semibold text-foreground">Festival Bonus:</span> {p.bonus}</p>
              <p className="text-indigo-500 pt-1 font-medium">{p.allowance}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
