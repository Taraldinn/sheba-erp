'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  LifeBuoy,
  Plus,
  Radio,
  Server,
  UserPlus,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from 'cn';

export function QuickActionHub() {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);

  const actions = [
    {
      label: 'Quick Pay',
      icon: Zap,
      iconColor: 'text-emerald-400',
      tagColor: 'hover:border-emerald-500/40 hover:bg-emerald-500/10',
      onClick: () => {
        setIsOpen(false);
        router.push('/tenant/payments' as never);
      },
    },
    {
      label: 'Add Client',
      icon: UserPlus,
      iconColor: 'text-primary',
      tagColor: 'hover:border-primary/40 hover:bg-primary/10',
      onClick: () => {
        setIsOpen(false);
        router.push('/tenant/customers/new' as never);
      },
    },
    {
      label: 'Ping Router',
      icon: Server,
      iconColor: 'text-amber-400',
      tagColor: 'hover:border-amber-500/40 hover:bg-amber-500/10',
      onClick: () => {
        setIsOpen(false);
        router.push('/tenant/routers' as never);
      },
    },
    {
      label: 'New Ticket',
      icon: LifeBuoy,
      iconColor: 'text-indigo-400',
      tagColor: 'hover:border-indigo-500/40 hover:bg-indigo-500/10',
      onClick: () => {
        setIsOpen(false);
        router.push('/tenant/tickets' as never);
      },
    },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2.5">
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-xs animate-in fade-in-0 duration-150"
          onClick={() => setIsOpen(false)}
        />
      )}

      {isOpen && (
        <div className="relative z-40 flex flex-col items-end gap-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-150">
          {actions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.label}
                type="button"
                onClick={act.onClick}
                className={cn(
                  'group flex items-center gap-2.5 rounded-full border border-border/80 bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur-xl transition-all duration-150 hover:scale-[1.02] focus:outline-none focus:ring-1 focus:ring-ring',
                  act.tagColor
                )}
              >
                <span className="font-mono text-xs font-medium text-foreground tracking-tight">
                  {act.label}
                </span>
                <div className="flex size-6 items-center justify-center rounded-full bg-muted/40 border border-border/50">
                  <Icon className={cn('size-3.5', act.iconColor)} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Quick Actions Hub"
              className={cn(
                'relative z-40 flex size-11 items-center justify-center rounded-full border border-border/80 bg-card/85 text-foreground backdrop-blur-xl shadow-[0_8px_30px_rgb(0_0_0/0.12)] transition-all duration-200 hover:scale-105 hover:border-primary/50 hover:shadow-[0_0_24px_-4px_var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isOpen && 'rotate-45 bg-muted text-muted-foreground border-border'
              )}
            >
              <Plus className="size-5 transition-transform" />
            </button>
          </TooltipTrigger>
          {!isOpen && (
            <TooltipContent side="left" className="font-mono text-xs">
              Quick Actions (⚡)
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
