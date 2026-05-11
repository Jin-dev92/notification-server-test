export const CACHE_KEY = {
  productsList: 'products:list',
  product: (id: number) => `product:${id}`,
  writeBehindPending: 'wb:pending',
} as const;

export const CACHE_TTL = {
  productsList: 30,
  product: 60,
} as const;

export type CacheEvent =
  | 'cache_hit'
  | 'cache_miss'
  | 'db_read'
  | 'db_write'
  | 'redis_set'
  | 'invalidate'
  | 'flush_queued'
  | 'flush_succeeded';
