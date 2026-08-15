import { SignInForm } from '@/components/auth/SignInForm';
import { Logo } from '@/components/ui/Logo';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="flex h-screen overflow-y-auto bg-surface">
      <div className="relative hidden w-1/2 shrink-0 flex-col justify-between overflow-hidden bg-action px-12 py-10 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:radial-gradient(900px_640px_at_25%_15%,black,transparent_75%)]"
          aria-hidden="true"
        />
        <div className="relative text-white">
          <Logo className="text-[15px]" />
        </div>

        <div className="relative max-w-sm">
          <p className="text-[28px] font-semibold leading-[1.25] tracking-[-0.02em] text-white">
            Curiosity becomes a knowledge base you own.
          </p>
        </div>

        <p className="relative text-[13px] text-white/45">
          A research companion that reads with you — and keeps what matters.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-3 lg:hidden">
            <Logo />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Sign in</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Your knowledge base is yours alone — everything here is scoped to your account.
            </p>
          </div>

          <SignInForm />
        </div>
      </div>
    </div>
  );
}
