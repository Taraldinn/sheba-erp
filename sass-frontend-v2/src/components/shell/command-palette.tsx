'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  CreditCard,
  FileText,
  LifeBuoy,
  Network,
  Palette,
  PlusCircle,
  Radio,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  SunMoon,
  Users,
  Zap,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useThemePreset } from '@/hooks/use-theme-preset';
import { cn } from 'cn';

interface CommandItem {
  id: string;
  title: string;
  category: 'Navigation' | 'Actions' | 'Preferences';
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  perform: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { preset, setPreset, density, setDensity } = useThemePreset();
  const [query, setQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  // Global keyboard listener for Cmd+K / Ctrl+K
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  const runAndClose = React.useCallback(
    (action: () => void) => {
      onOpenChange(false);
      action();
    },
    [onOpenChange]
  );

  const items: CommandItem[] = React.useMemo(
    () => [
      // Navigation
      {
        id: 'nav-customers',
        title: 'Clients & Subscribers',
        category: 'Navigation',
        icon: Users,
        shortcut: 'G C',
        perform: () => router.push('/tenant/customers' as never),
      },
      {
        id: 'nav-routers',
        title: 'MikroTik Routers & Bandwidth',
        category: 'Navigation',
        icon: Server,
        shortcut: 'G R',
        perform: () => router.push('/tenant/routers' as never),
      },
      {
        id: 'nav-invoices',
        title: 'Invoices & Billing Accounts',
        category: 'Navigation',
        icon: FileText,
        shortcut: 'G I',
        perform: () => router.push('/tenant/invoices' as never),
      },
      {
        id: 'nav-subscriptions',
        title: 'Active Subscriptions & Packages',
        category: 'Navigation',
        icon: CreditCard,
        perform: () => router.push('/tenant/subscriptions' as never),
      },
      {
        id: 'nav-olts',
        title: 'OLT & PON Terminals',
        category: 'Navigation',
        icon: Radio,
        perform: () => router.push('/tenant/olts' as never),
      },
      {
        id: 'nav-topology',
        title: 'Network Topology Map',
        category: 'Navigation',
        icon: Network,
        perform: () => router.push('/tenant/topology' as never),
      },
      {
        id: 'nav-tickets',
        title: 'Support & Help Desk Tickets',
        category: 'Navigation',
        icon: LifeBuoy,
        perform: () => router.push('/tenant/tickets' as never),
      },
      {
        id: 'nav-settings',
        title: 'Workspace Settings & Modules',
        category: 'Navigation',
        icon: Settings,
        perform: () => router.push('/tenant/settings' as never),
      },

      // Actions
      {
        id: 'act-add-customer',
        title: 'Add New Client / Subscriber',
        category: 'Actions',
        icon: PlusCircle,
        shortcut: 'N C',
        perform: () => router.push('/tenant/customers/new' as never),
      },
      {
        id: 'act-quick-payment',
        title: 'Record Subscriber Payment',
        category: 'Actions',
        icon: Zap,
        perform: () => router.push('/tenant/payments' as never),
      },
      {
        id: 'act-sync-routers',
        title: 'Synchronize MikroTik Active Leases',
        category: 'Actions',
        icon: RefreshCw,
        perform: () => router.push('/tenant/routers' as never),
      },

      // Preferences
      {
        id: 'pref-theme-signal',
        title: 'Switch to Signal Ops (Amber) Theme',
        category: 'Preferences',
        icon: Palette,
        perform: () => setPreset('signal'),
      },
      {
        id: 'pref-theme-indigo',
        title: 'Switch to Modern SaaS (Indigo) Theme',
        category: 'Preferences',
        icon: Palette,
        perform: () => setPreset('indigo'),
      },
      {
        id: 'pref-density-compact',
        title: 'Toggle Display Density: Compact Mode',
        category: 'Preferences',
        icon: Shield,
        perform: () => setDensity(density === 'compact' ? 'comfortable' : 'compact'),
      },
      {
        id: 'pref-mode-toggle',
        title: `Toggle Dark / Light Mode (Current: ${theme})`,
        category: 'Preferences',
        icon: SunMoon,
        perform: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
    ],
    [router, setPreset, setDensity, density, theme, setTheme]
  );

  const filteredItems = React.useMemo(() => {
    if (!query.trim()) return items;
    const lower = query.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower)
    );
  }, [items, query]);

  // Reset selected index when query changes
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        runAndClose(filteredItems[selectedIndex].perform);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[25%] p-0 overflow-hidden max-w-xl border-border bg-card shadow-2xl rounded-xl"
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search (e.g. clients, routers, theme)..."
            className="h-7 border-0 bg-transparent p-0 text-sm focus-visible:ring-0 focus-visible:outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-[340px] overflow-y-auto p-2" tabIndex={-1}>
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No matching commands or routes found for &quot;{query}&quot;.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredItems.map((item, index) => {
                const Icon = item.icon;
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => runAndClose(item.perform)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
                      isSelected
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-foreground hover:bg-muted/60'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-md border',
                          isSelected
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border bg-muted/30 text-muted-foreground'
                        )}
                      >
                        <Icon className="size-3.5" />
                      </div>
                      <span className="truncate">{item.title}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {item.category}
                      </span>
                      {item.shortcut && (
                        <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {item.shortcut}
                        </kbd>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/20 px-3.5 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="font-mono">↵</kbd> select
            </span>
          </div>
          <span className="font-mono text-[10px]">Shebafi Universal Shell</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
