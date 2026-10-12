/**
 * Native (non-TanStack) data-fetching primitives for the Shebafi frontend.
 *
 * Why this exists
 * ---------------
 * The app used to depend on `@tanstack/react-query` for client-side fetching.
 * After the move to Next.js 16 + React 19 we removed that dependency; pages
 * either (a) are React Server Components that fetch directly, or (b) use
 * these hooks to keep the same call shape.
 *
 * Behavioural contract
 * --------------------
 * The exports below intentionally mirror the small subset of the
 * TanStack Query API that the codebase actually uses. They are not a
 * general-purpose replacement. New code should prefer RSC + Server Actions.
 *
 *  - `useQuery({ queryKey, queryFn, placeholderData, enabled, staleTime })`
 *      returns `{ data, error, isLoading, isFetching, refetch }`.
 *  - `useMutation({ mutationFn, onSuccess, onError, onMutate })`
 *      returns `{ mutate, mutateAsync, isPending, data, error }`.
 *  - `useQueryClient()` exposes `invalidateQueries`, `resetQueries`,
 *      `removeQueries`, `clear`, `getQueryData`, `setQueryData`.
 *  - `<QueryClientProvider />` is a no-op (we no longer have a global cache).
 *  - `createQueryClient()` returns an empty client (kept for source-compat).
 *
 * Caching
 * -------
 * There is no shared cache. Each `useQuery` instance runs its own effect.
 * `invalidateQueries` is wired to trigger a Next.js `router.refresh()` so
 * RSC pages re-render and re-fetch their data.
 */
'use client';

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

/* ── Client + context ──────────────────────────────────────────────────── */

export interface QueryClientLike {
    invalidateQueries: (filter?: { queryKey?: unknown }) => Promise<void>;
    resetQueries: (filter?: { queryKey?: unknown }) => Promise<void>;
    removeQueries: (filter?: { queryKey?: unknown }) => void;
    clear: () => void;
    getQueryData: <T = unknown>(queryKey: unknown) => T | undefined;
    setQueryData: <T = unknown>(queryKey: unknown, updater: T | ((prev: T | undefined) => T)) => void;
}

/**
 * Class-shaped stub kept for source-compatibility with code that used to do
 * `new QueryClient({ defaultOptions: ... })`. The native shim has no global
 * cache, so all options are ignored.
 */
export class QueryClient {
    constructor(_opts?: unknown) {}
    invalidateQueries = NOOP_CLIENT.invalidateQueries;
    resetQueries = NOOP_CLIENT.resetQueries;
    removeQueries = NOOP_CLIENT.removeQueries;
    clear = NOOP_CLIENT.clear;
    getQueryData = NOOP_CLIENT.getQueryData;
    setQueryData = NOOP_CLIENT.setQueryData;
}

const NOOP_CLIENT: QueryClientLike = {
    invalidateQueries: async () => {},
    resetQueries: async () => {},
    removeQueries: () => {},
    clear: () => {},
    getQueryData: () => undefined,
    setQueryData: () => {},
};

const QueryClientContext = createContext<QueryClientLike | null>(null);

export function createQueryClient(): QueryClientLike {
    return NOOP_CLIENT;
}

export function QueryClientProvider({ children }: { children: ReactNode; client?: QueryClientLike }) {
    return <QueryClientContext.Provider value={NOOP_CLIENT}>{children}</QueryClientContext.Provider>;
}

export function useQueryClient(): QueryClientLike {
    const ctx = useContext(QueryClientContext);
    return ctx ?? NOOP_CLIENT;
}

/* ── Query keys ────────────────────────────────────────────────────────── */

export type QueryKey = readonly unknown[];

function keyToString(key: QueryKey | undefined): string {
    if (!key) return '';
    try {
        return JSON.stringify(key, (_k, v) => (typeof v === 'function' ? '[fn]' : v));
    } catch {
        return String(Date.now());
    }
}

/* ── useQuery ──────────────────────────────────────────────────────────── */

export interface UseQueryOptions<TData, TError = Error> {
    queryKey: QueryKey;
    queryFn: () => Promise<TData>;
    enabled?: boolean;
    staleTime?: number;
    placeholderData?: (previous: TData | undefined) => TData | undefined;
    retry?: boolean | number;
    refetchOnWindowFocus?: boolean;
    onSuccess?: (data: TData) => void;
    onError?: (err: TError) => void;
}

export interface UseQueryResult<TData, TError = Error> {
    data: TData | undefined;
    error: TError | null;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    isSuccess: boolean;
    refetch: () => Promise<void>;
}

