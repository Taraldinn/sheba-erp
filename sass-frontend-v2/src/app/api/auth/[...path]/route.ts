import { auth } from '@/lib/auth';
import type { NextRequest } from 'next/server';

const defaultHandler = auth.handler();

type RouteContext = {
    params?: Promise<{ path?: string[]; all?: string[] }> | { path?: string[]; all?: string[] };
};

async function getPath(req: NextRequest, ctx?: RouteContext): Promise<string[]> {
    const resolvedParams = ctx?.params ? await ctx.params : undefined;
    if (resolvedParams?.path && Array.isArray(resolvedParams.path) && resolvedParams.path.length > 0) {
        return resolvedParams.path;
    }
    if (resolvedParams?.all && Array.isArray(resolvedParams.all) && resolvedParams.all.length > 0) {
        return resolvedParams.all;
    }
    // Defensive fallback: extract path segments from URL pathname after /api/auth/
    const url = new URL(req.url);
    const subpath = url.pathname.replace(/^\/api\/auth\/?/, '');
    return subpath ? subpath.split('/').filter(Boolean) : [];
}

function createMethodHandler(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH') {
    return async (req: NextRequest, ctx: RouteContext) => {
        const path = await getPath(req, ctx);
        const adaptedCtx = {
            params: Promise.resolve({ path }),
        };
        return defaultHandler[method](req, adaptedCtx as any);
    };
}

export const GET = createMethodHandler('GET');
export const POST = createMethodHandler('POST');
export const PUT = createMethodHandler('PUT');
export const DELETE = createMethodHandler('DELETE');
export const PATCH = createMethodHandler('PATCH');
