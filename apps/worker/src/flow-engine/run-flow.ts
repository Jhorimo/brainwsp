import { findNode, findStartNode, isContentNode, isMenuNode, isWaitNode, nextNodeId } from './graph.js';
import { NO_RESPONSE_HANDLE, type EngineEffect, type EngineResult, type FlowGraph, type MenuOption } from './types.js';

const MAX_STEPS = 200;

function walk(graph: FlowGraph, startId: string | undefined): EngineResult {
  const effects: EngineEffect[] = [];
  const context: Record<string, unknown> = {};
  let currentId = startId;
  let steps = 0;
  let pendingDelayMs = 0;

  while (currentId && steps < MAX_STEPS) {
    steps += 1;
    const node = findNode(graph, currentId);
    if (!node) break;

    if (isWaitNode(node)) {
      pendingDelayMs += Math.max(0, node.data.seconds) * 1000;
      currentId = nextNodeId(graph, node.id);
      continue;
    }

    if (isMenuNode(node)) {
      // WhatsApp's real reply-buttons message caps at 3 buttons — beyond that (or in 'list'
      // mode) it falls back to the numbered text list, same as always.
      const useButtons = node.data.displayMode === 'buttons' && node.data.options.length > 0 && node.data.options.length <= 3;
      const numbered = useButtons ? '' : node.data.options.map((option, index) => `${index + 1}. ${option.text}`).join('\n');
      effects.push({
        nodeId: node.id,
        blockId: 'menu-prompt',
        kind: 'text',
        delayMs: pendingDelayMs,
        text: numbered ? `${node.data.prompt}\n\n${numbered}` : node.data.prompt,
        ...(useButtons ? { buttons: node.data.options } : {}),
      });
      return { effects, status: 'WAITING_INPUT', waitingNodeId: node.id, context };
    }

    if (!isContentNode(node)) {
      return { effects, status: 'WAITING_INPUT', context };
    }

    for (const block of node.data.blocks) {
      if (block.kind === 'delay') {
        pendingDelayMs += Math.max(0, block.seconds) * 1000;
        continue;
      }
      effects.push({
        nodeId: node.id,
        blockId: block.id,
        kind: block.kind,
        delayMs: pendingDelayMs,
        ...(block.kind === 'text' ? { text: block.text } : {}),
        ...(block.kind === 'image' || block.kind === 'video' ? { mediaUrl: block.mediaUrl, mimeType: block.mimeType, caption: block.caption, fileName: block.fileName } : {}),
        ...(block.kind === 'audio' ? { mediaUrl: block.mediaUrl, mimeType: block.mimeType, fileName: block.fileName } : {}),
        ...(block.kind === 'file' ? { mediaUrl: block.mediaUrl, mimeType: block.mimeType, fileName: block.fileName } : {}),
        ...(block.kind === 'contact' ? { contactName: block.contactName, contactPhone: block.contactPhone, contactCompany: block.contactCompany } : {}),
        ...(block.kind === 'autooff' ? { autooffSeconds: block.seconds } : {}),
      });
      pendingDelayMs = 0;
    }

    currentId = nextNodeId(graph, node.id);
  }

  return { effects, status: 'COMPLETED', context };
}

export function runFlow(graph: FlowGraph): EngineResult {
  const start = findStartNode(graph);
  return walk(graph, start ? nextNodeId(graph, start.id) : undefined);
}

export function matchMenuOption(options: MenuOption[], reply: string): MenuOption | undefined {
  const trimmed = reply.trim();
  const asIndex = Number(trimmed);
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= options.length) return options[asIndex - 1];

  const lower = trimmed.toLowerCase();
  if (!lower) return undefined;
  return (
    options.find((option) => option.text.trim().toLowerCase() === lower) ||
    options.find((option) => option.text.trim() && lower.includes(option.text.trim().toLowerCase()))
  );
}

export function resumeFlow(graph: FlowGraph, waitingNodeId: string, reply: string): EngineResult & { matched: boolean } {
  const node = findNode(graph, waitingNodeId);
  if (!isMenuNode(node)) return { effects: [], status: 'COMPLETED', context: {}, matched: false };

  const matchedOption = matchMenuOption(node.data.options, reply);
  const handle = matchedOption ? matchedOption.id : NO_RESPONSE_HANDLE;
  const targetId = nextNodeId(graph, waitingNodeId, handle);
  if (!targetId) return { effects: [], status: 'COMPLETED', context: {}, matched: !!matchedOption };

  return { ...walk(graph, targetId), matched: !!matchedOption };
}
