import type * as React from 'react';

export interface PageHeaderProps {
  /** Mono micro-label above the title. */
  eyebrow: string;
  title: string;
  description?: string;
  /** Buttons or controls, right-aligned on desktop. */
  actions?: React.ReactNode;
}

/**
 * Every page opens the same way: mono eyebrow, title, one line of intent.
 * A single header component is what makes the pages feel like one product.
 */
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** The standard page gutter — one measure for every route. */
export function PageContainer({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`animate-rise mx-auto w-full max-w-5xl px-6 py-8 sm:px-10 sm:py-10 ${className}`}
    >
      {children}
    </div>
  );
}
