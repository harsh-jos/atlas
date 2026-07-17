'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'atlas.titleFont';

// Title/display candidates. `fraunces` is the default (no data-title attribute);
// the others map to overrides in globals.css. Reading body is unaffected.
const OPTIONS = [
  { value: 'fraunces', label: 'Fraunces' },
  { value: 'newsreader', label: 'Newsreader' },
  { value: 'instrument', label: 'Instrument' },
  { value: 'playfair', label: 'Playfair' },
  { value: 'jakarta', label: 'Jakarta' },
  { value: 'geist', label: 'Geist' },
] as const;

type TitleValue = (typeof OPTIONS)[number]['value'];

function apply(value: TitleValue) {
  const root = document.documentElement;
  if (value === 'fraunces') delete root.dataset.title;
  else root.dataset.title = value;
}

function isTitleValue(value: string | null): value is TitleValue {
  return OPTIONS.some((o) => o.value === value);
}

export function TitleFontControl() {
  const [active, setActive] = useState<TitleValue>('fraunces');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const value = isTitleValue(saved) ? saved : 'fraunces';
    setActive(value);
    apply(value);
  }, []);

  function choose(value: TitleValue) {
    setActive(value);
    apply(value);
    localStorage.setItem(STORAGE_KEY, value);
  }

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-wrap items-center gap-1 rounded-2xl border-thin bg-surface/95 p-1 shadow-card backdrop-blur md:bottom-4">
      <span className="select-none px-2 text-[11px] font-medium uppercase tracking-wide text-faint">
        Title
      </span>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => choose(option.value)}
          className={`rounded-xl px-2.5 py-1 text-[12px] transition-colors ${
            active === option.value ? 'bg-action text-white' : 'text-muted hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
