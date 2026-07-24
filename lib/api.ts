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

type Method = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Send a mutation. Callable only from Server Actions and Server Components — the session
 * token is an httpOnly cookie, so the browser can never reach the backend directly.
 */
export async function apiSend<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(await authorization()) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError(response.status, await detail(response, `${method} ${path}`));
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

/** Upload bytes as multipart; the caller owns the FormData so files stream through untouched. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: await authorization(),
    body: form,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError(response.status, await detail(response, `POST ${path}`));
  }
  return response.json() as Promise<T>;
}

export const apiPost = <T,>(path: string, body: unknown) => apiSend<T>('POST', path, body);

/** Prefer the backend's own message — it explains quota and validation failures precisely. */
async function detail(response: Response, label: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === 'string') return body.detail;
  } catch {
    // Not JSON; fall through to the generic message.
  }
  return `${label} failed: ${response.status}`;
}
