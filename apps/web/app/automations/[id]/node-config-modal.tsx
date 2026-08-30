'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { AlertTriangle, ArrowDown, ArrowUp, Bold, Calendar, Clock, Contact as ContactIcon, Hand, Image as ImageIcon, Menu, Mic, MessageSquareText, Paperclip, Phone, Power, Search, Smile, Timer, Trash2, Upload, User, Video, X } from 'lucide-react';
import type { EmojiClickData } from 'emoji-picker-react';
import { apiFetch } from '@/lib/api';
import { blockMediaSrc, newBlockId, type ContentBlock } from '../types';
import { DurationPicker } from './duration-picker';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

type Props = {
  label: string;
  blocks: ContentBlock[];
  onClose: () => void;
  onSave: (label: string, blocks: ContentBlock[]) => void;
};

type MediaKind = 'image' | 'video' | 'audio' | 'file';
type TextField = 'text' | 'caption';

const ACCEPT: Record<MediaKind, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  file: '*/*',
};

const KIND_LABEL: Record<ContentBlock['kind'], string> = {
  text: 'Texto',
  image: 'Imagen',
  video: 'Video',
  audio: 'Audio',
  file: 'Archivo',
  contact: 'Contacto',
  autooff: 'Auto Off',
  delay: 'Retraso',
};

const MESSAGE_VARIABLES: { token: string; label: string; icon: typeof User; color: string }[] = [
  { token: '{{name}}', label: 'Nombre del contacto (WhatsApp)', icon: User, color: 'gray' },
  { token: '{{phone}}', label: 'Número de teléfono', icon: Phone, color: 'green' },
  { token: '{{greeting}}', label: 'Saludo según hora del día', icon: Hand, color: 'orange' },
  { token: '{{date}}', label: 'Fecha actual', icon: Calendar, color: 'pink' },
  { token: '{{hour}}', label: 'Hora actual', icon: Clock, color: 'blue' },
];

function getFieldValue(block: ContentBlock, field: TextField): string {
  if (field === 'text' && block.kind === 'text') return block.text;
  if (field === 'caption' && (block.kind === 'image' || block.kind === 'video')) return block.caption ?? '';
  return '';
}

function insertAtCaret(el: HTMLTextAreaElement | HTMLInputElement, value: string, onChange: (next: string) => void, insertText: string) {
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const next = value.slice(0, start) + insertText + value.slice(end);
  onChange(next);
  requestAnimationFrame(() => {
    el.focus();
    const caret = start + insertText.length;
    el.setSelectionRange(caret, caret);
  });
}

