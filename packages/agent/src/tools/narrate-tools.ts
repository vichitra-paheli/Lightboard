import type { ToolDefinition } from '../provider/types';

/**
 * Tool definitions for the Leader Agent's finalization step.
 *
 * `narrate_summary` is the leader's terminal tool: after the visualization is
 * ready, the leader calls this once to emit a structured KEY TAKEAWAYS block
 * that the UI renders below the chart. Making this a typed tool (rather than
 * relying on the model to emit markdown in a free-form text reply) prevents
 * local Qwen 3.6 35b from drifting on shape — the provider rejects the call
 * if the bullet count or rank layout is wrong, so the UI never has to parse
 * ambiguous prose.
 */
export const narrateTools: ToolDefinition[] = [
  {
    name: 'narrate_summary',
    description:
      'Finalize the answer. Call this ONCE, last, after your visualization is ready. ' +
      'Provide exactly 3 ranked bullets (rank 1 = biggest finding). ' +
      'Each bullet has a bold subject (headline), an optional signed numeric value like "+11.59" or "-6.2%", ' +
      'and 1-2 sentences of body. Include a caveat when the sample is small, the metric is filter-sensitive, ' +
      'or the data has known gaps.',
    inputSchema: {
      type: 'object',
      properties: {
        bullets: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              rank: {
                type: 'integer',
                enum: [1, 2, 3],
                description: 'Finding rank: 1 is the biggest, 3 is the smallest of the top three.',
              },
              headline: {
                type: 'string',
                description: 'Bold subject phrase, e.g. "G Gambhir" or "Q4 revenue"',
              },
              value: {
                type: 'string',
                description: 'Optional signed numeric highlight, e.g. "+11.59" or "-6.2%"',
              },
              body: {
                type: 'string',
                description: '1-2 sentences of context',
              },
            },
            required: ['rank', 'headline', 'body'],
          },
        },
        caveat: {
          type: 'string',
          description: 'Optional interpretation note — sample-size warning, filter sensitivity, methodology caveat.',
        },
      },
      required: ['bullets'],
    },
  },
];
