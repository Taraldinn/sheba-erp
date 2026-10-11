/**
 * Domain error hierarchy.
 *
 * - ApiError covers all backend HTTP failures and carries a structured
 *   error code so the UI can branch on it.
 * - NetworkError covers transport-level failures (offline, DNS, CORS).
 * - AuthError covers 401/403 with explicit semantics for the auth provider.
 */
export class ApiError extends Error {
    status: number;
    code?: string;
    controlPlaneUrl?: string;
    /** Field-level validation errors (when present). */
    fieldErrors?: Record<string, string[]>;

    constructor(
        status: number,
        message: string,
        extras?: {
            code?: string;
            controlPlaneUrl?: string;
            fieldErrors?: Record<string, string[]>;
        },
    ) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        if (extras?.code) this.code = extras.code;
        if (extras?.controlPlaneUrl) this.controlPlaneUrl = extras.controlPlaneUrl;
        if (extras?.fieldErrors) this.fieldErrors = extras.fieldErrors;
    }

    isAuthError(): boolean {
        return this.status === 401;
    }
    isForbidden(): boolean {
        return this.status === 403;
    }
    isNotFound(): boolean {
        return this.status === 404;
    }
    isValidation(): boolean {
        return this.status === 400 || this.status === 422;
    }
    isIdempotencyConflict(): boolean {
        return this.status === 409 && this.code === 'IDEMPOTENCY_CONFLICT';
    }
    isRateLimited(): boolean {
        return this.status === 429;
    }
    isServerError(): boolean {
        return this.status >= 500;
    }
}

export class NetworkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NetworkError';
    }
}

export class AuthError extends ApiError {
    constructor(message: string, code?: string) {
        super(401, message, { code });
        this.name = 'AuthError';
    }
}

/**
 * Backend error envelope standard (`docs/API_CONTRACT.md` §2.1).
 * All list endpoints return a DRF paginator; errors return the envelope below.
 */
export interface ApiErrorBody {
    error?: string;
    code?: string;
    message?: string;
    detail?: string;
    field_errors?: Record<string, string[]>;
    control_plane_url?: string;
}

export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}