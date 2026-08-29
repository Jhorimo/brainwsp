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

// "Temporizador" — pauses the flow for a fixed duration before continuing to whatever it's
// connected to. Executes exactly like a `delay` content block (see run-flow.ts), just as its
// own visual node instead of nested inside a message sequence.
export type WaitNode = {
  id: string;
  type: 'wait';
  position: NodePosition;
  data: { seconds: number };
};

export type MenuOption = { id: string; text: string };

// The first node type that genuinely branches. Sends `prompt` + a numbered list of `options`
// as one text message, then the engine STOPS (see run-flow.ts) — resuming requires the
// customer's next message, matched against the options (see resumeFlow / matchMenuOption).
// Each option is its own outgoing edge, identified by `sourceHandle === option.id`; a reply
// that matches nothing follows the edge with `sourceHandle === NO_RESPONSE_HANDLE`, if any.
export type MenuNode = {
  id: string;
  type: 'menu';
  position: NodePosition;
  data: { label: string; prompt: string; options: MenuOption[] };
};

export const NO_RESPONSE_HANDLE = 'no-response';

// Only START, CONTENT, WAIT and MENU ship in this phase. The union stays open (`FlowNode`
// below) so a graph saved by a future node type (remarketing, pago) still round-trips through
// the API untouched instead of getting rejected — the engine just stops there (see
// run-flow.ts) until that node type's execution logic is built.
export type FlowNode = StartNode | ContentNode | WaitNode | MenuNode | { id: string; type: string; position: NodePosition; data: unknown };

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
  // COMPLETED: reached the end of the graph (no next node). WAITING_INPUT: paused at a menu
  // node, waiting for the customer's reply — `waitingNodeId` says which one, so the caller can
  // resume from there (see resumeFlow) once the next inbound message arrives.
  status: 'COMPLETED' | 'WAITING_INPUT';
  waitingNodeId?: string;
  context: Record<string, unknown>;
};
