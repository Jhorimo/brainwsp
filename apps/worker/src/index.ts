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

// Docker espera stop_grace_period (60s en prod) antes de matar el proceso. Si algo del cierre se
// cuelga, se sale igual a los 50s para que quede registrado en vez de un SIGKILL silencioso.
const SHUTDOWN_DEADLINE_MS = 50_000;
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down worker');
  setTimeout(() => {
    logger.error('shutdown took too long: forcing exit');
    process.exit(1);
  }, SHUTDOWN_DEADLINE_MS).unref();
  await Promise.allSettled([commands.close(), outbound.close()]);
  await sessions.close();
  await realtime.close();
  await Promise.allSettled([outboundQueue.close(), outboundQueueConnection.quit()]);
  await prisma.$disconnect();
  logger.info('worker stopped cleanly');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start().catch(async (error) => {
  logger.fatal({ err: error }, 'worker failed to start');
  await prisma.$disconnect();
  process.exit(1);
});
