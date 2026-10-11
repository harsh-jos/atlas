'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Menu, Search } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/shadcn/sheet';
import { Button } from '@/components/shadcn/button';
import { Logo } from '@/components/ui/Logo';
import { Sidebar } from './Sidebar';
export function MobileBar({ chatHistory }: { chatHistory: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 md:hidden">
      <div className="flex items-center gap-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open navigation">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-72 gap-0 p-0"
            aria-describedby={undefined}
          >
            <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
            <Sidebar
              mobile
              chatHistory={chatHistory}
              onNavigate={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <Link href="/" aria-label="Atlas home">
          <Logo className="text-xl" />
        </Link>
      </div>
      <Button variant="ghost" size="icon" asChild>
        <Link href="/search" aria-label="Search">
          <Search />
        </Link>
      </Button>
    </header>
  );
}
