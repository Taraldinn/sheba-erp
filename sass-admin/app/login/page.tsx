import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@heroui/react";

import { LoginForm } from "@/components/login-form";
import { siteConfig } from "@/config/site";
import { SESSION_COOKIE_NAME, SESSION_STORAGE_KEY, serverMe } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(SESSION_COOKIE_NAME)?.value ??
    cookieStore.get(SESSION_STORAGE_KEY)?.value ??
    null;
  if (token) {
    const user = await serverMe(token);
    if (user) redirect("/overview");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <Card className="w-full max-w-md border border-separator bg-surface">
        <Card.Header className="flex flex-col items-center gap-2 border-b border-separator pb-6 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-accent-foreground text-lg font-bold">
            S
          </div>
          <h1 className="text-xl font-semibold">{siteConfig.name}</h1>
          <p className="text-sm text-muted">
            Sign in with your platform administrator account.
          </p>
        </Card.Header>
        <Card.Content className="p-6">
          <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
            <LoginForm />
          </Suspense>
        </Card.Content>
        <Card.Footer className="border-t border-separator p-4 text-center text-xs text-muted">
          Restricted to platform administrators. ISP tenant staff should use
          their own portal.
        </Card.Footer>
      </Card>
    </main>
  );
}
