"use client";

import type { ReactNode } from "react";

import { Card } from "@heroui/react";

import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AdminCard({
  title,
  description,
  actions,
  children,
  className,
}: Props) {
  return (
    <Card
      className={cn(
        "rounded-2xl border border-separator/80 bg-surface shadow-xs overflow-hidden",
        className,
      )}
    >
      {(title || description || actions) && (
        <Card.Header className="flex flex-col gap-2 border-b border-separator/70 p-5 sm:flex-row sm:items-center sm:justify-between bg-surface">
          <div className="flex flex-col gap-0.5">
            {title ? (
              <h2 className="text-base font-bold text-foreground">{title}</h2>
            ) : null}
            {description ? (
              <p className="text-xs text-muted font-medium">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </Card.Header>
      )}
      <Card.Content className="p-5">{children}</Card.Content>
    </Card>
  );
}
