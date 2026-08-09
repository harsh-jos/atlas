import type { Metadata } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';
import { AppShell } from '@/components/layout/AppShell';
import './globals.css';

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
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden font-sans text-ink">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
