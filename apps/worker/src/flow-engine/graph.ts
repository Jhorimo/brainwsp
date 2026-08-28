import type { ContentNode, FlowGraph, FlowNode, StartNode } from './types.js';

export function findStartNode(graph: FlowGraph): StartNode | undefined {
  return graph.nodes.find((node): node is StartNode => node.type === 'start');
}

export function findNode(graph: FlowGraph, nodeId: string): FlowNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

export function nextNodeId(graph: FlowGraph, nodeId: string): string | undefined {
  return graph.edges.find((edge) => edge.source === nodeId)?.target;
}

export function isContentNode(node: FlowNode | undefined): node is ContentNode {
  return !!node && node.type === 'content';
}
