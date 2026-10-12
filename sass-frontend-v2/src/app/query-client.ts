import { QueryClient } from '@/lib/query/native';
import { ApiError } from '../lib/errors';

const DEFAULT_STALE_TIME = 30_000;

function shouldRetry(failureCount: number, error: unknown): boolean {
    if (error instanceof ApiError) {
        if (error.isAuthError() || error.isForbidden() || error.isNotFound() || error.isValidation()) {
            return false;
        }
        if (error.isRateLimited()) return false;
        if (error.isIdempotencyConflict()) return false;
    }
    return failureCount < 2;
}

export function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: DEFAULT_STALE_TIME,
                gcTime: 5 * 60_000,
                refetchOnWindowFocus: false,
                retry: shouldRetry,
            },
            mutations: {
                retry: false,
            },
        },
    });
}