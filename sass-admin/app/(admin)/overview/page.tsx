import { requireSaasAdmin } from "@/components/admin-auth-guard";
import { OverviewClient } from "@/components/overview-client";

export const metadata = { title: "Control Plane Overview" };

export default async function OverviewPage() {
  const user = await requireSaasAdmin("/overview");

  return <OverviewClient user={user} />;
}
