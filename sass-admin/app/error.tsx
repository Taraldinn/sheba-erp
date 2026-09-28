"use client";

import { useEffect } from "react";
import { Button, Card } from "@heroui/react";

import { siteConfig } from "@/config/site";

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin error boundary]", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <Card className="w-full max-w-md border border-separator bg-surface">
        <Card.Header className="border-b border-separator">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
        </Card.Header>
        <Card.Content className="space-y-3 p-6 text-sm text-muted">
          <p>
            {siteConfig.name} hit an unexpected error rendering this page.
          </p>
          <pre className="overflow-auto rounded-md bg-surface-secondary p-3 text-xs text-foreground">
            {error.message}
          </pre>
          <Button variant="primary" onPress={() => reset()}>
            Try again
          </Button>
        </Card.Content>
      </Card>
    </main>
  );
}
