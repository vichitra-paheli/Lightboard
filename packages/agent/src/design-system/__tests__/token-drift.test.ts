import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Token-drift guard.
 *
 * `packages/agent/src/design-system/tokens.css` is a copy of the `:root` block
 * in `apps/web/src/styles/globals.css` — which is itself the in-repo mirror of
 * `Lightboard-design/colors_and_type.css`. This test fails CI if the two
 * in-repo copies drift so the agent's system prompt never references stale
 * tokens the web app no longer defines.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Extract just the first `:root { ... }` declaration block from a CSS string.
 * Whitespace-tolerant brace matching — CSS lexing isn't needed for this check.
 */
function extractRootBlock(css: string): string {
  const start = css.indexOf(':root');
  if (start < 0) throw new Error('No :root block found');
  const open = css.indexOf('{', start);
  if (open < 0) throw new Error('Malformed :root block (no opening brace)');

  let depth = 0;
  let end = -1;
  for (let i = open; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error('Malformed :root block (unbalanced braces)');
  return css.slice(open + 1, end);
}

/**
 * Parse a `--name: value;` declaration list into a map. Stripping comments and
 * whitespace up front means the diff doesn't flare on cosmetic reformats.
 */
function parseDecls(body: string): Map<string, string> {
  const decls = new Map<string, string>();
  // Strip block comments.
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rawLine of stripped.split(';')) {
    const line = rawLine.trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).trim();
    if (!name.startsWith('--')) continue;
    const value = line.slice(colon + 1).trim().replace(/\s+/g, ' ');
    decls.set(name, value);
  }
  return decls;
}

describe('token-drift', () => {
  it('tokens.css :root block matches apps/web/src/styles/globals.css :root block', () => {
    const tokensCss = readFileSync(join(HERE, '..', 'tokens.css'), 'utf8');
    const globalsCss = readFileSync(
      join(HERE, '..', '..', '..', '..', '..', 'apps', 'web', 'src', 'styles', 'globals.css'),
      'utf8',
    );

    const tokensDecls = parseDecls(extractRootBlock(tokensCss));
    const globalsDecls = parseDecls(extractRootBlock(globalsCss));

    const missingInTokens = [...globalsDecls.keys()].filter((k) => !tokensDecls.has(k));
    const extraInTokens = [...tokensDecls.keys()].filter((k) => !globalsDecls.has(k));
    const valueMismatches: Array<{ name: string; tokens: string; globals: string }> = [];
    for (const [name, value] of tokensDecls) {
      const g = globalsDecls.get(name);
      if (g !== undefined && g !== value) {
        valueMismatches.push({ name, tokens: value, globals: g });
      }
    }

    if (missingInTokens.length || extraInTokens.length || valueMismatches.length) {
      const lines: string[] = [
        'packages/agent/src/design-system/tokens.css has drifted from',
        'apps/web/src/styles/globals.css. Re-copy the :root block and retry.',
        '',
      ];
      if (missingInTokens.length) {
        lines.push('Missing from tokens.css:');
        for (const n of missingInTokens) lines.push(`  ${n}: ${globalsDecls.get(n)}`);
      }
      if (extraInTokens.length) {
        lines.push('Only in tokens.css (remove or add to globals.css):');
        for (const n of extraInTokens) lines.push(`  ${n}: ${tokensDecls.get(n)}`);
      }
      if (valueMismatches.length) {
        lines.push('Value mismatches:');
        for (const { name, tokens, globals } of valueMismatches) {
          lines.push(`  ${name}: tokens.css=${tokens} globals.css=${globals}`);
        }
      }
      throw new Error(lines.join('\n'));
    }

    expect(tokensDecls.size).toBe(globalsDecls.size);
  });
});
