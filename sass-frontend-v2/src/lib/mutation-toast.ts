import { toast } from 'sonner';
import type { UseMutationOptions } from '@/lib/query/native';

/**
 * Wraps a TanStack Query mutation so success / error are surfaced as a
 * sonner toast. The original onSuccess / onError callbacks are still
 * invoked so callers can chain invalidations.
 */
export function withMutationToast<TData, TError, TVariables, TContext>(
    opts: UseMutationOptions<TData, TError, TVariables, TContext>,
    messages: { success?: string | ((data: TData, vars: TVariables) => string); error?: string | ((err: TError) => string) } = {},
): UseMutationOptions<TData, TError, TVariables, TContext> {
    const originalOnSuccess = opts.onSuccess;
    const originalOnError = opts.onError;
    return {
        ...opts,
        onSuccess: ((data, vars, onMutateResult, context) => {
            const msg = typeof messages.success === 'function' ? messages.success(data, vars) : messages.success;
            if (msg) toast.success(msg);
            originalOnSuccess?.(data, vars, onMutateResult, context);
        }) as UseMutationOptions<TData, TError, TVariables, TContext>['onSuccess'],
        onError: ((err, vars, onMutateResult, context) => {
            const msg = typeof messages.error === 'function' ? messages.error(err) : (messages.error ?? friendlyError(err));
            toast.error(msg);
            originalOnError?.(err, vars, onMutateResult, context);
        }) as UseMutationOptions<TData, TError, TVariables, TContext>['onError'],
    };
}

export function friendlyError(err: unknown): string {
    if (!err) return 'Something went wrong';
    const e = err as { message?: string; status?: number; data?: { detail?: string; message?: string } };
    if (e.data?.detail) return e.data.detail;
    if (e.data?.message) return e.data.message;
    if (e.message) return e.message;
    if (e.status === 409) return 'Conflict — this record already exists or is being modified.';
    if (e.status === 422) return 'Validation failed — please check the form fields.';
    if (e.status === 429) return 'Too many requests — please try again in a moment.';
    if (e.status && e.status >= 500) return 'Server error — please try again or contact support.';
    return 'Something went wrong';
}
