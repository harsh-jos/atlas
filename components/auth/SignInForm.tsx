'use client';

import { useActionState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { type AuthState, signIn } from '@/app/login/actions';

export function SignInForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {});

  return (
    <form action={action} className="space-y-5">
      <label className="block space-y-1.5">
        <span className="text-[13px] font-medium text-ink">Email</span>
        <Input name="email" type="email" autoComplete="email" required />
      </label>

      <label className="block space-y-1.5">
        <span className="text-[13px] font-medium text-ink">Password</span>
        <Input name="password" type="password" autoComplete="current-password" required />
        <span className="block text-[12px] text-faint">At least 12 characters.</span>
      </label>

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-field border border-danger-line bg-danger-soft px-3.5 py-2.5 text-[13px] leading-5 text-danger"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      )}

      <div className="flex gap-2.5 pt-1">
        <Button type="submit" name="intent" value="login" disabled={pending} className="flex-1">
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="register"
          variant="secondary"
          disabled={pending}
          className="flex-1"
        >
          Create account
        </Button>
      </div>
    </form>
  );
}
