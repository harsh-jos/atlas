import { SignInForm } from '@/components/auth/SignInForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="flex h-screen overflow-y-auto bg-canvas">
      <div className="relative hidden w-1/2 shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#241a5e] via-[#4b3aa8] to-accent px-12 py-10 lg:flex">
        <div
          className="dot-grid pointer-events-none absolute inset-0 opacity-[0.18] [mask-image:radial-gradient(900px_640px_at_25%_15%,black,transparent_75%)]"
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/15 font-display text-[14px] font-bold text-white"
            aria-hidden="true"
          >
            A
          </span>
          <span className="font-display text-[17px] font-bold tracking-[-0.03em] text-white">
            Atlas
          </span>
        </div>

        <div className="relative max-w-sm">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white/55">
            Your knowledge, kept
          </p>
          <p className="font-title text-[30px] font-semibold leading-[1.25] tracking-[-0.02em] text-white">
            Curiosity becomes a knowledge base you own.
          </p>
        </div>

        <p className="relative text-[12.5px] text-white/45">
          A research companion that reads with you — and keeps what matters.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-3 flex items-center gap-2 lg:hidden">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-accent font-display text-[13px] font-bold text-white"
              aria-hidden="true"
            >
              A
            </span>
            <span className="font-display text-[15px] font-bold tracking-[-0.03em] text-ink">
              Atlas
            </span>
          </div>

          <div className="mb-8">
            <h1 className="font-title text-[30px] font-extrabold leading-tight tracking-[-0.03em] text-ink">
              Sign in
            </h1>
            <p className="mt-2.5 text-[14px] leading-6 text-muted">
              Your knowledge base is yours alone — everything here is scoped to your account.
            </p>
          </div>

          <SignInForm />
        </div>
      </div>
    </div>
  );
}
