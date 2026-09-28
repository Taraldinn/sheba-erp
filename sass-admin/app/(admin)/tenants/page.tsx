import { Suspense } from "react";
import { TenantManagerView } from "@/components/tenants/tenant-manager-view";

export const metadata = {
  title: "Tenants Management",
  description: "Comprehensive multi-tenant control plane management.",
};

export default function TenantsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-xs text-muted">
          Loading tenant manager…
        </div>
      }
    >
      <TenantManagerView />
    </Suspense>
  );
}
