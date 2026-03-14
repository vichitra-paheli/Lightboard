import { redis } from './redis';

/** Rate limit bucket configurations. */
const BUCKETS = {
  api: { max: 100, windowSec: 60 },
  query: { max: 20, windowSec: 60 },
} as const;

type BucketType = keyof typeof BUCKETS;

/** Result of a rate limit check. */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Token bucket rate limiter backed by Redis.
 * Uses a Lua script for atomic check-and-decrement.
 */
const LUA_SCRIPT = `
  local key = KEYS[1]
  local max = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])

  local data = redis.call('HMGET', key, 'tokens', 'last')
  local tokens = tonumber(data[1])
  local last = tonumber(data[2])

  if tokens == nil then
    tokens = max
    last = now
  end

  local elapsed = now - last
  local refill = elapsed * (max / window)
  tokens = math.min(max, tokens + refill)
  last = now

  local allowed = 0
  if tokens >= 1 then
    tokens = tokens - 1
    allowed = 1
  end

  redis.call('HMSET', key, 'tokens', tokens, 'last', last)
  redis.call('EXPIRE', key, window * 2)

  return {allowed, math.floor(tokens), last + window}
`;

/** Checks and consumes a rate limit token for the given org and bucket type. */
export async function checkRateLimit(
  orgId: string,
  bucket: BucketType,
): Promise<RateLimitResult> {
  const config = BUCKETS[bucket];
  const key = `ratelimit:${orgId}:${bucket}`;
  const now = Date.now() / 1000;

  const [allowed, remaining, resetAt] = (await redis.eval(
    LUA_SCRIPT,
    1,
    key,
    config.max,
    config.windowSec,
    now,
  )) as [number, number, number];

  return {
    allowed: allowed === 1,
    limit: config.max,
    remaining,
    resetAt: Math.ceil(resetAt),
  };
}

/** Adds rate limit headers to a Response. */
export function addRateLimitHeaders(headers: Headers, result: RateLimitResult): void {
  headers.set('X-RateLimit-Limit', String(result.limit));
  headers.set('X-RateLimit-Remaining', String(result.remaining));
  headers.set('X-RateLimit-Reset', String(result.resetAt));
}
