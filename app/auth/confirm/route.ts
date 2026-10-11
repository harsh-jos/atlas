import { NextResponse } from 'next/server';
import { appOrigin, supabaseServer } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const tokenHash = params.get('token_hash');
  // Only signup confirmation is handled here; arbitrary redirect URLs are never accepted.
  if (tokenHash && params.get('type') === 'email') {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    if (!error) return NextResponse.redirect(`${appOrigin()}/`);
  }
  return NextResponse.redirect(`${appOrigin()}/login?authError=1`);
}
