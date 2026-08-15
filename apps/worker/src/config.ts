import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

export const config = {
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  // Must be unique per running worker. A duplicate ID would defeat the Redis lease.
  workerId: process.env.WORKER_ID || `wa-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`,
  concurrency: Number(process.env.WORKER_CONCURRENCY || 20),
  logLevel: process.env.LOG_LEVEL || 'info',
};
