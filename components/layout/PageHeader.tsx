import type * as React from 'react';
export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[23px] font-semibold tracking-[-0.035em] text-ink sm:text-[26px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
export function PageContainer({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`animate-rise mx-auto w-full max-w-[1280px] px-4 py-5 sm:px-6 lg:px-7 lg:py-6 ${className}`}
    >
      {children}
    </div>
  );
}
