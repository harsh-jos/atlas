import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/** The Python backend is the only source of data; nothing here touches a database. */
const API_URL = process.env.ATLAS_API_URL ?? 'http://localhost:8000';

export const TOKEN_COOKIE = 'atlas_token';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function authorization(): Promise<Record<string, string>> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** GET a typed payload. An expired or missing session sends the reader to sign in. */
export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: await authorization(),
    cache: 'no-store',
  });

  if (response.status === 401) {
    redirect('/login');
  }
  if (!response.ok) {
    throw new ApiError(response.status, `GET ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/** As {@link apiGet}, but a missing row is a `null` rather than a thrown error. */
export async function apiGetOrNull<T>(path: string): Promise<T | null> {
  try {
    return await apiGet<T>(path);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/** Unauthenticated POST — used by sign-in, which has no token yet. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authorization()) },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError(response.status, `POST ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}
