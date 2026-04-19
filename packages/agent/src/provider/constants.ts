/**
 * Provider-level defaults shared by every concrete LLM provider.
 *
 * We keep these as named constants (not inline numbers) because the user-
 * configured `model_configs.max_tokens` is the source of truth; this value
 * only kicks in when the caller *explicitly* built a provider without a
 * max-token setting. Any test or dev-bootstrap code path that lands here
 * should be auditable from one grep.
 */

/**
 * Fallback ceiling on output tokens when neither the ChatOptions call nor
 * the provider constructor supplied a value. Chosen to match the UI slider
 * default so a user who accepts all defaults gets the same ceiling
 * regardless of which code path instantiated their provider.
 *
 * When this fires in practice, view-agent outputs (which generate full HTML
 * documents) may hit `stop_reason: max_tokens` — that is the structured
 * error the providers surface as `LLMError.reason = 'output_tokens_exceeded'`.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
