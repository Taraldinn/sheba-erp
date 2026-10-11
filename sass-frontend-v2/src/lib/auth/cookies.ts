import Cookies from 'js-cookie';

export async function getCookie(key: string): Promise<string | null> {
    if (typeof window !== 'undefined') {
        return Cookies.get(key) || null;
    } else {
        try {
            const { cookies } = await import('next/headers');
            const cookieStore = await cookies();
            return cookieStore.get(key)?.value || null;
        } catch {
            return null;
        }
    }
}

export function setCookie(key: string, value: string, options?: Cookies.CookieAttributes): void {
    if (typeof window !== 'undefined') {
        Cookies.set(key, value, { path: '/', ...options });
    }
}

export function removeCookie(key: string, options?: Cookies.CookieAttributes): void {
    if (typeof window !== 'undefined') {
        Cookies.remove(key, { path: '/', ...options });
    }
}
