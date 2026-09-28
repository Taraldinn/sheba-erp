"use client";

import { Suspense } from "react";
import { Card } from "@heroui/react";

import { LoginForm } from "@/components/login-form";
import { siteConfig } from "@/config/site";

export function LoginCard() {
  return (
    <Card className="w-full max-w-md border border-separator bg-surface rounded-2xl shadow-xl">
      <Card.Header className="flex flex-col items-center gap-2 border-b border-separator pb-6 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-accent-foreground text-lg font-bold shadow-md">
          S
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          {siteConfig.name}
        </h1>
        <p className="text-xs text-muted">
          Sign in with your platform administrator account.
        </p>
      </Card.Header>
      <Card.Content className="p-6">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </Card.Content>
      <Card.Footer className="border-t border-separator p-4 text-center text-xs text-muted">
        Restricted to platform administrators. ISP tenant staff should use their
        own portal.
      </Card.Footer>
    </Card>
  );
}
