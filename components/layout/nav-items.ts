/** One home for the destinations — the rail and the mobile bar both read from here. */
export const NAV_ITEMS = [
  {
    href: '/',
    label: 'Library',
    icon: 'Library',
    match: (p: string) => p === '/' || p.startsWith('/collections') || p.startsWith('/entries'),
  },
  { href: '/chat', label: 'Learn', icon: 'Sparkles', match: (p: string) => p.startsWith('/chat') },
  { href: '/build', label: 'Build', icon: 'Hammer', match: (p: string) => p.startsWith('/build') },
  { href: '/graph', label: 'Graph', icon: 'Network', match: (p: string) => p.startsWith('/graph') },
  { href: '/search', label: 'Search', icon: 'Search', match: (p: string) => p.startsWith('/search') },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  icon: 'Library' | 'Sparkles' | 'Hammer' | 'Network' | 'Search';
  match: (p: string) => boolean;
}>;
