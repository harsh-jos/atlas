import Link from 'next/link';
import { CircleUserRound, LogOut, MessageSquare, Sparkles } from 'lucide-react';
import { apiGet } from '@/lib/api';
import type { AccountUsage } from '@/lib/api-types';
import { formatCredits } from '@/lib/credits';
import { signOut } from '@/app/login/actions';
import { PageContainer, PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/shadcn/button';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const account = await apiGet<AccountUsage>('/agent/account');
  const superuser = account.role === 'SUPERUSER';
  const percent = account.creditLimit ? Math.min(100, account.creditsUsed / account.creditLimit * 100) : 0;
  const exhausted = account.creditLimit !== null && account.creditsRemaining === 0;

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Profile" description="Your account and credits, in one place." />
      <div className="space-y-6 pb-8">
        <section className="rounded-2xl border bg-white p-5 sm:p-6" aria-labelledby="account-title">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><CircleUserRound className="size-6" /></div>
            <div className="min-w-0 flex-1">
              <h2 id="account-title" className="break-all text-base font-medium text-ink">{account.email}</h2>
              <p className="mt-1 text-xs text-muted">{superuser ? 'Superuser' : 'Free account'}</p>
            </div>
          </div>
          <dl className="mt-6 grid gap-4 border-t pt-5 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Account ID</dt><dd className="mt-1 break-all font-mono text-xs text-ink">{account.id}</dd></div>
            <div><dt className="text-xs text-muted">Member since</dt><dd className="mt-1 text-ink">{new Date(account.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</dd></div>
          </dl>
        </section>

        <section className="rounded-2xl border bg-white p-5 sm:p-6" aria-labelledby="credits-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="credits-title" className="flex items-center gap-2 text-sm font-medium text-ink"><Sparkles className="size-4" /> Credits</h2>
            <span className="rounded-full bg-surface-soft px-2.5 py-1 text-xs text-muted">{account.creditLimit === null ? 'Unlimited' : 'Lifetime allowance'}</span>
          </div>
          <div className="mt-6 flex flex-wrap items-baseline gap-2">
            <span className="text-3xl font-medium tracking-tight text-ink">{formatCredits(account.creditsUsed)}{account.creditsPending ? '+' : ''}</span>
            <span className="text-sm text-muted">{account.creditLimit === null ? 'credits used' : `of ${formatCredits(account.creditLimit)} credits used`}</span>
          </div>
          {account.creditLimit !== null && <>
            <div role="progressbar" aria-label="Account credits used" aria-valuemin={0} aria-valuemax={account.creditLimit} aria-valuenow={Math.min(account.creditsUsed, account.creditLimit)} aria-valuetext={`${formatCredits(account.creditsUsed)} of ${formatCredits(account.creditLimit)} credits used`} className="mt-4 h-2 overflow-hidden rounded-full bg-surface-soft">
              <div className={`h-full rounded-full ${exhausted ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-3 text-sm text-ink">{formatCredits(account.creditsRemaining ?? 0)} credits remaining</p>
          </>}
          <p className="mt-4 text-xs leading-5 text-muted">Credits are shared across all your conversations. Start as many conversations as you like.{account.creditLimit !== null && ' Your free allowance does not reset.'}</p>
          <p className="mt-2 text-xs leading-5 text-muted">Usage is estimated from provider-reported model activity, with no added markup.</p>
          {account.creditsPending && <p role="status" className="mt-4 rounded-lg bg-surface-soft p-3 text-sm text-muted">Some usage is pending or unavailable. The total shown includes confirmed usage so far.{!account.canChat && ' New replies are paused until that usage can be resolved.'}</p>}
          {exhausted && <p role="status" className="mt-4 rounded-lg bg-surface-soft p-3 text-sm text-muted">You’ve used your free credits. Your conversations and saved work are still available to read.</p>}
          <Button asChild variant="outline" className="mt-5"><Link href="/"><MessageSquare className="size-4" /> Back to Atlas</Link></Button>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white p-5 sm:p-6">
          <div><h2 className="text-sm font-medium text-ink">Sign out</h2><p className="mt-1 text-xs text-muted">Your conversations and saved work will be here when you return.</p></div>
          <form action={signOut}><Button variant="outline" type="submit"><LogOut className="size-4" /> Sign out</Button></form>
        </section>
      </div>
    </PageContainer>
  );
}
