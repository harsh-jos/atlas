import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center space-x-1.5 text-xs text-zinc-400 font-medium select-none', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <React.Fragment key={index}>
            {index > 0 && <ChevronRight className="h-3 w-3 text-zinc-300" />}
            {isLast ? (
              <span className="text-zinc-600 truncate max-w-[200px] sm:max-w-xs">{item.label}</span>
            ) : item.href ? (
              <Link
                href={item.href}
                className="hover:text-zinc-900 transition-colors truncate max-w-[120px] sm:max-w-xs"
              >
                {item.label}
              </Link>
            ) : (
              <span className="truncate max-w-[120px] sm:max-w-xs">{item.label}</span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
