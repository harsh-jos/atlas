import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Inter, Geist_Mono } from 'next/font/google';
import { TopNav } from '@/components/layout/TopNav';
import { BottomNav } from '@/components/layout/BottomNav';
import './globals.css';

// Plus Jakarta Sans carries display + UI chrome; Inter carries body and
// long-form reading; Geist Mono for code and tabular numerals.
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
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
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
