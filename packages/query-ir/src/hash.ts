import { createHash } from 'node:crypto';
import type { QueryIR } from './types';

/**
 * Produces a stable SHA-256 hash of a QueryIR for use as a cache key.
 * The IR is serialized with sorted keys to ensure deterministic output.
 */
export function hash(ir: QueryIR): string {
  const json = JSON.stringify(ir, Object.keys(ir).sort());
  return createHash('sha256').update(json).digest('hex');
}
