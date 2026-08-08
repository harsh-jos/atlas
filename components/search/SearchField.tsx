'use client';

import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

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
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
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
      <input
        ref={inputRef}
        type="text"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search titles, summaries, and body content…"
        autoComplete="off"
        spellCheck={false}
        className="peer focus-ring h-12 w-full rounded-full border bg-surface pl-13 pr-12 text-[15px] text-ink shadow-card transition-shadow duration-[var(--dur-fast)] placeholder:text-faint"
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 rounded-[6px] border bg-surface-soft px-1.5 py-0.5 font-mono text-[11px] text-faint peer-focus:hidden peer-[:not(:placeholder-shown)]:hidden"
      >
        /
      </kbd>
    </form>
  );
}
