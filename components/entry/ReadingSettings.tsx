'use client';

import * as React from 'react';
import { Type } from 'lucide-react';
import { Popover } from '@/components/ui/Popover';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'atlas:reading-prefs';

const SCALE_STEPS = [
  { label: 'S', value: 0.9 },
  { label: 'M', value: 1 },
  { label: 'L', value: 1.15 },
  { label: 'XL', value: 1.3 },
] as const;

const LINE_HEIGHT_STEPS = [
  { label: 'Tight', value: 1.5 },
  { label: 'Normal', value: 1.68 },
  { label: 'Loose', value: 1.85 },
] as const;

const MEASURE_STEPS = [
  { label: 'Narrow', value: '34rem' },
  { label: 'Normal', value: '40rem' },
  { label: 'Wide', value: '46rem' },
] as const;

// Deliberately Sans/Mono only, not Sans/Serif — see docs/design.md and
// atlas-visual-taste memory: serif has been tried and rejected twice.
const FONT_STEPS = [
  { label: 'Sans', value: 'var(--font-sans)' },
  { label: 'Mono', value: 'var(--font-mono)' },
] as const;

interface ReadingPrefs {
  scale: number;
  lineHeight: number;
  measure: string;
  font: string;
}

const DEFAULT_PREFS: ReadingPrefs = {
  scale: SCALE_STEPS[1].value,
  lineHeight: LINE_HEIGHT_STEPS[1].value,
  measure: MEASURE_STEPS[1].value,
  font: FONT_STEPS[0].value,
};

function applyPrefs(prefs: ReadingPrefs) {
  const root = document.documentElement.style;
  root.setProperty('--reading-scale', String(prefs.scale));
  root.setProperty('--reading-line-height', String(prefs.lineHeight));
  root.setProperty('--reading-measure', prefs.measure);
  root.setProperty('--reading-font', prefs.font);
}

function loadPrefs(): ReadingPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ReadingPrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * A small persistent "Aa" control, reachable the whole time you're scrolled
 * through a long artifact. Adjusts font size, line height, column width, and
 * family — applied as CSS custom properties on the document root (the
 * defaults readingComponents.tsx already computes off) and persisted to
 * localStorage: a per-reader, per-device preference, not a server round-trip.
 */
export function ReadingSettings() {
  // The lazy initializer reads localStorage once, on the client's first render —
  // no effect needed to sync storage into state. `prefs` never drives any JSX
  // that's visible before the popover is opened, so there's nothing for a
  // server/client mismatch to disagree about.
  const [prefs, setPrefs] = React.useState<ReadingPrefs>(() =>
    typeof window === 'undefined' ? DEFAULT_PREFS : loadPrefs()
  );

  // The one legitimate effect: push React state out to the DOM custom
  // properties readingComponents.tsx reads from.
  React.useEffect(() => {
    applyPrefs(prefs);
  }, [prefs]);

  const update = (patch: Partial<ReadingPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="fixed right-6 top-4 z-40">
      <Popover
        align="end"
        closeOnSelect={false}
        renderTrigger={({ onClick, open }) => (
          <button
            type="button"
            onClick={onClick}
            aria-expanded={open}
            aria-label="Reading settings"
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-full border bg-surface text-muted shadow-card transition-colors duration-[var(--dur-fast)] hover:bg-surface-soft hover:text-ink"
          >
            <Type className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      >
        <div className="w-60 p-1">
          <Row label="Size">
            {SCALE_STEPS.map((step) => (
              <StepButton
                key={step.label}
                active={prefs.scale === step.value}
                onClick={() => update({ scale: step.value })}
              >
                {step.label}
              </StepButton>
            ))}
          </Row>
          <Row label="Line spacing">
            {LINE_HEIGHT_STEPS.map((step) => (
              <StepButton
                key={step.label}
                active={prefs.lineHeight === step.value}
                onClick={() => update({ lineHeight: step.value })}
              >
                {step.label}
              </StepButton>
            ))}
          </Row>
          <Row label="Column width">
            {MEASURE_STEPS.map((step) => (
              <StepButton
                key={step.label}
                active={prefs.measure === step.value}
                onClick={() => update({ measure: step.value })}
              >
                {step.label}
              </StepButton>
            ))}
          </Row>
          <Row label="Font">
            {FONT_STEPS.map((step) => (
              <StepButton
                key={step.label}
                active={prefs.font === step.value}
                onClick={() => update({ font: step.value })}
              >
                {step.label}
              </StepButton>
            ))}
          </Row>
        </div>
      </Popover>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-1.5 py-2">
      <p className="mb-1.5 text-[11.5px] text-muted">{label}</p>
      <div className="flex items-center gap-0.5 rounded-full bg-surface-soft p-0.5">
        {children}
      </div>
    </div>
  );
}

function StepButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'focus-ring flex-1 rounded-full px-2 py-1 text-[11.5px] font-medium transition-colors duration-[var(--dur-fast)]',
        active ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
      )}
    >
      {children}
    </button>
  );
}
