export const CACHE_KEY = {
  productsList: 'products:list',
  product: (id: number) => `product:${id}`,
  writeBehindPending: 'wb:pending',
} as const;

export const CACHE_TTL = {
  productsList: 30,
  product: 60,
} as const;

export const CACHE_EVENT = {
  cacheHit: 'cache_hit',
  cacheMiss: 'cache_miss',
  dbRead: 'db_read',
  dbWrite: 'db_write',
  redisSet: 'redis_set',
  invalidate: 'invalidate',
  flushQueued: 'flush_queued',
  flushSucceeded: 'flush_succeeded',
} as const;

export type CacheEvent = (typeof CACHE_EVENT)[keyof typeof CACHE_EVENT];

export const CACHE_STRATEGY = {
  cacheAside: 'cache-aside',
  writeThrough: 'write-through',
  writeBehind: 'write-behind',
} as const;

export type CacheStrategy =
  (typeof CACHE_STRATEGY)[keyof typeof CACHE_STRATEGY];
