import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export interface ErrorBoundaryProps {
    children: ReactNode;
    /** Custom fallback. Defaults to the global one below. */
    fallback?: (error: Error, reset: () => void) => ReactNode;
    /** A label for the boundary in the dev console. */
    label?: string;
}

interface ErrorBoundaryState {
    error: Error | null;
}

/**
 * React error boundary.
 *
 * - Shows a non-scary global fallback (icon + short message + "Try
 *   again" button) when a child throws during render.
 * - Re-throws in development so the Vite overlay still catches
 *   framework errors.
 * - Calls `console.error` with a labelled group so the source
 *   component is easy to find in DevTools.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        const label = this.props.label ?? 'ErrorBoundary';
        // eslint-disable-next-line no-console
        console.error(`[${label}] caught an error:`, error, info?.componentStack);
    }

    reset = (): void => {
        this.setState({ error: null });
    };

    render(): ReactNode {
        const { error } = this.state;
        if (error) {
            if (this.props.fallback) return this.props.fallback(error, this.reset);
            return <GlobalErrorFallback error={error} onReset={this.reset} />;
        }
        return this.props.children;
    }
}

export function GlobalErrorFallback({ error, onReset }: { error: Error; onReset: () => void }) {
    return (
        <div className="container mx-auto flex min-h-[60vh] max-w-xl items-center justify-center px-6 py-12">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <AlertTriangle className="size-4 text-destructive" />
                        Something went wrong
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>
                        The page hit an unexpected error and we couldn’t recover automatically. Your
                        unsaved work isn’t affected, but you should refresh or go back home.
                    </p>
                    <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">
                        {error.message}
                    </pre>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={onReset}>Try again</Button>
                        <Button variant="outline" onClick={() => (window.location.href = '/')}>
                            Go to home
                        </Button>
                        <Button variant="ghost" onClick={() => window.location.reload()}>
                            Refresh
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
