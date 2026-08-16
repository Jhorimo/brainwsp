import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

export const config = {
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  // Must be unique per running worker. A duplicate ID would defeat the Redis lease.
  workerId: process.env.WORKER_ID || `wa-${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`,
  concurrency: Number(process.env.WORKER_CONCURRENCY || 20),
  logLevel: process.env.LOG_LEVEL || 'info',
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'brainwsp',
    secretKey: process.env.MINIO_SECRET_KEY || 'brainwsp-local-password',
    bucket: process.env.MINIO_BUCKET || 'brainwsp-media',
  },
};
