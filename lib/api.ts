import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/** The Python backend is the only source of data; nothing here touches a database. */
const API_URL = process.env.ATLAS_API_URL ?? 'http://localhost:8000';

export const TOKEN_COOKIE = 'atlas_token';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

const UNREACHABLE = 'Could not reach Atlas. Is the backend running?';

async function authorization(): Promise<Record<string, string>> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** One fetch to the backend; a service that is down becomes a typed error, not a raw throw. */
async function call(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, { cache: 'no-store', ...init });
  } catch {
    throw new ApiError(0, UNREACHABLE);
  }
}

/** A failed response as an ApiError carrying the backend's own explanation when it gives one. */
async function failure(response: Response, label: string): Promise<ApiError> {
  try {
    const body = await response.json() as { detail?: unknown; code?: string; requestId?: string };
    const message = typeof body.detail === 'string' ? body.detail : `${label} failed: ${response.status}`;
    const reference = body.requestId ?? response.headers.get('X-Request-ID') ?? undefined;
    return new ApiError(response.status, reference ? `${message} Reference: ${reference}` : message, body.code, reference);
  } catch {
    return new ApiError(response.status, `${label} failed: ${response.status}`);
  }
}

/** GET a typed payload. An expired or missing session sends the reader to sign in. */
export async function apiGet<T>(path: string): Promise<T> {
  const response = await call(path, { headers: await authorization() });

  if (response.status === 401) {
    redirect('/login');
  }
  if (!response.ok) {
    throw await failure(response, `GET ${path}`);
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
  const response = await call(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(await authorization()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw await failure(response, `${method} ${path}`);
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

/** Upload bytes as multipart; the caller owns the FormData so files stream through untouched. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const response = await call(path, { method: 'POST', headers: await authorization(), body: form });

  if (!response.ok) {
    throw await failure(response, `POST ${path}`);
  }
  return response.json() as Promise<T>;
}

export const apiPost = <T,>(path: string, body: unknown) => apiSend<T>('POST', path, body);

/** Forward an SSE body without buffering it; credentials remain server-side. */
export async function apiStream(path: string, request: Request): Promise<Response> {
  const lastId = request.headers.get('Last-Event-ID');
  const response = await call(path, {
    signal: request.signal,
    headers: {
      ...(await authorization()),
      Accept: 'text/event-stream',
      ...(lastId ? { 'Last-Event-ID': lastId } : {}),
    },
  });
  if (!response.ok) throw await failure(response, 'Chat stream');
  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