function applyBold(el: HTMLTextAreaElement | HTMLInputElement, value: string, onChange: (next: string) => void) {
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const next = value.slice(0, start) + '*' + value.slice(start, end) + '*' + value.slice(end);
  onChange(next);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + 1, start === end ? start + 1 : end + 1);
  });
}

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
  const pendingBlockId = useRef<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});
  const [popover, setPopover] = useState<{ key: string; kind: 'emoji' | 'variables'; top: number; left: number } | null>(null);
  const [variableSearch, setVariableSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popover) return;
    setVariableSearch('');
    const onClickOutside = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      setPopover(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopover(null);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [popover]);

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
  const addContactBlock = () => setBlocks((current) => [...current, { id: newBlockId(), kind: 'contact', contactName: '', contactPhone: '', contactCompany: '' }]);
  const addAutooffBlock = () => setBlocks((current) => [...current, { id: newBlockId(), kind: 'autooff', seconds: 86400 }]);

  // Un tile de "Herramientas" solo agrega el bloque vacío — el archivo se elige recién al
  // hacer clic en su cajita de vista previa (ver requestBlockUpload), así cada bloque puede
  // subir/reemplazar su propio archivo en vez de que "Imagen"/"Video" del panel abra el picker
  // de una y cree un bloque nuevo cada vez.
  const addMediaBlock = (kind: MediaKind) => setBlocks((current) => [...current, { id: newBlockId(), kind, mediaUrl: '', fileName: '' } as ContentBlock]);

  const requestBlockUpload = (blockId: string, kind: MediaKind) => {
    pendingKind.current = kind;
    pendingBlockId.current = blockId;
    // El input oculto renderiza `accept` desde pendingKind.current (un ref), y mutar un ref no
    // fuerza un re-render — sin esto, el diálogo del SO abre con el filtro de la última vez que
    // React sí re-renderizó el input (ej. quedaba en "Archivos de imagen" al pedir un video).
    // Se fija el atributo a mano justo antes de abrir el diálogo para que siempre esté al día.
    if (fileInputRef.current) fileInputRef.current.accept = ACCEPT[kind];
    fileInputRef.current?.click();
  };

  const openPopover = (kind: 'emoji' | 'variables', key: string, e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = kind === 'emoji' ? 320 : 210;
    const margin = 12;
    const left = Math.min(rect.left, Math.max(margin, window.innerWidth - width - margin));
    setPopover((current) => (current?.key === key && current.kind === kind ? null : { key, kind, top: rect.top, left }));
  };

  const insertIntoActive = (text: string) => {
    if (!popover) return;
    const [blockId, field] = popover.key.split(':') as [string, TextField];
    const el = fieldRefs.current[popover.key];
    const block = blocks.find((b) => b.id === blockId);
    if (!el || !block) return;
    const value = getFieldValue(block, field);
    const onChange = (next: string) => updateBlock(blockId, (field === 'text' ? { text: next } : { caption: next }) as Partial<ContentBlock>);
    insertAtCaret(el, value, onChange, text);
  };

  const renderFieldToolbar = (blockId: string, field: TextField, value: string, onChange: (next: string) => void) => {
    const key = `${blockId}:${field}`;
    return (
      <div className="field-toolbar">
        <button
          type="button"
          className="field-toolbar-btn"
          title="Negrita"
          onClick={() => {
            const el = fieldRefs.current[key];
            if (el) applyBold(el, value, onChange);
          }}
        >
          <Bold size={13} />
        </button>
        <button type="button" className="field-toolbar-btn" title="Emoji" onClick={(e) => openPopover('emoji', key, e)}>
          <Smile size={14} />
        </button>
        <span className="field-toolbar-divider" />
        <button type="button" className="field-toolbar-btn field-toolbar-btn-labeled" title="Insertar variable" onClick={(e) => openPopover('variables', key, e)}>
          <User size={12} /> Variables
        </button>
      </div>
    );
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const blockId = pendingBlockId.current;
    if (!file || !blockId) return;
    setUploadError('');
    setUploadingFor(blockId);
    try {
      const uploaded = await uploadMedia(file);
      updateBlock(blockId, { mediaUrl: uploaded.mediaUrl, mimeType: uploaded.mimeType, fileName: uploaded.fileName } as Partial<ContentBlock>);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'No se pudo subir el archivo');
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
            <div className="node-sequence-head">
              <span className="node-sequence-title"><span className="node-sequence-dot" />Secuencia del mensaje</span>
              <span className="node-sequence-count">Elementos: {blocks.length}</span>
            </div>
            <div className="node-block-list">
              {blocks.map((block, index) => (
                <div className="node-block-row" key={block.id}>
                  <div className="node-block-row-head">
                    <span className="node-block-kind"><Menu size={13} className="node-block-handle" />{KIND_LABEL[block.kind]}</span>
                    <div className="node-block-row-actions">
                      <button type="button" className="icon-button ghost small" disabled={index === 0} onClick={() => moveBlock(index, -1)} title="Subir"><ArrowUp size={13} /></button>
                      <button type="button" className="icon-button ghost small" disabled={index === blocks.length - 1} onClick={() => moveBlock(index, 1)} title="Bajar"><ArrowDown size={13} /></button>
                      <button type="button" className="icon-button ghost small" onClick={() => removeBlock(block.id)} title="Quitar"><Trash2 size={13} /></button>
                    </div>
                  </div>

                  <div className="node-block-row-body">
                    {block.kind === 'text' && (
                      <>
                        {renderFieldToolbar(block.id, 'text', block.text, (next) => updateBlock(block.id, { text: next } as Partial<ContentBlock>))}
                        <textarea
                          ref={(el) => { fieldRefs.current[`${block.id}:text`] = el; }}
                          value={block.text}
                          onChange={(e) => updateBlock(block.id, { text: e.target.value } as Partial<ContentBlock>)}
                          placeholder="Escribe el mensaje..."
                          rows={3}
                        />
                      </>
                    )}
                    {block.kind === 'delay' && (
                      <DurationPicker seconds={block.seconds} onChange={(seconds) => updateBlock(block.id, { seconds } as Partial<ContentBlock>)} />
                    )}
                    {block.kind === 'autooff' && (
                      <>
                        <div className="node-autooff-warning">
                          <AlertTriangle size={13} />
                          <span>Este nodo desactivará todas las respuestas automáticas del bot para este contacto específico durante el tiempo indicado.</span>
                        </div>
                        <DurationPicker seconds={block.seconds} onChange={(seconds) => updateBlock(block.id, { seconds } as Partial<ContentBlock>)} />
                      </>
                    )}
                    {block.kind === 'contact' && (
                      <div className="node-contact-fields">
                        <div className="field">
                          <label>Nombre completo</label>
                          <input value={block.contactName} onChange={(e) => updateBlock(block.id, { contactName: e.target.value } as Partial<ContentBlock>)} placeholder="Ej: Soporte ChatPro" />
                        </div>
                        <div className="field">
                          <label>Número de teléfono</label>
                          <input value={block.contactPhone} onChange={(e) => updateBlock(block.id, { contactPhone: e.target.value } as Partial<ContentBlock>)} placeholder="Ej: +51999888777" />
                        </div>
                        <div className="field">
                          <label>Empresa/Organización</label>
                          <input value={block.contactCompany || ''} onChange={(e) => updateBlock(block.id, { contactCompany: e.target.value } as Partial<ContentBlock>)} placeholder="Opcional" />
                        </div>
                      </div>
                    )}
                    {(block.kind === 'image' || block.kind === 'video' || block.kind === 'audio' || block.kind === 'file') && (
                      <div className="node-block-media-row">
                        <button
                          type="button"
                          className="node-media-box"
                          disabled={uploadingFor === block.id}
                          onClick={() => requestBlockUpload(block.id, block.kind)}
                          title={block.mediaUrl ? 'Cambiar archivo' : `Subir ${KIND_LABEL[block.kind].toLowerCase()}`}
                        >
                          {uploadingFor === block.id ? (
                            <span className="node-media-box-status">Subiendo...</span>
                          ) : block.kind === 'image' && block.mediaUrl ? (
                            <img src={blockMediaSrc(block.mediaUrl, block.mimeType, block.fileName)} alt="" />
                          ) : block.kind === 'video' && block.mediaUrl ? (
                            <video src={blockMediaSrc(block.mediaUrl, block.mimeType, block.fileName)} muted preload="metadata" />
                          ) : block.mediaUrl ? (
                            <span className="node-media-box-file">
                              {block.kind === 'audio' ? <Mic size={18} /> : <Paperclip size={18} />}
                              <span>{block.fileName || 'archivo'}</span>
                            </span>
                          ) : (
                            <span className="node-media-box-placeholder">
                              {block.kind === 'image' && <ImageIcon size={18} />}
                              {block.kind === 'video' && <Video size={18} />}
                              {block.kind === 'audio' && <Mic size={18} />}
                              {block.kind === 'file' && <Upload size={18} />}
                              <span>Subir {KIND_LABEL[block.kind].toLowerCase()}</span>
                            </span>
                          )}
                        </button>
                        <div className="node-block-media-fields">
                          {(block.kind === 'image' || block.kind === 'video') ? (
                            <>
                              {renderFieldToolbar(block.id, 'caption', block.caption || '', (next) => updateBlock(block.id, { caption: next } as Partial<ContentBlock>))}
                              <input
                                ref={(el) => { fieldRefs.current[`${block.id}:caption`] = el; }}
                                value={block.caption || ''}
                                onChange={(e) => updateBlock(block.id, { caption: e.target.value } as Partial<ContentBlock>)}
                                placeholder="Leyenda opcional (mensaje del archivo)..."
                              />
                            </>
                          ) : (
                            <span className="row-sub">{block.mediaUrl ? (block.fileName || 'Archivo listo') : `Haz clic en el cuadro para elegir ${block.kind === 'audio' ? 'un audio' : 'un archivo'}.`}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!blocks.length && (
                <div className="node-sequence-empty">Selecciona una herramienta a la derecha para empezar a armar tu nodo.</div>
              )}
            </div>
          </div>

          <div className="node-config-tools">
            <strong>Herramientas</strong>
            <p className="row-sub">Añade elementos a tu secuencia</p>
            <div className="node-tool-grid">
              <button type="button" className="node-tool-tile" onClick={addTextBlock}><span className="node-tool-icon green"><MessageSquareText size={17} /></span>Texto</button>
              <button type="button" className="node-tool-tile" onClick={() => addMediaBlock('image')}><span className="node-tool-icon blue"><ImageIcon size={17} /></span>Imagen</button>
              <button type="button" className="node-tool-tile" onClick={() => addMediaBlock('video')}><span className="node-tool-icon purple"><Video size={17} /></span>Video</button>
              <button type="button" className="node-tool-tile" onClick={() => addMediaBlock('file')}><span className="node-tool-icon orange"><Upload size={17} /></span>Archivo</button>
              <button type="button" className="node-tool-tile" onClick={() => addMediaBlock('audio')}><span className="node-tool-icon pink"><Mic size={17} /></span>Audio</button>
              <button type="button" className="node-tool-tile" onClick={addDelayBlock}><span className="node-tool-icon teal"><Timer size={17} /></span>Retraso</button>
              <button type="button" className="node-tool-tile" onClick={addAutooffBlock}><span className="node-tool-icon red"><Power size={17} /></span>Auto Off</button>
              <button type="button" className="node-tool-tile" onClick={addContactBlock}><span className="node-tool-icon blue"><ContactIcon size={17} /></span>Contacto</button>
            </div>
          </div>
        </div>
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept={ACCEPT[pendingKind.current]} onChange={(e) => void handleFileChosen(e)} />
        {popover && typeof document !== 'undefined' && createPortal(
          <div ref={popoverRef} className={popover.kind === 'emoji' ? 'emoji-popover' : 'variables-popover'} style={{ top: popover.top, left: popover.left }}>
            {popover.kind === 'emoji' ? (
              <EmojiPicker onEmojiClick={(data: EmojiClickData) => { insertIntoActive(data.emoji); setPopover(null); }} />
            ) : (
              <>
                <div className="variables-popover-search">
                  <Search size={13} />
                  <input
                    autoFocus
                    value={variableSearch}
                    onChange={(e) => setVariableSearch(e.target.value)}
                    placeholder="Buscar variable..."
                  />
                </div>
                <div className="variables-popover-list">
                  {MESSAGE_VARIABLES.filter((v) => `${v.token} ${v.label}`.toLowerCase().includes(variableSearch.toLowerCase())).map((v) => (
                    <button key={v.token} type="button" onClick={() => { insertIntoActive(v.token); setPopover(null); }}>
                      <span className={`variables-popover-icon ${v.color}`}><v.icon size={13} /></span>
                      <span className="variables-popover-text">
                        <code>{v.token}</code>
                        <span>{v.label}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
        <div className="modal-actions">
          <button className="button" type="button" onClick={onClose}>Cancelar</button>
          <button className="button primary" type="button" onClick={() => onSave(label.trim() || 'Contenido', blocks)}>Guardar nodo</button>
        </div>
      </div>
    </div>
  );
}
