'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** id of the element that labels the dialog, wired to aria-labelledby. */
  labelledBy: string;
  children: React.ReactNode;
  className?: string;
}

/** The one floating surface in the app — reserved for things that genuinely need to interrupt. */
export function Modal({ open, onClose, labelledBy, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="animate-rise absolute inset-0 bg-ink/40"
        style={{ animationDuration: 'var(--dur-fast)' }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          'animate-rise relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-card border bg-surface shadow-pop',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
