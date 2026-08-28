import type { ContentNode, FlowGraph, FlowNode, StartNode } from './types';

export function emptyGraph(): FlowGraph {
  const start: StartNode = { id: 'start', type: 'start', position: { x: 80, y: 200 }, data: {} };
  return { schemaVersion: 1, nodes: [start], edges: [] };
}

export function findStartNode(graph: FlowGraph): StartNode | undefined {
  return graph.nodes.find((node): node is StartNode => node.type === 'start');
}

export function findNode(graph: FlowGraph, nodeId: string): FlowNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

// v1 nodes have at most one outgoing edge (no branching yet — see EngineResult.status in
// types.ts), so "the next node" is unambiguous: the target of the first edge leaving it.
export function nextNodeId(graph: FlowGraph, nodeId: string): string | undefined {
  return graph.edges.find((edge) => edge.source === nodeId)?.target;
}

export function isContentNode(node: FlowNode | undefined): node is ContentNode {
  return !!node && node.type === 'content';
}
