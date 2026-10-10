import type { Metadata } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';
import { AppShell } from '@/components/layout/AppShell';
import { ChatHistory } from '@/components/layout/ChatHistory';
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
  title: 'Atlas — Explore and Learn',
  description: 'Explore a subject with expert guidance and connected explanations.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden font-sans text-ink">
        <AppShell chatHistory={<ChatHistory />}>{children}</AppShell>
      </body>
    </html>
  );
}
