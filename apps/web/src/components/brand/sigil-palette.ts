/**
 * Sunset → sea editorial palette shared by the Lightboard sigil, the login
 * grid-backdrop, and the {@link LightboardLoader}.
 *
 * Duplicated verbatim from the `--sigil-1..10` CSS custom properties in
 * `globals.css`. The duplication is deliberate: each animated trace needs its
 * chosen color baked into a `linear-gradient(...)` and a `box-shadow` string
 * at spawn time, and `var(--sigil-1)` inside those strings would pin every
 * trace to the same runtime value instead of capturing the per-trace pick.
 * If the tokens in `globals.css` change, update this array in lockstep.
 */
export const SIGIL_PALETTE = [
  '#F4A261',
  '#E76F51',
  '#E9C46A',
  '#D9A441',
  '#8AB4B8',
  '#5E8B95',
  '#6A7BA2',
  '#B08CA8',
  '#D4846F',
] as const;

/** Exported type for the palette entries — a string-literal union of hex colors. */
export type SigilPaletteColor = (typeof SIGIL_PALETTE)[number];
