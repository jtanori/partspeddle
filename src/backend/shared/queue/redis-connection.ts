import { Redis } from 'ioredis';

/**
 * Shared Redis connection for all BullMQ queues and workers.
 *
 * Uses a singleton pattern to avoid connection proliferation.
 * ioredis handles reconnection automatically.
 */
let sharedRedis: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!sharedRedis) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    sharedRedis = new Redis(url, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,    // Required by BullMQ
    });

    sharedRedis.on('error', (_err: Error) => {
       
      console.error('Redis connection error:', _err.message);
    });
  }

  return sharedRedis;
}

/**
 * Close the shared Redis connection.
 * Used primarily during graceful shutdown and tests.
 */
export async function closeRedisConnection(): Promise<void> {
  if (sharedRedis) {
    await sharedRedis.quit();
    sharedRedis = null;
  }
}
