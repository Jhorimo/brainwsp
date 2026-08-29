import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { config } from './config.js';
import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { RealtimePublisher } from './realtime.js';
import { SessionManager } from './session-manager.js';
import { OutboundWorker } from './outbound-worker.js';
import { CommandWorker } from './command-worker.js';
import { ensureBucket } from './storage.js';

const realtime = new RealtimePublisher();
const outboundQueueConnection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
const outboundQueue = new Queue('whatsapp.outbound', { connection: outboundQueueConnection });
const sessions = new SessionManager(prisma, realtime, logger, outboundQueue);
const outbound = new OutboundWorker(prisma, sessions, realtime, logger, outboundQueue);
const commands = new CommandWorker(sessions, logger);

async function start() {
  await prisma.$connect();
  await ensureBucket();
  await sessions.bootstrap();
  logger.info('BrainWSP worker ready');
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down worker');
  await Promise.allSettled([commands.close(), outbound.close()]);
  await sessions.close();
  await realtime.close();
  await Promise.allSettled([outboundQueue.close(), outboundQueueConnection.quit()]);
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start().catch(async (error) => {
  logger.fatal({ err: error }, 'worker failed to start');
  await prisma.$disconnect();
  process.exit(1);
});
