'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/Button';

interface CreateNoteButtonProps extends Omit<ButtonProps, 'onClick'> {
  label?: string;
}

export function CreateNoteButton({ label = 'New note', ...props }: CreateNoteButtonProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = React.useState(false);

  async function createNote() {
    if (isCreating) return;
    setIsCreating(true);

    try {
      const response = await fetch('/api/notes', { method: 'POST' });
      if (!response.ok) return;
      const data = (await response.json()) as { slug: string };
      router.push(`/notes/${data.slug}?edit=true`);
      router.refresh();
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Button onClick={createNote} disabled={isCreating} {...props}>
      <Plus className="mr-1.5 h-3.5 w-3.5" />
      {isCreating ? 'Creating' : label}
    </Button>
  );
}
