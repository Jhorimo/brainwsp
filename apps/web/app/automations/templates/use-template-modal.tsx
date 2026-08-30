'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { FlowFolder, FlowInstance, FlowSummary } from '../types';
import type { FlowTemplate } from './data';

const NEW_FOLDER_VALUE = '__new__';

type Props = {
  template: FlowTemplate;
  instances: FlowInstance[];
  folders: FlowFolder[];
  onFolderCreated: (folder: FlowFolder) => void;
  onClose: () => void;
};

export function UseTemplateModal({ template, instances, folders, onFolderCreated, onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [keywords, setKeywords] = useState(template.suggestedKeyword);
  const [instanceIds, setInstanceIds] = useState<string[]>(instances[0] ? [instances[0].id] : []);
  const [folderId, setFolderId] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleInstance = (id: string) => {
    setInstanceIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const submit = async () => {
    setError('');
    const trimmedName = name.trim();
    const keywordList = keywords.split(',').map((k) => k.trim()).filter(Boolean);
    if (!trimmedName) return setError('Ponle un nombre a la automatización');
    if (!instanceIds.length) return setError('Selecciona al menos un bot para este flujo');
    if (!keywordList.length) return setError('Agrega al menos una palabra clave');
    if (folderId === NEW_FOLDER_VALUE && !newFolderName.trim()) return setError('Ponle un nombre a la carpeta nueva');

    setSaving(true);
    try {
      let resolvedFolderId = folderId;
      if (folderId === NEW_FOLDER_VALUE) {
        const created = await apiFetch<FlowFolder>('/automations/folders', { method: 'POST', body: JSON.stringify({ name: newFolderName.trim() }) });
        onFolderCreated(created);
        resolvedFolderId = created.id;
      }
      const flow = await apiFetch<FlowSummary>('/automations/flows', {
        method: 'POST',
        body: JSON.stringify({ name: trimmedName, instanceIds, triggerKeywords: keywordList, folderId: resolvedFolderId || undefined }),
      });
      // La plantilla trae su propio grafo — createFlow siempre arranca vacío (ver
      // automations.service.ts), así que el grafo de la plantilla se aplica en un segundo paso.
      await apiFetch(`/automations/flows/${flow.id}`, { method: 'PATCH', body: JSON.stringify({ graph: template.graph }) });
      router.push(`/automations/${flow.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el flujo desde la plantilla');
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose}><X size={15} /></button>
        <div className="modal-header">
          <h2>Usar plantilla</h2>
          <p>Se creará una automatización nueva y editable a partir de &quot;{template.name}&quot;.</p>
        </div>
        <div className="modal-body">
          {error && <div className="error-box">{error}</div>}
          <div className="form-grid">
            <div className="field">
              <label>Nombre</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={template.name} />
            </div>
            <div className="field">
              <label>Bot(s) asignado(s)</label>
              <div className="chat-quick-filters" style={{ marginTop: 2 }}>
                {instances.map((instance) => (
                  <button key={instance.id} type="button" className={`chat-quick-tab ${instanceIds.includes(instance.id) ? 'active' : ''}`} onClick={() => toggleInstance(instance.id)}>
                    {instance.displayName || instance.phoneNumber || instance.name}
                  </button>
                ))}
                {!instances.length && <span className="row-sub">No tienes bots conectados todavía</span>}
              </div>
            </div>
            <div className="field">
              <label>Palabra clave</label>
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Ej: comprar, precio, info" />
              <span className="row-sub">El flujo se dispara cuando el cliente escribe esta palabra.</span>
            </div>
            <div className="field">
              <label>Carpeta (opcional)</label>
              <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                <option value="">Sin carpeta</option>
                {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                <option value={NEW_FOLDER_VALUE}>+ Crear nueva carpeta...</option>
              </select>
            </div>
            {folderId === NEW_FOLDER_VALUE && (
              <div className="field">
                <label>Nombre de la nueva carpeta</label>
                <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Ventas" autoFocus />
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="button" type="button" onClick={onClose}>Cancelar</button>
          <button className="button primary" type="button" disabled={saving} onClick={() => void submit()}>{saving ? 'Creando...' : 'Crear desde plantilla'}</button>
        </div>
      </div>
    </div>
  );
}
