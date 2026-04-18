/**
 * Brand components — the animated Lightboard sigil and its loader variant.
 *
 * PR 2 introduces these in isolation; later PRs (3, 4, 8) consume them to
 * replace the text wordmark in the top bar, auth surfaces, and loading states.
 */
export { LightboardSigil, type LightboardSigilProps } from './lightboard-sigil';
export { SigilLoader, type SigilLoaderProps } from './sigil-loader';
export {
  LightboardLoader,
  type LightboardLoaderProps,
} from './lightboard-loader';
export { SIGIL_PALETTE, type SigilPaletteColor } from './sigil-palette';
