'use client';

import * as React from 'react';

/**
 * A thin hairline pinned to the top of the reading column that fills as you
 * scroll through an entry — the "where am I in this" feel of a book's pages,
 * without any chrome competing with the text.
 *
 * The app frame owns the scroll (its `<main>` carries `.scroll-region`), not
 * the window, so progress is measured against the nearest scrolling
 * ancestor and the bar is `sticky` (not `fixed`) to stay inside that frame.
 */
export function ReadingProgressBar() {
  const [progress, setProgress] = React.useState(0);
  const trackRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const scrollEl = trackRef.current?.closest('.scroll-region');
    if (!(scrollEl instanceof HTMLElement)) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const max = scrollEl.scrollHeight - scrollEl.clientHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, scrollEl.scrollTop / max)) : 0);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={trackRef} className="sticky top-0 z-30 h-[2px] w-full" aria-hidden="true">
      <div
        className="h-full bg-gradient-to-r from-sky to-accent transition-[width] duration-75 ease-out"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}
