import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts a string to a URL-friendly slug.
 * Example: "Attention Mechanism!" -> "attention-mechanism"
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start
    .replace(/-+$/, '');            // Trim - from end
}

/**
 * Strips inline Markdown noise from heading-derived text — bold markers, inline
 * code backticks, and leading heading hashes — so titles read cleanly wherever
 * they surface. Conservative by design: single `*`/`_` are left untouched so
 * code identifiers like `before_model_callback` survive intact.
 */
export function cleanTitle(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) links — keep the text
    .replace(/¶/g, '') // pilcrows left by heading anchors
    .replace(/`/g, '') // inline code backticks
    .replace(/\*\*/g, '') // **bold** markers
    .replace(/^#{1,6}\s+/, '') // leading heading hashes
    .trim();
}

/**
 * Formats a date into a human-readable string (e.g., "May 24, 2026").
 */
export function formatDate(date: Date | string | number): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const WORDS_PER_MINUTE = 200;

/**
 * Estimates reading time from a body of markdown or HTML, the way a print
 * magazine masthead would — strip markup, count words, round up to a minute.
 */
export function estimateReadingTime(text: string | null): string {
  const words = (text ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>|-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  return `${minutes} min read`;
}

/** Markup-free, case-folded text — for comparing what a reader actually sees. */
function readable(text: string | null): string {
  return (text ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * True when the summary merely repeats how the body opens — which happens whenever
 * ingestion lifts the first paragraph as the summary. Showing both puts the same
 * sentence on screen twice, so the standfirst earns its place only when it differs.
 */
export function duplicatesOpening(summary: string | null, body: string | null): boolean {
  const lead = readable(summary);
  return lead.length > 0 && readable(body).startsWith(lead);
}

/**
 * Formats a date into "time ago" format (e.g., "2 hours ago", "3 days ago").
 */
export function timeAgo(date: Date | string | number): string {
  const d = new Date(date);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;

  return formatDate(d);
}
