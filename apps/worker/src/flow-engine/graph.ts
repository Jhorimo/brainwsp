import type { ContentNode, FlowGraph, FlowNode, MenuNode, StartNode, WaitNode } from './types.js';

export function findStartNode(graph: FlowGraph): StartNode | undefined {
  return graph.nodes.find((node): node is StartNode => node.type === 'start');
}

export function findNode(graph: FlowGraph, nodeId: string): FlowNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

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
