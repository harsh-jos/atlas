'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'atlas.readingFont';

// Reading-body candidates. `inter` is the default (no data-reading attribute);
// the others map to overrides in globals.css. Serif titles are never affected.
const OPTIONS = [
  { value: 'inter', label: 'Inter' },
  { value: 'geist', label: 'Geist' },
  { value: 'poppins', label: 'Poppins' },
  { value: 'system', label: 'Helvetica' },
] as const;

type FontValue = (typeof OPTIONS)[number]['value'];

function apply(value: FontValue) {
  const root = document.documentElement;
  if (value === 'inter') delete root.dataset.reading;
  else root.dataset.reading = value;
}

function isFontValue(value: string | null): value is FontValue {
  return OPTIONS.some((o) => o.value === value);
}

export function ReadingFontControl() {
  const [active, setActive] = useState<FontValue>('inter');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const value = isFontValue(saved) ? saved : 'inter';
    setActive(value);
    apply(value);
  }, []);

  function choose(value: FontValue) {
    setActive(value);
    apply(value);
    localStorage.setItem(STORAGE_KEY, value);
  }

  return (
    <div className="fixed bottom-20 right-4 z-40 flex items-center gap-1 rounded-full border-thin bg-surface/95 p-1 shadow-card backdrop-blur md:bottom-4">
      <span className="select-none px-2 text-[11px] font-medium uppercase tracking-wide text-faint">
        Aa
      </span>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => choose(option.value)}
          className={`rounded-full px-2.5 py-1 text-[12px] transition-colors ${
            active === option.value ? 'bg-action text-white' : 'text-muted hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
