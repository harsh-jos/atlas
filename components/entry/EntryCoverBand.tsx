export interface EntryCoverBandProps {
  /** The owning concept's color, if it has one — ties the cover to the identity
   * mark already shown for this concept on the Library grid. */
  color: string | null;
}

/**
 * A generated cover, Notion-page-style — full-bleed, above everything else on
 * the page. Deep navy is the constant base (always reads as intentional,
 * never muddy); the concept's own color shows up only as a soft radial glow
 * from one corner, so two arbitrary hues are never forced to blend directly
 * into each other. No upload, no per-artifact config — every artifact gets
 * an opening moment for free.
 */
export function EntryCoverBand({ color }: EntryCoverBandProps) {
  const glow = color || 'var(--sky)';

  return (
    <div
      aria-hidden="true"
      className="relative h-28 w-full overflow-hidden sm:h-36"
      style={{ background: 'var(--deep)' }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 140% at 12% 10%, color-mix(in srgb, ${glow} 75%, transparent), transparent 60%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.15] [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:radial-gradient(55%_120%_at_88%_60%,black,transparent_75%)]"
      />
    </div>
  );
}
