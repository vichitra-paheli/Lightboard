/**
 * Frontend-only catalog of supported LLM providers.
 *
 * Single source of truth for:
 *   - drawer tile grid (label, glyph, dot color)
 *   - default base URL hint shown in the drawer
 *   - known model options shown in the Model select (when the provider
 *     publishes a canonical list)
 *
 * Mirrors `lightboard/project/components/settings/LLMs.jsx` `PROVIDERS`
 * (lines 3–11). Providers with `implemented: false` render as selectable
 * UI tiles but the backend {@link resolveAIProviders} throws until the
 * real provider class lands — follow-up PR.
 */
export interface ProviderEntry {
  /** Stable provider key stored in `model_configs.provider`. */
  id: string;
  /** User-facing label. */
  label: string;
  /** Two-letter glyph used in the monogram tile. */
  glyph: string;
  /** Dot color (hex) used in the glyph and select decorations. */
  dot: string;
  /** Known canonical models for the Select dropdown — empty → freeform input. */
  models: string[];
  /** When true, the drawer reveals the Base URL field. */
  needsBaseUrl: boolean;
  /** Placeholder for the base-URL input when visible. */
  baseUrlPlaceholder?: string;
  /** Backend support flag — false providers are UI-only in this release. */
  implemented: boolean;
}

/** Insertion order controls the 4-column tile grid layout. */
export const PROVIDERS: readonly ProviderEntry[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    glyph: 'AN',
    dot: '#E89B52',
    models: [
      'claude-haiku-4-5',
      'claude-sonnet-4-5',
      'claude-opus-4',
      'claude-sonnet-4-20250514',
    ],
    needsBaseUrl: false,
    implemented: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    glyph: 'OA',
    dot: '#7DB469',
    models: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'],
    needsBaseUrl: false,
    implemented: true,
  },
  {
    id: 'google',
    label: 'Google',
    glyph: 'GO',
    dot: '#8AB4B8',
    models: ['gemini-2.0-pro', 'gemini-2.0-flash'],
    needsBaseUrl: false,
    implemented: false,
  },
  {
    id: 'azure',
    label: 'Azure OpenAI',
    glyph: 'AZ',
    dot: '#9B9BE8',
    models: ['gpt-4o', 'gpt-4o-mini'],
    needsBaseUrl: true,
    baseUrlPlaceholder: 'https://your-resource.openai.azure.com/v1',
    implemented: false,
  },
  {
    id: 'bedrock',
    label: 'AWS Bedrock',
    glyph: 'AW',
    dot: '#F2C265',
    models: ['claude-sonnet-4-5', 'llama-3.3-70b'],
    needsBaseUrl: false,
    implemented: false,
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible',
    glyph: 'OC',
    dot: '#B08CA8',
    models: [],
    needsBaseUrl: true,
    baseUrlPlaceholder: 'https://api.example.com/v1',
    implemented: true,
  },
  {
    id: 'local',
    label: 'Local (ollama)',
    glyph: 'LO',
    dot: '#55555C',
    models: ['llama-3.3-70b', 'qwen-2.5-coder'],
    needsBaseUrl: true,
    baseUrlPlaceholder: 'http://localhost:11434/v1',
    implemented: true,
  },
];

/** Lookup helper — returns `undefined` for unknown ids. */
export function getProvider(id: string): ProviderEntry | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
