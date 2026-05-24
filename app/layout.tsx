import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { TopNav } from '@/components/layout/TopNav';
import { BottomNav } from '@/components/layout/BottomNav';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50/30 text-zinc-900 font-sans">
        {/* Global navigation */}
        <TopNav />
        
        {/* Main Content Area */}
        <main className="flex-1 pb-16 md:pb-6">
          {children}
        </main>
        
        {/* Mobile bottom navigation */}
        <BottomNav />
      </body>
    </html>
  );
}
