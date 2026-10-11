'use client';

import { useEffect, useRef } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { Input } from '@/components/shadcn/input';
import { Button } from '@/components/shadcn/button';

export interface SearchFieldProps {
  defaultValue: string;
}

/**
 * The search hero — a single large field. Plain GET form so a submit is just a normal
 * navigation to `/search?q=…`; the only client-side behaviour is the `/` focus shortcut.
 */
export function SearchField({ defaultValue }: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (event.key === '/' && !isEditing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <form action="/search" className="relative">
      <Search
        className="pointer-events-none absolute left-5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-faint"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        type="search"
        aria-label="Search saved explanations"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search titles, summaries, and body content…"
        autoComplete="off"
        spellCheck={false}
        className="peer h-14 w-full rounded-xl border bg-canvas/50 pl-13 pr-28 text-base text-ink md:text-sm shadow-none placeholder:text-faint"
      />
      <Button
        type="submit"
        aria-label="Submit search"
        variant="ghost"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-accent"
      >
        Search
        <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}
