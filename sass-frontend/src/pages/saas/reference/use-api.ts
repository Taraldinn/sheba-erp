import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/api/client";

export interface UseMutationResult<TInput, TResult> {
  loading: boolean;
  error: string | null;
  /** Run the mutation. Returns the result on success, or null on failure. */
  run: (input: TInput) => Promise<TResult | null>;
  /** Reset error and loading state (used when opening a new modal). */
  reset: () => void;
}

/**
 * Helper for one-shot CRUD actions (create / update / delete).
 *
 * Same error-shape contract as `useApi` — returns a string `error` ready to
 * drop into the UI, and a `run` callback that re-enters the loading phase on
 * each invocation. Designed to be called from button onClick handlers in
 * modals / side panels.
 */
export function useMutation<TInput, TResult>(
  mutator: (input: TInput) => Promise<TResult>,
): UseMutationResult<TInput, TResult> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (input: TInput): Promise<TResult | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await mutator(input);
        return result;
      } catch (err) {
        if (err instanceof ApiError) setError(err.message);
        else if (err instanceof Error) setError(err.message);
        else setError("Unexpected error");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [mutator],
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
  }, []);

  return { loading, error, run, reset };
}

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** HTTP status code, 0 for network errors. */
  status: number;
  refetch: () => Promise<void>;
  setData: (next: T | null) => void;
}

/**
 * Tiny data-fetching helper for the super-admin reference pages.
 *
 * Wraps an async fetcher with `loading` / `error` / `refetch` state and
 * surfaces a human-readable error message for both `ApiError` and
 * unexpected throwables. Designed to be drop-in usable from any screen
 * without an extra dependency.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: ReadonlyArray<unknown> = []): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      if (err instanceof ApiError) {
        setStatus(err.status);
        setError(err.message);
      } else if (err instanceof Error) {
        setStatus(0);
        setError(err.message);
      } else {
        setStatus(0);
        setError("Unexpected error");
      }
      setData(null);
    } finally {
      setLoading(false);
    }
    // We intentionally re-run when the caller-supplied deps change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, status, refetch: load, setData };
}

/** Normalize ISO timestamps into a short human-friendly string. */
export function formatDate(value: string | undefined | null, fallback = "—"): string {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatRelative(value: string | undefined | null, fallback = "—"): string {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  const diff = Date.now() - d.getTime();
  if (diff < 0) return formatDate(value);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return formatDate(value);
}

/** Pick the first two characters of a string, uppercased, as a tenant avatar. */
export function initialsFor(name: string | undefined | null): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Pick one of the reference's avatar color classes based on a stable hash. */
export function avatarToneFor(seed: string): string {
  const tones = ["avatar-purple", "avatar-blue", "avatar-green", "avatar-orange"];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return tones[hash % tones.length];
}
