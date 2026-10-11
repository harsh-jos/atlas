import type * as React from 'react';
export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-ink sm:text-[32px]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
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
      className={`animate-rise mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 lg:px-12 lg:py-10 ${className}`}
    >
      {children}
    </div>
  );
}
