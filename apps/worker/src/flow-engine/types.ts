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

export type WaitNode = {
  id: string;
  type: 'wait';
  position: NodePosition;
  data: { seconds: number };
};

export type MenuOption = { id: string; text: string };

export type MenuNode = {
  id: string;
  type: 'menu';
  position: NodePosition;
  // 'buttons' sends real WhatsApp reply buttons instead of a numbered text list — capped at 3
  // by WhatsApp itself (see run-flow.ts), so it only actually renders as buttons when
  // options.length <= 3; beyond that it silently falls back to the numbered list. Undefined
  // (older saved graphs) behaves as 'list'.
  data: { label: string; prompt: string; options: MenuOption[]; displayMode?: 'list' | 'buttons' };
};

export const NO_RESPONSE_HANDLE = 'no-response';

export type FlowNode = StartNode | ContentNode | WaitNode | MenuNode | { id: string; type: string; position: NodePosition; data: unknown };

export type FlowEdge = { id: string; source: string; target: string; sourceHandle?: string | null };

export type ContentBlock =
  | { id: string; kind: 'text'; text: string }
  | { id: string; kind: 'image'; mediaUrl: string; mimeType?: string; caption?: string; fileName?: string }
  | { id: string; kind: 'video'; mediaUrl: string; mimeType?: string; caption?: string; fileName?: string }
  | { id: string; kind: 'audio'; mediaUrl: string; mimeType?: string; fileName?: string }
  | { id: string; kind: 'file'; mediaUrl: string; mimeType?: string; fileName?: string }
  | { id: string; kind: 'contact'; contactName: string; contactPhone: string; contactCompany?: string }
  // Suprime automatizaciones + respuesta de IA para este contacto durante `seconds` — ver el
  // gate en session-manager.ts, justo antes de maybeRunFlow/maybeReplyWithAi.
  | { id: string; kind: 'autooff'; seconds: number }
  | { id: string; kind: 'delay'; seconds: number };

export type EngineEffect = {
  nodeId: string;
  blockId: string;
  kind: 'text' | 'image' | 'video' | 'audio' | 'file' | 'contact' | 'autooff';
  text?: string;
  mediaUrl?: string;
  mimeType?: string;
  caption?: string;
  fileName?: string;
  contactName?: string;
  contactPhone?: string;
  contactCompany?: string;
  autooffSeconds?: number;
  // Presente solo en el prompt de un nodo Menú con displayMode: 'buttons' (y <= 3 opciones) —
  // ver sendOneEffect en automation-engine.ts, que lo traduce a un mensaje `buttons` real de
  // Baileys en vez de texto plano.
  buttons?: MenuOption[];
  delayMs: number;
};

export type EngineResult = {
  effects: EngineEffect[];
  status: 'COMPLETED' | 'WAITING_INPUT';
  waitingNodeId?: string;
  context: Record<string, unknown>;
};
