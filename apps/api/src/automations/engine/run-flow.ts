import { findNode, findStartNode, isContentNode, isMenuNode, isWaitNode, nextNodeId } from './graph';
import { NO_RESPONSE_HANDLE, type EngineEffect, type EngineResult, type FlowGraph, type MenuOption } from './types';

const MAX_STEPS = 200; // guards against a graph with a cycle looping forever

// Pure — no Prisma, no queues, no I/O. Walks the graph starting at `currentId`, collecting one
// effect per content block, until it runs off the end (COMPLETED) or pauses at a menu node
// (WAITING_INPUT). Both the production hook (worker) and the editor's simulator call this
// exact function (via runFlow/resumeFlow below), so "what the simulator shows" and "what
// actually sends" can never drift apart.
function walk(graph: FlowGraph, startId: string | undefined): EngineResult {
  const effects: EngineEffect[] = [];
  const context: Record<string, unknown> = {};
  let currentId = startId;
  let steps = 0;
  // Accumulates across delay blocks, standalone "Temporizador" nodes, AND the numbered menu
  // prompt (which is itself sent as a plain text effect) — a Wait node contributes to the
  // delay of whatever the next real effect turns out to be.
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
      const numbered = node.data.options.map((option, index) => `${index + 1}. ${option.text}`).join('\n');
      effects.push({
        nodeId: node.id,
        blockId: 'menu-prompt',
        kind: 'text',
        delayMs: pendingDelayMs,
        text: numbered ? `${node.data.prompt}\n\n${numbered}` : node.data.prompt,
      });
      return { effects, status: 'WAITING_INPUT', waitingNodeId: node.id, context };
    }

    if (!isContentNode(node)) {
      // Unknown/future node type (remarketing, pago) — stop here rather than guess. Can't be
      // resumed (no handler knows how), so no `waitingNodeId`.
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

// Numeric replies ("1", "2") match by position; otherwise falls back to matching the reply
// against an option's own text (exact, then "reply contains option text") — same forgiving
// spirit as matchesKeyword.
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

// Continues a paused execution from the menu node it stopped at, using the customer's reply to
// pick which outgoing edge to follow. `matched: false` means the reply didn't match any option
// and there was no NO_RESPONSE_HANDLE edge to fall back to — the caller decides what that means
// (today: the execution just ends, see automation-engine.ts).
export function resumeFlow(graph: FlowGraph, waitingNodeId: string, reply: string): EngineResult & { matched: boolean } {
  const node = findNode(graph, waitingNodeId);
  if (!isMenuNode(node)) return { effects: [], status: 'COMPLETED', context: {}, matched: false };

  const matchedOption = matchMenuOption(node.data.options, reply);
  const handle = matchedOption ? matchedOption.id : NO_RESPONSE_HANDLE;
  const targetId = nextNodeId(graph, waitingNodeId, handle);
  if (!targetId) return { effects: [], status: 'COMPLETED', context: {}, matched: !!matchedOption };

  return { ...walk(graph, targetId), matched: !!matchedOption };
}
