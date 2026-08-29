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

type Conversation = { id: string; companyId: string; instanceId: string; contactId: string };

// Payload for a delayed `whatsapp.outbound` job that continues a flow after a Wait node —
// kept 100% JSON-serializable since BullMQ persists it in Redis (survives a worker restart,
// unlike an in-process `setTimeout`/`await sleep`, which a redeploy would silently lose along
// with every remaining effect of the flow).
export type FlowResumeJobData = {
  conversation: Conversation;
  flowId: string;
  executionId: string;
  effects: EngineEffect[];
  finalStatus: FlowExecutionStatus;
  waitingNodeId: string | null;
};

async function sendOneEffect(
  prisma: PrismaClient,
  outboundQueue: Queue,
  realtime: RealtimePublisher,
  conversation: Conversation,
  flowId: string,
  executionId: string,
  effect: EngineEffect,
) {
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

// Sends effects in order. A Wait node's delay is never awaited in-process — instead, as soon
// as an effect with `delayMs > 0` comes up, the REST of the batch is handed to a delayed
// `flow-resume` job (see OutboundWorker) and this call returns immediately, leaving the
// execution parked at WAITING_TIMER. That delayed job re-enters this same function once BullMQ
// fires it, so a flow with several Wait nodes in a row just keeps re-scheduling itself — a
// multi-day "esperar 2 días" step survives redeploys/crashes exactly like any other queued
// WhatsApp send already does, instead of being lost the moment the process restarts.
async function dispatchEffects(
  prisma: PrismaClient,
  outboundQueue: Queue,
  realtime: RealtimePublisher,
  conversation: Conversation,
  flowId: string,
  executionId: string,
  effects: EngineEffect[],
  finalStatus: FlowExecutionStatus,
  waitingNodeId: string | null,
) {
  for (let i = 0; i < effects.length; i += 1) {
    const effect = effects[i];
    if (effect.delayMs > 0) {
      const payload: FlowResumeJobData = {
        conversation, flowId, executionId,
        effects: effects.slice(i),
        finalStatus, waitingNodeId,
      };
      await outboundQueue.add('flow-resume', payload, {
        delay: effect.delayMs,
        jobId: `flow-resume-${executionId}-${effect.nodeId}-${effect.blockId}`,
        removeOnComplete: 5000,
        removeOnFail: 5000,
      });
      await prisma.flowExecution.update({ where: { id: executionId }, data: { status: FlowExecutionStatus.WAITING_TIMER } });
      return;
    }
    await sendOneEffect(prisma, outboundQueue, realtime, conversation, flowId, executionId, effect);
  }
  await prisma.flowExecution.update({ where: { id: executionId }, data: { status: finalStatus, currentNodeId: waitingNodeId } });
}

// Entry point for the delayed `flow-resume` job (see OutboundWorker.process). The due effect's
// own `delayMs` already elapsed while the job sat in the queue, so it's sent right away; any
// effects after it go back through the normal dispatchEffects loop, which pauses again on the
// next Wait node if there is one.
export async function resumeFlowDispatch(
  prisma: PrismaClient,
  outboundQueue: Queue,
  realtime: RealtimePublisher,
  logger: Logger,
  data: FlowResumeJobData,
) {
  const execution = await prisma.flowExecution.findUnique({ where: { id: data.executionId }, select: { status: true } });
  // The execution could have been cancelled/reset in the meantime (e.g. the flow was deleted,
  // or the conversation got a fresh trigger) — don't resurrect it.
  if (!execution || execution.status !== FlowExecutionStatus.WAITING_TIMER) return;

  const [due, ...rest] = data.effects;
  try {
    await sendOneEffect(prisma, outboundQueue, realtime, data.conversation, data.flowId, data.executionId, due);
    await dispatchEffects(prisma, outboundQueue, realtime, data.conversation, data.flowId, data.executionId, rest, data.finalStatus, data.waitingNodeId);
  } catch (error) {
    logger.warn({ err: error, conversationId: data.conversation.id, flowId: data.flowId }, 'Flow resume-from-wait failed mid-run');
    await prisma.flowExecution.update({ where: { id: data.executionId }, data: { status: FlowExecutionStatus.CANCELLED } }).catch(() => undefined);
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
    if (!result.effects.length) {
      // Ninguna opción coincidió y el menú no tiene una arista "Sin respuesta" — no hay nada
      // que enviar. Se cierra la ejecución para que el mensaje caiga a la respuesta de IA en
      // vez de quedar "atendido" por una automatización que en realidad no contestó nada.
      await prisma.flowExecution.update({ where: { id: activeExecution.id }, data: { status: FlowExecutionStatus.CANCELLED } }).catch(() => undefined);
      return false;
    }
    try {
      await dispatchEffects(prisma, outboundQueue, realtime, conversation, activeExecution.flowId, activeExecution.id, result.effects, nextExecutionStatus(result), result.waitingNodeId ?? null);
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
    await dispatchEffects(prisma, outboundQueue, realtime, conversation, flow.id, execution.id, result.effects, nextExecutionStatus(result), result.waitingNodeId ?? null);
  } catch (error) {
    logger.warn({ err: error, conversationId, flowId: flow.id }, 'Flow execution failed mid-run');
    await prisma.flowExecution.update({ where: { id: execution.id }, data: { status: FlowExecutionStatus.CANCELLED } }).catch(() => undefined);
  }

  return true;
}
