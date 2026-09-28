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

export function AdminCard({ title, description, actions, children, className }: Props) {
  return (
    <Card className={cn("border border-separator bg-surface", className)}>
      {(title || description || actions) && (
        <Card.Header className="flex flex-col gap-1 border-b border-separator sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {description ? (
              <p className="text-xs text-muted">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </Card.Header>
      )}
      <Card.Content className="p-4">{children}</Card.Content>
    </Card>
  );
}
