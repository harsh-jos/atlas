import { ApiError, accessToken, apiGet } from '@/lib/api';
import type { AccountUsage } from '@/lib/api-types';
import { supabaseServer, usesSupabase } from '@/lib/supabase/server';

/** Read the verified identity on the server; only the display label reaches the UI. */
export async function currentUserName(): Promise<string | undefined> {
  if (usesSupabase()) {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) return undefined;
    const metadata = data.claims.user_metadata ?? {};
    for (const value of [metadata.full_name, metadata.name, metadata.display_name, data.claims.email]) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  }

  // Password-only accounts currently store an email, but no separate name.
  if (!await accessToken()) return undefined;
  try {
    const account = await apiGet<AccountUsage>('/agent/account');
    return account.email;
  } catch (error) {
    if (error instanceof ApiError) return undefined;
    throw error;
  }
}
