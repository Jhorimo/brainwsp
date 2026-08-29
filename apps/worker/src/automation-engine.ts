import { FlowExecutionStatus, MessageDirection, MessageStatus, MessageType, type PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { Logger } from 'pino';
import { matchesKeyword } from './flow-engine/keyword-match.js';
import { resumeFlow, runFlow } from './flow-engine/run-flow.js';
import type { EngineEffect, EngineResult, FlowGraph } from './flow-engine/types.js';
import type { RealtimePublisher } from './realtime.js';

const KIND_TO_MESSAGE_TYPE: Record<EngineEffect['kind'], MessageType> = {
  text: MessageType.TEXT,
  image: MessageType.IMAGE,
  video: MessageType.VIDEO,
  audio: MessageType.AUDIO,
  file: MessageType.DOCUMENT,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Conversation = { id: string; companyId: string; instanceId: string; contactId: string };

// Sends each effect for real (Message row + `whatsapp.outbound` job + realtime publish), with
// real delays between them — used by both a fresh trigger and a resumed menu answer, so a
// paused-then-continued flow behaves identically to one that ran straight through.
async function dispatchEffects(
  prisma: PrismaClient,
  outboundQueue: Queue,
  realtime: RealtimePublisher,
  conversation: Conversation,
  flowId: string,
  executionId: string,
  effects: EngineEffect[],
) {
  for (const effect of effects) {
    if (effect.delayMs > 0) await sleep(effect.delayMs);

    const message = await prisma.message.create({
      data: {
        companyId: conversation.companyId,
        conversationId: conversation.id,
        instanceId: conversation.instanceId,
        contactId: conversation.contactId,
        direction: MessageDirection.OUTBOUND,
        type: KIND_TO_MESSAGE_TYPE[effect.kind],
        status: MessageStatus.QUEUED,
        body: effect.text || null,
        mediaUrl: effect.mediaUrl || null,
        mimeType: effect.mimeType || null,
        caption: effect.caption || null,
        fileName: effect.fileName || null,
        metadata: { flowId, flowExecutionId: executionId },
      },
    });

    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });

    await outboundQueue.add('send-text', { messageId: message.id }, {
      jobId: message.id,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 5000,
      removeOnFail: 5000,
    });

    const hydrated = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      include: {
        contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true, avatarUrl: true } },
        assignedUser: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        instance: { select: { id: true, name: true, slug: true, status: true } },
      },
    });
    if (hydrated) await realtime.publish(conversation.companyId, 'message.created', { message, conversation: { ...hydrated, messages: [message] } });
  }
}

function nextExecutionStatus(result: EngineResult) {
  return result.status === 'COMPLETED' ? FlowExecutionStatus.COMPLETED : FlowExecutionStatus.WAITING_INPUT;
}

// Runs after every inbound message, right alongside maybeReplyWithAi in ai-agent.ts — same
// fire-and-forget hook, same "stays inert unless something opted in" shape. Returns whether a
// flow actually fired (fresh trigger OR a paused menu resumed), so the caller can skip the AI
// auto-reply for the same inbound message — an explicit automation should win over a generic
// AI reply, not race it.
export async function maybeRunFlow(
  prisma: PrismaClient,
  outboundQueue: Queue,
  realtime: RealtimePublisher,
  logger: Logger,
  conversationId: string,
): Promise<boolean> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, companyId: true, instanceId: true, contactId: true },
  });
  if (!conversation) return false;

  const lastInbound = await prisma.message.findFirst({
    where: { conversationId, direction: MessageDirection.INBOUND, type: MessageType.TEXT },
    orderBy: { createdAt: 'desc' },
    select: { body: true },
  });
  if (!lastInbound?.body) return false;

  // Un flujo a la vez por conversación — mismo espíritu que el lease de Redis del Session
  // Manager para no tener dos sockets sobre la misma instancia. Si ya hay uno esperando una
  // respuesta de menú, ESTE mensaje entrante es esa respuesta — se retoma en vez de evaluar
  // palabras clave de nuevo.
  const activeExecution = await prisma.flowExecution.findFirst({
    where: { conversationId, status: { in: [FlowExecutionStatus.RUNNING, FlowExecutionStatus.WAITING_INPUT, FlowExecutionStatus.WAITING_TIMER] } },
    include: { flow: true },
  });

  if (activeExecution) {
    if (activeExecution.status !== FlowExecutionStatus.WAITING_INPUT || !activeExecution.currentNodeId) return false;

    const result = resumeFlow(activeExecution.flow.graph as unknown as FlowGraph, activeExecution.currentNodeId, lastInbound.body);
    try {
      await dispatchEffects(prisma, outboundQueue, realtime, conversation, activeExecution.flowId, activeExecution.id, result.effects);
      await prisma.flowExecution.update({
        where: { id: activeExecution.id },
        data: { status: nextExecutionStatus(result), currentNodeId: result.waitingNodeId },
      });
    } catch (error) {
      logger.warn({ err: error, conversationId, flowId: activeExecution.flowId }, 'Flow resume failed mid-run');
      await prisma.flowExecution.update({ where: { id: activeExecution.id }, data: { status: FlowExecutionStatus.CANCELLED } }).catch(() => undefined);
    }
    return true;
  }

  const candidates = await prisma.flow.findMany({
    where: { companyId: conversation.companyId, active: true, instances: { some: { id: conversation.instanceId } } },
  });
  const flow = candidates.find((item) => matchesKeyword(item.triggerKeywords, lastInbound.body as string));
  if (!flow) return false;

  const result = runFlow(flow.graph as unknown as FlowGraph);
  if (!result.effects.length) return false;

  const execution = await prisma.flowExecution.create({
    data: { companyId: conversation.companyId, flowId: flow.id, conversationId: conversation.id, status: FlowExecutionStatus.RUNNING },
  });

  try {
    await dispatchEffects(prisma, outboundQueue, realtime, conversation, flow.id, execution.id, result.effects);
    await prisma.flowExecution.update({
      where: { id: execution.id },
      data: { status: nextExecutionStatus(result), currentNodeId: result.waitingNodeId },
    });
  } catch (error) {
    logger.warn({ err: error, conversationId, flowId: flow.id }, 'Flow execution failed mid-run');
    await prisma.flowExecution.update({ where: { id: execution.id }, data: { status: FlowExecutionStatus.CANCELLED } }).catch(() => undefined);
  }

  return true;
}
