import type { ContentNode, FlowGraph, FlowNode, MenuNode, StartNode, WaitNode } from './types';

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

// Single-output nodes (start/content/wait) save their edge with no `sourceHandle` — pass none
// to match that. Multi-output nodes (menu) need the specific handle (the option's id, or
// NO_RESPONSE_HANDLE) to pick the right one among several leaving the same node.
export function nextNodeId(graph: FlowGraph, nodeId: string, handle?: string): string | undefined {
  return graph.edges.find((edge) => edge.source === nodeId && (handle === undefined ? !edge.sourceHandle : edge.sourceHandle === handle))?.target;
}

export function isContentNode(node: FlowNode | undefined): node is ContentNode {
  return !!node && node.type === 'content';
}

export function isWaitNode(node: FlowNode | undefined): node is WaitNode {
  return !!node && node.type === 'wait';
}

export function isMenuNode(node: FlowNode | undefined): node is MenuNode {
  return !!node && node.type === 'menu';
}
