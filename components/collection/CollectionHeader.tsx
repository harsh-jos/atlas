import * as React from 'react';

export interface CollectionHeaderProps {
  name: string;
  description: string | null;
  color: string | null;
  entryCount: number;
}

export function CollectionHeader({
  name,
  description,
  color,
  entryCount,
}: CollectionHeaderProps) {
  const accentColor = color || '#888888';

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5 mb-1.5">
        <span
          className="h-2.5 w-2.5 rounded-full inline-block shrink-0"
          style={{ backgroundColor: accentColor }}
        />
        <h1 className="text-lg font-medium tracking-tight text-zinc-900">
          {name}
        </h1>
      </div>
      {description && (
        <p className="text-sm text-zinc-400 leading-relaxed ml-5 mb-2">
          {description}
        </p>
      )}
      <p className="text-xs text-zinc-400 font-mono ml-5">
        {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
      </p>
    </div>
  );
}
