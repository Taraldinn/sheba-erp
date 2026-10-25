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
        id: 'nav-customers-promise',
        title: 'Promise Clients',
        category: 'Navigation',
        icon: Users,
        perform: () => router.push('/tenant/customers?is_promise=true' as never),
      },
      {
        id: 'nav-customers-free',
        title: 'Free Clients (Complimentary)',
        category: 'Navigation',
        icon: Users,
        perform: () => router.push('/tenant/customers?billing_type=Free' as never),
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
        className="top-[25%] p-0 overflow-hidden max-w-xl border border-border/80 bg-card/90 backdrop-blur-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.4)] rounded-lg luxury-sheen"
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 bg-muted/10">
          <Search className="size-4 shrink-0 text-muted-foreground/80" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="h-7 border-0 bg-transparent p-0 text-sm tracking-tight focus-visible:ring-0 focus-visible:outline-none placeholder:text-muted-foreground/60"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded-sm border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-[340px] overflow-y-auto p-2" tabIndex={-1}>
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground font-normal">
              No matching commands found for &quot;{query}&quot;.
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
                      'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs transition-all duration-150',
                      isSelected
                        ? 'bg-accent/70 text-foreground font-medium shadow-xs border border-primary/20'
                        : 'text-foreground/90 hover:bg-muted/40 border border-transparent'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-sm border transition-colors',
                          isSelected
                            ? 'border-primary/50 bg-primary/15 text-primary'
                            : 'border-border/60 bg-muted/20 text-muted-foreground'
                        )}
                      >
                        <Icon className="size-3.5" />
                      </div>
                      <span className="truncate tracking-tight font-medium">{item.title}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground/80">
                        {item.category}
                      </span>
                      {item.shortcut && (
                        <kbd className="rounded-sm border border-border/60 bg-muted/40 px-1 py-0.5 font-mono text-xs text-muted-foreground">
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

        <div className="flex items-center justify-between border-t border-border/50 bg-muted/15 px-4 py-2.5 text-xs text-muted-foreground/80">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono text-xs bg-muted/50 px-1.5 py-0.5 rounded-sm border border-border/40">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="font-mono text-xs bg-muted/50 px-1.5 py-0.5 rounded-sm border border-border/40">↵</kbd> select
            </span>
          </div>
          <span className="font-mono text-xs text-muted-foreground/60 tracking-wider">SHEBAFI COMMAND</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
