import { NextResponse } from 'next/server';
import { appOrigin, supabaseServer } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code');
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${appOrigin()}/`);
  }
  return NextResponse.redirect(`${appOrigin()}/login?authError=1`);
}
