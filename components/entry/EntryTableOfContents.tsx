'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface EntryTableOfContentsProps {
  /** The id of the wrapping element whose h2 children become TOC entries. */
  bodyId: string;
}

interface HeadingItem {
  id: string;
  text: string;
}

const OBSERVER_MARGIN = '-96px 0px -70% 0px';

/**
 * A sticky map of the article's h2 sections, read straight off the rendered
 * DOM (ids come from rehype-slug at parse time) — the reading column stays a
 * single measure, and this floats in the gutter beside it on wide viewports.
 */
export function EntryTableOfContents({ bodyId }: EntryTableOfContentsProps) {
  const [headings, setHeadings] = React.useState<HeadingItem[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const body = document.getElementById(bodyId);
    if (!body) return;

    const elements = Array.from(body.querySelectorAll<HTMLHeadingElement>('h2')).filter(
      (el) => el.id
    );
    if (elements.length === 0) return;

    // IntersectionObserver reports each observed target's initial state on its
    // first callback (queued, not synchronous) — that first firing is also
    // where the heading list itself is published, so setState never runs
    // directly in the effect body.
    let firstRun = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (firstRun) {
          firstRun = false;
          setHeadings(elements.map((el) => ({ id: el.id, text: el.textContent ?? '' })));
        }
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: OBSERVER_MARGIN, threshold: 0 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [bodyId]);

  // A map with one stop isn't a map — hide rather than show a lone, useless link.
  if (headings.length < 2) return null;

  return (
    <div className="sticky top-10">
      <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">
        On this page
      </p>
      <nav className="flex flex-col">
        {headings.map((heading) => (
          <a
            key={heading.id}
            href={`#${heading.id}`}
            className={cn(
              'border-l-[1.5px] py-1.5 pl-4 text-[12.5px] leading-[1.4] transition-colors duration-[var(--dur-fast)]',
              heading.id === activeId
                ? 'border-sky font-medium text-ink'
                : 'border-hairline text-muted hover:text-ink'
            )}
          >
            {heading.text}
          </a>
        ))}
      </nav>
    </div>
  );
}
