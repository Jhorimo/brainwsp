import { API_URL, getToken } from '@/lib/api';

// Mirrors apps/api/src/automations/engine/types.ts. Duplicated rather than shared across the
// apps/api ↔ apps/web boundary — small enough that a shared package would be more ceremony
// than the two call sites it'd save.

export type ContentBlock =
  | { id: string; kind: 'text'; text: string }
  | { id: string; kind: 'image'; mediaUrl: string; mimeType?: string; caption?: string; fileName?: string }
  | { id: string; kind: 'video'; mediaUrl: string; mimeType?: string; caption?: string; fileName?: string }
  | { id: string; kind: 'audio'; mediaUrl: string; mimeType?: string; fileName?: string }
  | { id: string; kind: 'file'; mediaUrl: string; mimeType?: string; fileName?: string }
  | { id: string; kind: 'delay'; seconds: number };

export type StartNodeData = Record<string, never>;
export type ContentNodeData = { label: string; blocks: ContentBlock[] };

export type FlowNodeType = 'start' | 'content';

export type FlowFolder = { id: string; name: string };
export type FlowInstance = { id: string; name: string; phoneNumber?: string | null; displayName?: string | null };

export type FlowSummary = {
  id: string;
  name: string;
  triggerType: 'KEYWORD';
  triggerKeywords: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  folder: FlowFolder | null;
  instances: FlowInstance[];
};

export type FlowDetail = FlowSummary & {
  companyId: string;
  folderId: string | null;
  graph: { schemaVersion: 1; nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: unknown }>; edges: Array<{ id: string; source: string; target: string }> };
};

export type FlowStats = { total: number; active: number; withAi: number; shared: number };

export type SimulateEffect = {
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

// The upload response's `mediaUrl` is MinIO's internal URL (not browser-reachable) — this
// extracts the object name from it the same way quick-replies.controller.ts does, then routes
// through the automations media proxy instead of exposing MinIO directly. The proxy is
// JWT-guarded, and an <img>/<video>/<audio> tag can't send an Authorization header, so the
// token rides along as `?token=`, same as mediaUrl()/quickReplyFileUrl() in lib/api.ts.
export function blockMediaSrc(mediaUrl: string, mimeType?: string, fileName?: string) {
  const objectName = mediaUrl.split('/').pop();
  const params = new URLSearchParams();
  if (mimeType) params.set('mimeType', mimeType);
  if (fileName) params.set('fileName', fileName);
  params.set('token', getToken());
  return `${API_URL}/automations/media/${objectName}?${params.toString()}`;
}

export type SimulateResult = { triggered: boolean; effects: SimulateEffect[]; status: 'COMPLETED' | 'WAITING_INPUT'; context: Record<string, unknown> };

export function newBlockId() {
  return `blk_${Math.random().toString(36).slice(2, 10)}`;
}

export function newNodeId() {
  return `node_${Math.random().toString(36).slice(2, 10)}`;
}
