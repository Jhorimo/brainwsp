import { findNode, findStartNode, isContentNode, nextNodeId } from './graph';
import type { EngineEffect, EngineResult, FlowGraph } from './types';

const MAX_STEPS = 200; // guards against a graph with a cycle looping forever

// Pure — no Prisma, no queues, no I/O. Walks the graph from the node right after START,
// collecting one effect per content block, until it runs off the end (COMPLETED) or hits a
// node type this phase doesn't execute yet (WAITING_INPUT — see types.ts). Both the
// production hook (worker, phase 2) and the editor's simulator call this exact function, so
// "what the simulator shows" and "what actually sends" can never drift apart.
export function runFlow(graph: FlowGraph): EngineResult {
  const start = findStartNode(graph);
  const effects: EngineEffect[] = [];
  const context: Record<string, unknown> = {};

  let currentId = start ? nextNodeId(graph, start.id) : undefined;
  let steps = 0;

  while (currentId && steps < MAX_STEPS) {
    steps += 1;
    const node = findNode(graph, currentId);
    if (!node) break;

    if (!isContentNode(node)) {
      // Unknown/future node type (menu, pago, remarketing) — stop here rather than guess.
      return { effects, status: 'WAITING_INPUT', context };
    }

    let pendingDelayMs = 0;
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
