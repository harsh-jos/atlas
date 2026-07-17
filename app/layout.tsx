import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Inter, Geist_Mono, Fraunces } from 'next/font/google';
import { TopNav } from '@/components/layout/TopNav';
import { BottomNav } from '@/components/layout/BottomNav';
import './globals.css';

// Three voices: Fraunces = editorial serif for display/titles; Inter = reading
// body + UI; Plus Jakarta Sans = UI chrome; Geist Mono = code and technical labels.
// Swap the serif family here + in globals.css (--font-serif) to change the display voice.
const serif = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
});

const display = Plus_Jakarta_Sans({
  variable: '--font-plus-jakarta',
  subsets: ['latin'],
});

const sans = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const mono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Atlas — Personal Knowledge Base',
  description: 'A structured database-backed technical knowledge base for AI engineers.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${serif.variable} ${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-body font-sans">
        {/* Global navigation */}
        <TopNav />

        {/* Main Content Area — clears the fixed bottom nav (h-14) plus the
            device safe-area inset on mobile so content is never hidden. */}
        <main className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] md:pb-6">
          {children}
        </main>

        {/* Mobile bottom navigation */}
        <BottomNav />
      </body>
    </html>
  );
}
