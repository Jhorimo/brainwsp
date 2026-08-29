'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileText, Image as ImageIcon, ListTree, Mic, MessageSquareText, Pencil, Play, Timer, Trash2, Video } from 'lucide-react';
import { NO_RESPONSE_HANDLE, type ContentBlock, type ContentNodeData, type MenuNodeData, type WaitNodeData } from '../types';

// Escala la unidad mostrada según la magnitud — a partir de DurationPicker un nodo Wait puede
// guardar días/horas, y mostrarlos siempre como MM:SS (ej. "2880:00" para 2 días) era ilegible.
function formatDuration(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  if (s < 3600) return { primary: Math.floor(s / 60), secondary: s % 60, labelPrimary: 'Min', labelSecondary: 'Seg' };
  if (s < 86400) return { primary: Math.floor(s / 3600), secondary: Math.floor((s % 3600) / 60), labelPrimary: 'Hora', labelSecondary: 'Min' };
  return { primary: Math.floor(s / 86400), secondary: Math.floor((s % 86400) / 3600), labelPrimary: 'Día', labelSecondary: 'Hora' };
}

const BLOCK_ICONS: Record<ContentBlock['kind'], typeof MessageSquareText> = {
  text: MessageSquareText,
  image: ImageIcon,
  video: Video,
  audio: Mic,
  file: FileText,
  delay: Timer,
};

// Mismo criterio que formatDuration del nodo Wait — segundos crudos son ilegibles una vez que
// DurationPicker permite configurar retrasos de hasta 30 días (ej. "172800s" en vez de "2d").
function formatCompactDuration(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  if (s % 86400 === 0 && s >= 86400) return `${s / 86400}d`;
  if (s % 3600 === 0 && s >= 3600) return `${s / 3600}h`;
  if (s % 60 === 0 && s >= 60) return `${s / 60}m`;
  return `${s}s`;
}

function blockPreview(block: ContentBlock) {
  switch (block.kind) {
    case 'text': return block.text.trim() || '(vacío)';
    case 'delay': return `${formatCompactDuration(block.seconds)} · pausa`;
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

export function WaitNodeView({ data, id }: NodeProps) {
  const nodeData = data as WaitNodeData & { onEdit?: (nodeId: string) => void; onDelete?: (nodeId: string) => void };
  const { primary, secondary, labelPrimary, labelSecondary } = formatDuration(nodeData.seconds || 0);

  return (
    <div className="flow-node flow-node-wait">
      <Handle type="target" position={Position.Left} />
      <div className="flow-node-head">
        <div className="flow-node-icon wait"><Timer size={14} /></div>
        <div>
          <strong>TEMPORIZADOR</strong>
          <span>Duración de espera</span>
        </div>
        <span className="flow-node-badge wait">WAIT</span>
        <button type="button" className="icon-button ghost small nodrag flow-node-action" title="Editar duración" onClick={() => nodeData.onEdit?.(id)}><Pencil size={13} /></button>
        <button type="button" className="icon-button ghost small nodrag flow-node-action" title="Eliminar nodo" onClick={() => nodeData.onDelete?.(id)}><Trash2 size={13} /></button>
      </div>
      <div className="flow-node-body">
        <div className="wait-node-countdown">
          <div className="wait-node-time">
            <strong>{String(primary).padStart(2, '0')}</strong>
            <span className="wait-node-colon">:</span>
            <strong>{String(secondary).padStart(2, '0')}</strong>
          </div>
          <div className="wait-node-labels"><span>{labelPrimary}</span><span>{labelSecondary}</span></div>
          <div className="wait-node-bar"><div className="wait-node-bar-fill" /></div>
        </div>
      </div>
      <div className="flow-node-foot"><span className="flow-node-dot wait" /> Pausar flujo</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function MenuNodeView({ data, id }: NodeProps) {
  const nodeData = data as MenuNodeData & { onEdit?: (nodeId: string) => void; onDelete?: (nodeId: string) => void };
  const options = nodeData.options || [];

  return (
    <div className="flow-node flow-node-menu">
      <Handle type="target" position={Position.Left} />
      <div className="flow-node-head">
        <div className="flow-node-icon menu"><ListTree size={14} /></div>
        <div>
          <strong>{nodeData.label || 'Menú'}</strong>
          <span>Menú de opciones</span>
        </div>
        <span className="flow-node-badge menu">MENU</span>
        <button type="button" className="icon-button ghost small nodrag flow-node-action" title="Editar menú" onClick={() => nodeData.onEdit?.(id)}><Pencil size={13} /></button>
        <button type="button" className="icon-button ghost small nodrag flow-node-action" title="Eliminar nodo" onClick={() => nodeData.onDelete?.(id)}><Trash2 size={13} /></button>
      </div>
      <div className="flow-node-body">
        <div className="flow-node-menu-prompt">{nodeData.prompt?.trim() || 'Escribe un mensaje...'}</div>
        {options.map((option, index) => (
          <div className="flow-node-option-row" key={option.id}>
            <span>{index + 1}. {option.text.trim() || `Opción ${index + 1}`}</span>
            <Handle type="source" position={Position.Right} id={option.id} style={{ position: 'absolute', right: -7, top: '50%', transform: 'translateY(-50%)' }} />
          </div>
        ))}
        <div className="flow-node-option-row no-response">
          <span>Sin respuesta</span>
          <Handle type="source" position={Position.Right} id={NO_RESPONSE_HANDLE} style={{ position: 'absolute', right: -7, top: '50%', transform: 'translateY(-50%)' }} />
        </div>
      </div>
    </div>
  );
}

export const nodeTypes = { start: StartNodeView, content: ContentNodeView, wait: WaitNodeView, menu: MenuNodeView };
