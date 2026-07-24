import { SignInForm } from '@/components/auth/SignInForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md items-center px-5">
      <div className="w-full rounded-card border-thin bg-surface p-8 shadow-card">
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
              Atlas
            </span>
          </div>
          <h1 className="font-title text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            Sign in
          </h1>
          <p className="mt-2 text-[14px] text-muted">
            Your knowledge base is yours alone — everything here is scoped to your account.
          </p>
        </div>
        <SignInForm />
      </div>
    </div>
  );
}
