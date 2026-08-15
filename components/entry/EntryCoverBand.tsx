export interface EntryCoverBandProps {
  /** The owning concept's color, if it has one — ties the cover to the identity
   * mark already shown for this concept on the Library grid. */
  color: string | null;
}

/**
 * A generated cover, Notion-page-style — full-bleed gradient anchored to the
 * concept's own color (or the sky/deep default when it has none), with the
 * app's one halftone texture for depth. No upload, no per-artifact config:
 * every artifact gets an opening moment for free.
 */
export function EntryCoverBand({ color }: EntryCoverBandProps) {
  return (
    <div
      aria-hidden="true"
      className="relative h-24 w-full overflow-hidden sm:h-32"
      style={{
        background: `linear-gradient(135deg, ${color || 'var(--sky)'}, var(--deep))`,
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.18] [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:radial-gradient(60%_100%_at_85%_0%,black,transparent_75%)]"
      />
    </div>
  );
}
