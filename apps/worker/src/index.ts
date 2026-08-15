import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { RealtimePublisher } from './realtime.js';
import { SessionManager } from './session-manager.js';
import { OutboundWorker } from './outbound-worker.js';
import { CommandWorker } from './command-worker.js';

const realtime = new RealtimePublisher();
const sessions = new SessionManager(prisma, realtime, logger);
const outbound = new OutboundWorker(prisma, sessions, realtime, logger);
const commands = new CommandWorker(sessions, logger);

async function start() {
  await prisma.$connect();
  await sessions.bootstrap();
  logger.info('BrainWSP worker ready');
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down worker');
  await Promise.allSettled([commands.close(), outbound.close()]);
  await sessions.close();
  await realtime.close();
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
