'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileText, Image as ImageIcon, Mic, MessageSquareText, Pencil, Play, Timer, Trash2, Video } from 'lucide-react';
import type { ContentBlock, ContentNodeData } from '../types';

const BLOCK_ICONS: Record<ContentBlock['kind'], typeof MessageSquareText> = {
  text: MessageSquareText,
  image: ImageIcon,
  video: Video,
  audio: Mic,
  file: FileText,
  delay: Timer,
};

function blockPreview(block: ContentBlock) {
  switch (block.kind) {
    case 'text': return block.text.trim() || '(vacío)';
    case 'delay': return `${block.seconds}s · pausa`;
    case 'image': return block.caption?.trim() || block.fileName || 'Imagen';
    case 'video': return block.caption?.trim() || block.fileName || 'Video';
    case 'audio': return block.fileName || 'Audio';
    case 'file': return block.fileName || 'Archivo';
    default: return '';
  }
}

export function StartNodeView({ data }: NodeProps) {
  const keywords = (data as { keywords?: string[] }).keywords || [];
  return (
    <div className="flow-node flow-node-start">
      <div className="flow-node-head">
        <div className="flow-node-icon start"><Play size={14} /></div>
        <div>
          <strong>INICIO</strong>
          <span>Entrada WhatsApp</span>
        </div>
        <span className="flow-node-badge start">START</span>
      </div>
      <div className="flow-node-body">
        {keywords.length ? keywords.map((keyword) => <span key={keyword} className="status-pill neutral" style={{ marginRight: 4, marginBottom: 4 }}>&quot;{keyword}&quot;</span>) : <span className="row-sub">Sin palabra clave</span>}
      </div>
      <div className="flow-node-foot"><span className="flow-node-dot" /> Iniciar flujo</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function ContentNodeView({ data, id }: NodeProps) {
  const nodeData = data as ContentNodeData & { onEdit?: (nodeId: string) => void; onDelete?: (nodeId: string) => void };
  const blocks = nodeData.blocks || [];
  const preview = blocks.slice(0, 4);
  const extra = blocks.length - preview.length;

  return (
    <div className="flow-node flow-node-content">
      <Handle type="target" position={Position.Left} />
      <div className="flow-node-head">
        <div className="flow-node-icon content"><MessageSquareText size={14} /></div>
        <div>
          <strong>{nodeData.label || 'Contenido'}</strong>
          <span>Mensaje de sesión</span>
        </div>
        <span className="flow-node-badge msg">MSG</span>
        <button type="button" className="icon-button ghost small nodrag flow-node-action" title="Editar contenido" onClick={() => nodeData.onEdit?.(id)}><Pencil size={13} /></button>
        <button type="button" className="icon-button ghost small nodrag flow-node-action" title="Eliminar nodo" onClick={() => nodeData.onDelete?.(id)}><Trash2 size={13} /></button>
      </div>
      <div className="flow-node-body">
        {preview.length === 0 && <span className="row-sub">Sin contenido — haz clic en editar</span>}
        {preview.map((block) => {
          const Icon = BLOCK_ICONS[block.kind];
          return (
            <div className="flow-node-block" key={block.id}>
              <Icon size={12} />
              <span>{blockPreview(block)}</span>
            </div>
          );
        })}
        {extra > 0 && <div className="flow-node-block muted">+{extra} más</div>}
      </div>
      <div className="flow-node-foot"><span className="flow-node-dot" /> Continuar flujo</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const nodeTypes = { start: StartNodeView, content: ContentNodeView };
