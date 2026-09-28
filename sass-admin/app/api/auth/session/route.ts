import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, SESSION_STORAGE_KEY } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = body?.token;
    const cookieStore = await cookies();

    if (token) {
      cookieStore.set(SESSION_COOKIE_NAME, token, {
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
        sameSite: "lax",
        httpOnly: true,
      });
      cookieStore.set(SESSION_STORAGE_KEY, token, {
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
        sameSite: "lax",
        httpOnly: false,
      });

      return NextResponse.json({ ok: true, authenticated: true });
    } else {
      cookieStore.delete(SESSION_COOKIE_NAME);
      cookieStore.delete(SESSION_STORAGE_KEY);

      return NextResponse.json({ ok: true, authenticated: false });
    }
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to set session",
      },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const cookieStore = await cookies();

  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(SESSION_STORAGE_KEY);

  return NextResponse.json({ ok: true, authenticated: false });
}
