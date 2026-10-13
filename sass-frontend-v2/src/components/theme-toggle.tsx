'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';

export function ThemeToggle({ className }: { className?: string }) {
    const { resolvedTheme, setTheme } = useTheme();
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('size-8 text-muted-foreground hover:text-foreground', className)}
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
            <Sun className="size-4 dark:hidden" aria-hidden="true" />
            <Moon className="hidden size-4 dark:block" aria-hidden="true" />
            <span className="sr-only">Toggle color theme</span>
        </Button>
    );
}
