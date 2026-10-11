import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function usesSupabase(): boolean {
  return process.env.AUTH_PROVIDER === 'supabase';
}

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase auth configuration is missing.');
  return { url, key };
}

/** Server-only auth: OAuth and password actions, with refresh handled by proxy.ts. */
export async function supabaseServer() {
  const jar = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient(url, key, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // Server Components are read-only; the proxy persists refreshes before rendering.
        }
      },
    },
  });
}

export function appOrigin(): string {
  const origin = process.env.APP_URL;
  if (!origin) throw new Error('APP_URL is required for authentication redirects.');
  return new URL(origin).origin;
}
