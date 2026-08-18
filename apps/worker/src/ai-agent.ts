import Anthropic from '@anthropic-ai/sdk';
import { MessageDirection, MessageStatus, MessageType, type PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { Logger } from 'pino';
import { config } from './config.js';
import type { RealtimePublisher } from './realtime.js';

const DEFAULT_SYSTEM_PROMPT = 'Eres un asistente de atención al cliente por WhatsApp. Responde de forma breve, clara y amable, en español. Si no sabes algo o el cliente pide algo que se sale de tu alcance, dilo con honestidad y ofrece derivar con un asesor humano.';
const HISTORY_LIMIT = 12;
const KNOWLEDGE_LIMIT = 40;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

// Runs after every inbound message. No-ops unless the conversation has the AI toggle on
// (agent-set from the dashboard) and an ANTHROPIC_API_KEY is configured — both are
// required so this stays inert by default in installs that haven't opted in.
export async function maybeReplyWithAi(
  prisma: PrismaClient,
  outboundQueue: Queue,
  realtime: RealtimePublisher,
  logger: Logger,
  conversationId: string,
) {
  const anthropic = getClient();
  if (!anthropic) return;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      aiEnabled: true,
      companyId: true,
      instanceId: true,
      contactId: true,
      company: { select: { name: true, aiSystemPrompt: true } },
    },
  });
  if (!conversation?.aiEnabled) return;

  const history = await prisma.message.findMany({
    where: { conversationId, type: MessageType.TEXT },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
    select: { direction: true, body: true },
  });
  if (!history.length) return;

  const transcript = history
    .reverse()
    .filter((item) => !!item.body?.trim())
    .map((item) => ({
      role: item.direction === MessageDirection.INBOUND ? ('user' as const) : ('assistant' as const),
      content: item.body as string,
    }));
  // Only reply when the customer has the last word — otherwise we'd be replying to
  // ourselves (e.g. after a reconnect replays already-answered history).
  if (!transcript.length || transcript[transcript.length - 1].role !== 'user') return;

  const knowledge = await prisma.knowledgeEntry.findMany({
    where: { companyId: conversation.companyId },
    orderBy: { createdAt: 'desc' },
    take: KNOWLEDGE_LIMIT,
    select: { title: true, content: true },
  });
  const knowledgeBlock = knowledge.length
    ? `\n\nInformación de referencia sobre la empresa (úsala para responder con precisión; si la pregunta no está cubierta aquí, dilo con honestidad en vez de inventar):\n${knowledge.map((entry) => `- ${entry.title}: ${entry.content}`).join('\n')}`
    : '';
  const system = (conversation.company.aiSystemPrompt?.trim() || `${DEFAULT_SYSTEM_PROMPT} Trabajas para ${conversation.company.name}.`) + knowledgeBlock;

  let reply = '';
  try {
    const response = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: 500,
      system,
      messages: transcript,
    });
    reply = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('').trim();
  } catch (error) {
    logger.warn({ err: error, conversationId }, 'AI reply generation failed');
    return;
  }
  if (!reply) return;

  const message = await prisma.message.create({
    data: {
      companyId: conversation.companyId,
      conversationId: conversation.id,
      instanceId: conversation.instanceId,
      contactId: conversation.contactId,
      direction: MessageDirection.OUTBOUND,
      type: MessageType.TEXT,
      status: MessageStatus.QUEUED,
      body: reply,
      metadata: { aiGenerated: true },
    },
    include: { author: { select: { id: true, name: true, pushName: true } } },
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
