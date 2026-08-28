// Kept in sync by hand with apps/api/src/automations/engine/types.ts — both apps run the
// exact same engine (see run-flow.ts) against the same `Flow.graph` JSON, so "what the editor's
// simulator shows" and "what actually sends on WhatsApp" never drift apart. Duplicated instead
// of extracted into a shared workspace package because that's more build/tooling wiring than
// the two call sites currently justify; worth revisiting if a third consumer shows up.
export type FlowGraph = {
  schemaVersion: 1;
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export type NodePosition = { x: number; y: number };

export type StartNode = {
  id: string;
  type: 'start';
  position: NodePosition;
  data: Record<string, never>;
};

export type ContentNode = {
  id: string;
  type: 'content';
  position: NodePosition;
  data: { label: string; blocks: ContentBlock[] };
};

export type FlowNode = StartNode | ContentNode | { id: string; type: string; position: NodePosition; data: unknown };

export type FlowEdge = { id: string; source: string; target: string; sourceHandle?: string | null };

export type ContentBlock =
  | { id: string; kind: 'text'; text: string }
  | { id: string; kind: 'image'; mediaUrl: string; mimeType?: string; caption?: string; fileName?: string }
  | { id: string; kind: 'video'; mediaUrl: string; mimeType?: string; caption?: string; fileName?: string }
  | { id: string; kind: 'audio'; mediaUrl: string; mimeType?: string; fileName?: string }
  | { id: string; kind: 'file'; mediaUrl: string; mimeType?: string; fileName?: string }
  | { id: string; kind: 'delay'; seconds: number };

export type EngineEffect = {
  nodeId: string;
  blockId: string;
  kind: 'text' | 'image' | 'video' | 'audio' | 'file';
  text?: string;
  mediaUrl?: string;
  mimeType?: string;
  caption?: string;
  fileName?: string;
  delayMs: number;
};

export type EngineResult = {
  effects: EngineEffect[];
  status: 'COMPLETED' | 'WAITING_INPUT';
  context: Record<string, unknown>;
};
