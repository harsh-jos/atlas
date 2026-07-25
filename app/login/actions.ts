'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiError, TOKEN_COOKIE, apiPost } from '@/lib/api';

const TOKEN_TTL_SECONDS = 60 * 60 * 24;

export interface AuthState {
  error?: string;
}

async function authenticate(path: string, email: string, password: string): Promise<void> {
  const { access_token: token } = await apiPost<{ access_token: string }>(path, {
    email,
    password,
  });
  (await cookies()).set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TOKEN_TTL_SECONDS,
  });
}

export async function signIn(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const isNew = formData.get('intent') === 'register';

  if (!email || !password) {
    return { error: 'Email and password are both required.' };
  }

  try {
    if (isNew) {
      await apiPost('/auth/register', { email, password });
    }
    await authenticate('/auth/login', email, password);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: message(error, isNew) };
    }
    return { error: 'Could not reach Atlas. Is the backend running?' };
  }

  redirect('/');
}

function message(error: ApiError, isNew: boolean): string {
  if (error.status === 409) return 'That email is already registered — sign in instead.';
  if (error.status === 422) return 'Passwords must be at least 12 characters.';
  if (error.status === 401) return 'Those credentials did not work.';
  return isNew ? 'Could not create the account.' : 'Could not sign in.';
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(TOKEN_COOKIE);
  redirect('/login');
}