export function useQuery<TData = unknown, TError = Error>(
    options: UseQueryOptions<TData, TError>,
): UseQueryResult<TData, TError> {
    const { queryKey, queryFn, enabled = true, placeholderData, onSuccess, onError } = options;
    const keyStr = useMemo(() => keyToString(queryKey), [queryKey]);

    const [data, setData] = useState<TData | undefined>(() => placeholderData?.(undefined));
    const [error, setError] = useState<TError | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(enabled && data === undefined);
    const [isFetching, setIsFetching] = useState<boolean>(false);
    const isMounted = useRef(true);
    const inflight = useRef<Promise<unknown> | null>(null);
    const onSuccessRef = useRef(onSuccess);
    const onErrorRef = useRef(onError);
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;

    const run = useCallback(async () => {
        if (!enabled) return;
        setIsFetching(true);
        try {
            const result = await queryFn();
            if (!isMounted.current) return;
            setData(result as TData);
            setError(null);
            setIsLoading(false);
            onSuccessRef.current?.(result as TData);
        } catch (err) {
            if (!isMounted.current) return;
            setError(err as TError);
            setIsLoading(false);
            onErrorRef.current?.(err as TError);
        } finally {
            if (isMounted.current) setIsFetching(false);
        }
    }, [enabled, queryFn]);

    useEffect(() => {
        isMounted.current = true;
        if (!enabled) {
            setIsLoading(false);
            return;
        }
        inflight.current = run();
        let timer: ReturnType<typeof setInterval> | null = null;
        if (typeof refetchInterval === 'number' && refetchInterval > 0) {
            timer = setInterval(() => {
                run();
            }, refetchInterval);
        }
        return () => {
            isMounted.current = false;
            if (timer) clearInterval(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keyStr, enabled, refetchInterval]);

    const refetch = useCallback(async () => {
        await run();
    }, [run]);

    return {
        data,
        error,
        isLoading,
        isFetching,
        isError: error !== null,
        isSuccess: error === null && data !== undefined,
        refetch,
    };
}

/* ── useMutation ───────────────────────────────────────────────────────── */

export interface UseMutationOptions<TData, TError, TVariables, TContext = unknown> {
    /**
     * Optional. Callbacks-only mutation options (used by `withMutationToast`)
     * are valid in the native shim; they are typically spread into a real
     * `useMutation({ mutationFn, ...callbacks })` call.
     */
    mutationFn?: (variables: TVariables) => Promise<TData>;
    /**
     * TanStack-compatible signature: (data, variables, onMutateResult, context).
     * `onMutateResult` is the optimistic-update return value.
     */
    onSuccess?: (data: TData, variables: TVariables, onMutateResult: unknown, context: TContext | undefined) => void;
    onError?: (err: TError, variables: TVariables, onMutateResult: unknown, context: TContext | undefined) => void;
    onMutate?: (variables: TVariables) => Promise<TContext> | TContext | void;
    onSettled?: (data: TData | undefined, err: TError | null, variables: TVariables) => void;
}

export interface UseMutationResult<TData, TError, TVariables> {
    mutate: (variables: TVariables) => void;
    mutateAsync: (variables: TVariables) => Promise<TData>;
    isPending: boolean;
    isError: boolean;
    isSuccess: boolean;
    data: TData | undefined;
    error: TError | null;
    reset: () => void;
}

export function useMutation<TData = unknown, TError = Error, TVariables = void, TContext = unknown>(
    options: UseMutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables> {
    const { mutationFn, onSuccess, onError, onMutate, onSettled } = options;
    const [data, setData] = useState<TData | undefined>(undefined);
    const [error, setError] = useState<TError | null>(null);
    const [isPending, setIsPending] = useState(false);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const run = useCallback(
        async (variables: TVariables) => {
            setIsPending(true);
            let context: unknown;
            try {
                if (onMutate) context = await onMutate(variables);
                if (!mutationFn) {
                    throw new Error('useMutation: mutationFn is required');
                }
                const result = await mutationFn(variables);
                if (!isMounted.current) return result;
                setData(result);
                setError(null);
                onSuccess?.(result, variables, context, context as TContext | undefined);
                onSettled?.(result, null, variables);
                return result;
            } catch (err) {
                if (!isMounted.current) throw err;
                setError(err as TError);
                onError?.(err as TError, variables, context, context as TContext | undefined);
                onSettled?.(undefined, err as TError, variables);
                throw err;
            } finally {
                if (isMounted.current) setIsPending(false);
            }
        },
        [mutationFn, onMutate, onError, onSuccess, onSettled],
    );

    const mutateAsync = useCallback(
        (variables?: TVariables, opts?: { onSuccess?: () => void; onError?: (e: TError) => void }) =>
            run(variables as TVariables).then(
                result => {
                    opts?.onSuccess?.();
                    return result;
                },
                err => {
                    opts?.onError?.(err as TError);
                    throw err;
                },
            ),
        [run],
    );
    const mutate = useCallback(
        (variables?: TVariables, opts?: { onSuccess?: () => void; onError?: (e: TError) => void }) => {
            run(variables as TVariables)
                .then(result => {
                    opts?.onSuccess?.();
                    return result;
                })
                .catch(err => {
                    opts?.onError?.(err as TError);
                    /* swallow — surfaced via `error` */
                });
        },
        [run],
    );

    const reset = useCallback(() => {
        setData(undefined);
        setError(null);
        setIsPending(false);
    }, []);

    return {
        mutate,
        mutateAsync,
        isPending,
        isError: error !== null,
        isSuccess: data !== undefined && error === null,
        data,
        error,
        reset,
    };
}

/* ── Re-exports used by the codebase ────────────────────────────────────── */

export function useIsFetching(): number {
    // The native shim does not maintain a shared cache. The dashboards only
    // use this for diagnostics, so returning 0 is correct in the steady
    // state (every fetch is local to a hook instance).
    return 0;
}

/* ── useQueryClient with router refresh (invalidateQueries triggers RSC refresh) ── */

export function useRouterRefreshClient(): QueryClientLike {
    const router = useRouter();
    return useMemo<QueryClientLike>(
        () => ({
            invalidateQueries: async () => {
                try {
                    router.refresh();
                } catch {
                    /* ignore */
                }
            },
            resetQueries: async () => {
                try {
                    router.refresh();
                } catch {
                    /* ignore */
                }
            },
            removeQueries: () => {},
            clear: () => {
                try {
                    router.refresh();
                } catch {
                    /* ignore */
                }
            },
            getQueryData: () => undefined,
            setQueryData: () => {},
        }),
        [router],
    );
}
