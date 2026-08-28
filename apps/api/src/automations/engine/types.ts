// Shape of `Flow.graph` — the whole diagram serialized as one JSON blob (see the comment on
// the Flow model in schema.prisma for why: no nodes/edges tables, so new node types never
// need a migration). `schemaVersion` exists so a future shape change can migrate old graphs
// on read instead of breaking them.
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

// Only START and CONTENT ship in this phase. The union stays open (`FlowNode` below) so a
// graph saved by a future node type (menu, remarketing, pago) still round-trips through the
// API untouched instead of getting rejected — the engine just stops there (see run-flow.ts)
// until that node type's execution logic is built.
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
  // Milliseconds to wait before this effect fires, counted from the previous one — mirrors
  // the "Retraso" blocks between content in the editor. A consumer can honor it (simulator
  // replay) or ignore it and dispatch immediately (nothing does that today).
  delayMs: number;
};

export type EngineResult = {
  effects: EngineEffect[];
  // COMPLETED: reached the end of the graph (no next node). WAITING_INPUT: stopped at a node
  // this phase doesn't know how to run yet (menu/pago/remarketing) — reserved for when those
  // land in a later phase; nothing produces it today since only START/CONTENT exist.
  status: 'COMPLETED' | 'WAITING_INPUT';
  context: Record<string, unknown>;
};
