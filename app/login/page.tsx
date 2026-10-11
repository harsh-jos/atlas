import { usesSupabase } from '@/lib/supabase/server';
import { signInWithGoogle } from './actions';
import { Button } from '@/components/ui/Button';
import { SignInForm } from '@/components/auth/SignInForm';
import { Logo } from '@/components/ui/Logo';
import { ArrowUpRight, BookOpen, Network, Sparkles } from 'lucide-react';
export const dynamic = 'force-dynamic';
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ authError?: string }> }) {
  const { authError } = await searchParams;
  return (
    <div className="flex min-h-dvh overflow-y-auto bg-white">
      <div className="relative hidden w-[48%] shrink-0 flex-col justify-between overflow-hidden border-r bg-[#eff8fe] px-12 py-10 lg:flex xl:px-16">
        <Logo className="relative z-10 text-3xl" />
        <div className="relative z-10 py-12">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent-line bg-white/70 px-3 py-1.5 text-[11px] text-accent">
            <Sparkles className="size-3.5" />A space for your curiosity
          </span>
          <h2 className="max-w-md text-[44px] font-medium leading-[1.13] tracking-[-0.04em] text-ink">
            Understand more.
            <br />
            Keep what clicks.
          </h2>
          <p className="mt-6 max-w-sm text-sm leading-7 text-muted">
            Explore a question with Atlas, save the ideas that matter, and find
            your way back to them.
          </p>
          <div className="mt-10 space-y-3">
            <div className="flex max-w-sm items-center gap-4 rounded-xl border border-white bg-white/75 p-4">
              <span className="rounded-lg bg-accent-soft p-2.5 text-accent">
                <BookOpen className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  A library that grows with you
                </p>
                <p className="mt-1 text-xs text-muted">
                  Your explanations, ready to revisit.
                </p>
              </div>
              <ArrowUpRight className="ml-auto size-4 text-faint" />
            </div>
            <div className="flex max-w-sm items-center gap-4 rounded-xl border border-white bg-white/75 p-4">
              <span className="rounded-lg bg-accent-soft p-2.5 text-accent">
                <Network className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  Ideas don’t live in isolation
                </p>
                <p className="mt-1 text-xs text-muted">
                  See the connections between them.
                </p>
              </div>
            </div>
          </div>
        </div>
        <p className="relative z-10 text-xs text-muted">
          Follow a question. Find a new perspective.
        </p>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-36 -right-44 size-[600px] rounded-full border-[65px] border-sky/10"
        />
      </div>
      <div className="flex min-h-dvh flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-12 lg:hidden">
            <Logo className="text-3xl" />
          </div>
          <p className="mb-3 font-sans text-xs font-medium text-accent">
            Your learning space
          </p>
          <h1 className="text-[32px] font-semibold tracking-[-0.035em] text-ink">
            Welcome to Atlas
          </h1>
          <p className="mb-9 mt-3 text-sm leading-6 text-muted">
            Sign in to pick up a thread, or create an account to start
            exploring.
          </p>
          {authError && <p role="alert" className="mb-4 text-sm text-danger">Sign-in could not be completed. Please try again.</p>}
          {usesSupabase() && (
            <form action={signInWithGoogle} className="mb-6">
              <Button type="submit" variant="secondary" className="h-11 w-full">Continue with Google</Button>
              <p className="mt-5 text-center text-xs text-muted">Or use your email</p>
            </form>
          )}
          <SignInForm />
          <p className="mt-8 border-t pt-5 text-xs leading-6 text-faint">
            Your conversations and saved explanations stay in your account.
          </p>
        </div>
      </div>
    </div>
  );
}
