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
      color: 'bg-emerald-500 hover:bg-emerald-600 text-white',
      onClick: () => {
        setIsOpen(false);
        router.push('/tenant/payments' as never);
      },
    },
    {
      label: 'Add Client',
      icon: UserPlus,
      color: 'bg-primary hover:bg-primary/90 text-primary-foreground',
      onClick: () => {
        setIsOpen(false);
        router.push('/tenant/customers/new' as never);
      },
    },
    {
      label: 'Ping Router',
      icon: Server,
      color: 'bg-amber-500 hover:bg-amber-600 text-white',
      onClick: () => {
        setIsOpen(false);
        router.push('/tenant/routers' as never);
      },
    },
    {
      label: 'New Ticket',
      icon: LifeBuoy,
      color: 'bg-indigo-500 hover:bg-indigo-600 text-white',
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
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px] animate-in fade-in-0 duration-150"
          onClick={() => setIsOpen(false)}
        />
      )}

      {isOpen && (
        <div className="relative z-40 flex flex-col items-end gap-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-150">
          {actions.map((act) => {
            const Icon = act.icon;
            return (
              <div key={act.label} className="flex items-center gap-2">
                <span className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-[11px] font-medium text-foreground shadow-sm">
                  {act.label}
                </span>
                <Button
                  size="icon"
                  onClick={act.onClick}
                  className={cn('size-10 rounded-full shadow-md transition-transform hover:scale-105', act.color)}
                >
                  <Icon className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Quick Actions Hub"
              className={cn(
                'relative z-40 size-12 rounded-full shadow-lg transition-transform duration-200',
                isOpen ? 'bg-muted-foreground text-card rotate-45' : 'bg-primary text-primary-foreground hover:scale-105'
              )}
            >
              <Plus className="size-6 transition-transform" />
            </Button>
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
