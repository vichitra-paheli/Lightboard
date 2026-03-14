import Redis from 'ioredis';

/** Singleton Redis client for rate limiting and caching. */
export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});
