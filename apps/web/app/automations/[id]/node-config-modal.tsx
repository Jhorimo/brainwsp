'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, Image as ImageIcon, Mic, MessageSquareText, Paperclip, Timer, Trash2, Upload, Video, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { newBlockId, type ContentBlock } from '../types';

type Props = {
  label: string;
  blocks: ContentBlock[];
  onClose: () => void;
  onSave: (label: string, blocks: ContentBlock[]) => void;
};

type MediaKind = 'image' | 'video' | 'audio' | 'file';

const ACCEPT: Record<MediaKind, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  file: '*/*',
};

async function uploadMedia(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch<{ mediaUrl: string; fileName: string; mimeType: string; fileSize: number }>('/quick-replies/media', { method: 'POST', body: formData });
}

export function NodeConfigModal({ label: initialLabel, blocks: initialBlocks, onClose, onSave }: Props) {
  const [label, setLabel] = useState(initialLabel);
  const [blocks, setBlocks] = useState<ContentBlock[]>(initialBlocks);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<MediaKind>('image');

  const updateBlock = (id: string, patch: Partial<ContentBlock>) => {
    setBlocks((current) => current.map((block) => (block.id === id ? ({ ...block, ...patch } as ContentBlock) : block)));
  };

  const removeBlock = (id: string) => setBlocks((current) => current.filter((block) => block.id !== id));

  const moveBlock = (index: number, direction: -1 | 1) => {
    setBlocks((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addTextBlock = () => setBlocks((current) => [...current, { id: newBlockId(), kind: 'text', text: '' }]);
  const addDelayBlock = () => setBlocks((current) => [...current, { id: newBlockId(), kind: 'delay', seconds: 2 }]);

  const requestMediaUpload = (kind: MediaKind) => {
    pendingKind.current = kind;
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const kind = pendingKind.current;
    const blockId = newBlockId();
    setUploadError('');
    setUploadingFor(blockId);
    // Optimistic placeholder so the list doesn't jump once the upload resolves.
    const placeholder = { id: blockId, kind, mediaUrl: '', fileName: file.name } as ContentBlock;
    setBlocks((current) => [...current, placeholder]);
    try {
      const uploaded = await uploadMedia(file);
      updateBlock(blockId, { mediaUrl: uploaded.mediaUrl, mimeType: uploaded.mimeType, fileName: uploaded.fileName } as Partial<ContentBlock>);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'No se pudo subir el archivo');
      removeBlock(blockId);
    } finally {
      setUploadingFor(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal node-config-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose}><X size={15} /></button>
        <div className="modal-header">
          <h2>Contenido — configuración</h2>
          <p>Secuencia de mensajes que se envían en orden, una vez que se llega a este nodo.</p>
        </div>
        <div className="node-config-body">
          <div className="node-config-sequence">
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Nombre del nodo</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mensaje de bienvenida" />
            </div>
            {uploadError && <div className="error-box">{uploadError}</div>}
            <div className="node-block-list">
              {blocks.map((block, index) => (
                <div className="node-block-row" key={block.id}>
                  <div className="node-block-row-head">
                    <span className="node-block-kind">
                      {block.kind === 'text' && <><MessageSquareText size={13} /> Texto</>}
                      {block.kind === 'image' && <><ImageIcon size={13} /> Imagen</>}
                      {block.kind === 'video' && <><Video size={13} /> Video</>}
                      {block.kind === 'audio' && <><Mic size={13} /> Audio</>}
                      {block.kind === 'file' && <><FileText size={13} /> Archivo</>}
                      {block.kind === 'delay' && <><Timer size={13} /> Retraso</>}
                    </span>
                    <div className="node-block-row-actions">
                      <button type="button" className="icon-button ghost small" disabled={index === 0} onClick={() => moveBlock(index, -1)} title="Subir"><ArrowUp size={13} /></button>
                      <button type="button" className="icon-button ghost small" disabled={index === blocks.length - 1} onClick={() => moveBlock(index, 1)} title="Bajar"><ArrowDown size={13} /></button>
                      <button type="button" className="icon-button ghost small" onClick={() => removeBlock(block.id)} title="Quitar"><Trash2 size={13} /></button>
                    </div>
                  </div>

                  {block.kind === 'text' && (
                    <textarea value={block.text} onChange={(e) => updateBlock(block.id, { text: e.target.value } as Partial<ContentBlock>)} placeholder="Escribe el mensaje..." rows={3} />
                  )}
                  {block.kind === 'delay' && (
                    <div className="field-with-action">
                      <input type="number" min={1} max={3600} value={block.seconds} onChange={(e) => updateBlock(block.id, { seconds: Math.max(1, Number(e.target.value) || 1) } as Partial<ContentBlock>)} style={{ maxWidth: 110 }} />
                      <span className="row-sub" style={{ marginTop: 0 }}>segundos de pausa antes de continuar</span>
                    </div>
                  )}
                  {(block.kind === 'image' || block.kind === 'video' || block.kind === 'audio' || block.kind === 'file') && (
                    <div className="node-block-media">
                      {uploadingFor === block.id ? (
                        <span className="row-sub">Subiendo {block.fileName}...</span>
                      ) : block.mediaUrl ? (
                        <span className="node-block-media-name"><Paperclip size={12} /> {block.fileName || 'archivo adjunto'}</span>
                      ) : (
                        <span className="row-sub">Sin archivo</span>
                      )}
                      {(block.kind === 'image' || block.kind === 'video') && (
                        <input value={block.caption || ''} onChange={(e) => updateBlock(block.id, { caption: e.target.value } as Partial<ContentBlock>)} placeholder="Leyenda opcional..." />
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!blocks.length && <div className="row-sub" style={{ padding: '10px 0' }}>Agrega un bloque desde el panel de herramientas.</div>}
            </div>
          </div>

          <div className="node-config-tools">
            <strong>Herramientas</strong>
            <p className="row-sub">Añade elementos a tu secuencia</p>
            <div className="node-tool-grid">
              <button type="button" className="node-tool-btn" onClick={addTextBlock}><MessageSquareText size={16} /> Texto</button>
              <button type="button" className="node-tool-btn" onClick={() => requestMediaUpload('image')}><ImageIcon size={16} /> Imagen</button>
              <button type="button" className="node-tool-btn" onClick={() => requestMediaUpload('video')}><Video size={16} /> Video</button>
              <button type="button" className="node-tool-btn" onClick={() => requestMediaUpload('file')}><Upload size={16} /> Archivo</button>
              <button type="button" className="node-tool-btn" onClick={() => requestMediaUpload('audio')}><Mic size={16} /> Audio</button>
              <button type="button" className="node-tool-btn" onClick={addDelayBlock}><Timer size={16} /> Retraso</button>
            </div>
          </div>
        </div>
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept={ACCEPT[pendingKind.current]} onChange={(e) => void handleFileChosen(e)} />
        <div className="modal-actions">
          <button className="button" type="button" onClick={onClose}>Cancelar</button>
          <button className="button primary" type="button" onClick={() => onSave(label.trim() || 'Contenido', blocks)}>Guardar nodo</button>
        </div>
      </div>
    </div>
  );
}
