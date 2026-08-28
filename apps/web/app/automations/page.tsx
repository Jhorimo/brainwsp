'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ChevronDown, FolderInput, Layers, Pencil, Plus, Search, Share2, Sparkles, Trash2, Workflow, Zap } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { useConfirm } from '@/components/confirm-provider';
import type { FlowFolder, FlowInstance, FlowStats, FlowSummary } from './types';

const NEW_FOLDER_VALUE = '__new__';

export default function AutomationsPage() {
  const router = useRouter();
  const confirm = useConfirm();

  const [stats, setStats] = useState<FlowStats>({ total: 0, active: 0, withAi: 0, shared: 0 });
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [folders, setFolders] = useState<FlowFolder[]>([]);
  const [instances, setInstances] = useState<FlowInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState<string>('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', instanceIds: [] as string[], folderId: '', newFolderName: '', keywords: '' });

  const [optionsOpenId, setOptionsOpenId] = useState<string | null>(null);
  const [moveOpenId, setMoveOpenId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [shareOpenId, setShareOpenId] = useState<string | null>(null);
  const [shareTargets, setShareTargets] = useState<string[]>([]);
  const [shareSaving, setShareSaving] = useState(false);

  const loadAll = () => {
    apiFetch<FlowStats>('/automations/stats').then(setStats).catch(() => undefined);
    apiFetch<FlowFolder[]>('/automations/folders').then(setFolders).catch(() => undefined);
    apiFetch<FlowInstance[]>('/instances').then(setInstances).catch(() => undefined);
  };

  const loadFlows = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (folderFilter) params.set('folderId', folderFilter);
    apiFetch<FlowSummary[]>(`/automations/flows?${params}`)
      .then(setFlows)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  useEffect(loadAll, []);
  useEffect(() => {
    const timer = setTimeout(loadFlows, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, folderFilter]);

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const flow of flows) {
      const key = flow.folder?.id || '';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [flows]);

  const openCreate = () => {
    setForm({ name: '', instanceIds: instances[0] ? [instances[0].id] : [], folderId: '', newFolderName: '', keywords: '' });
    setCreateError('');
    setCreateOpen(true);
  };

  const toggleFormInstance = (id: string) => {
    setForm((current) => ({ ...current, instanceIds: current.instanceIds.includes(id) ? current.instanceIds.filter((item) => item !== id) : [...current.instanceIds, id] }));
  };

  const submitCreate = async () => {
    setCreateError('');
    const name = form.name.trim();
    const keywords = form.keywords.split(',').map((k) => k.trim()).filter(Boolean);
    if (!name) return setCreateError('Ponle un nombre a la automatización');
    if (!form.instanceIds.length) return setCreateError('Selecciona al menos un bot para este flujo');
    if (!keywords.length) return setCreateError('Agrega al menos una palabra clave');

    setCreating(true);
    try {
      let folderId = form.folderId;
      if (folderId === NEW_FOLDER_VALUE) {
        if (!form.newFolderName.trim()) { setCreateError('Ponle un nombre a la carpeta nueva'); setCreating(false); return; }
        const folder = await apiFetch<FlowFolder>('/automations/folders', { method: 'POST', body: JSON.stringify({ name: form.newFolderName.trim() }) });
        folderId = folder.id;
        setFolders((current) => [...current, folder].sort((a, b) => a.name.localeCompare(b.name)));
      }
      const flow = await apiFetch<FlowSummary>('/automations/flows', {
        method: 'POST',
        body: JSON.stringify({ name, instanceIds: form.instanceIds, folderId: folderId || undefined, triggerKeywords: keywords }),
      });
      setCreateOpen(false);
      router.push(`/automations/${flow.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'No se pudo crear el flujo');
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (flow: FlowSummary) => {
    setFlows((current) => current.map((item) => (item.id === flow.id ? { ...item, active: !item.active } : item)));
    try {
      await apiFetch(`/automations/flows/${flow.id}`, { method: 'PATCH', body: JSON.stringify({ active: !flow.active }) });
    } catch {
      setFlows((current) => current.map((item) => (item.id === flow.id ? { ...item, active: flow.active } : item)));
    }
    apiFetch<FlowStats>('/automations/stats').then(setStats).catch(() => undefined);
  };

  const removeFlow = async (flow: FlowSummary) => {
    const ok = await confirm(`Se eliminará "${flow.name}" y no se podrá deshacer.`, { title: 'Eliminar automatización', confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    await apiFetch(`/automations/flows/${flow.id}`, { method: 'DELETE' });
    setFlows((current) => current.filter((item) => item.id !== flow.id));
    apiFetch<FlowStats>('/automations/stats').then(setStats).catch(() => undefined);
  };

  const duplicateFlow = async (flow: FlowSummary) => {
    setOptionsOpenId(null);
    const created = await apiFetch<FlowSummary>(`/automations/flows/${flow.id}/duplicate`, { method: 'POST' });
    router.push(`/automations/${created.id}`);
  };

  const openMove = (flow: FlowSummary) => {
    setOptionsOpenId(null);
    setMoveTarget(flow.folder?.id || '');
    setMoveOpenId(flow.id);
  };

  const submitMove = async (flow: FlowSummary) => {
    await apiFetch(`/automations/flows/${flow.id}`, { method: 'PATCH', body: JSON.stringify({ folderId: moveTarget || null }) });
    const nextFolder = folders.find((folder) => folder.id === moveTarget) || null;
    setFlows((current) => current.map((item) => (item.id === flow.id ? { ...item, folder: nextFolder } : item)));
    setMoveOpenId(null);
  };

  const openShare = (flow: FlowSummary) => {
    setOptionsOpenId(null);
    setShareTargets(flow.instances.map((instance) => instance.id));
    setShareOpenId(flow.id);
  };

  const toggleShareTarget = (id: string) => {
    setShareTargets((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const submitShare = async (flow: FlowSummary) => {
    if (!shareTargets.length) return;
    setShareSaving(true);
    try {
      await apiFetch(`/automations/flows/${flow.id}`, { method: 'PATCH', body: JSON.stringify({ instanceIds: shareTargets }) });
      const nextInstances = instances.filter((instance) => shareTargets.includes(instance.id));
      setFlows((current) => current.map((item) => (item.id === flow.id ? { ...item, instances: nextInstances } : item)));
      apiFetch<FlowStats>('/automations/stats').then(setStats).catch(() => undefined);
      setShareOpenId(null);
    } finally {
      setShareSaving(false);
    }
  };

  return (
    <AppShell title="Automatizaciones" subtitle="Gestiona tus flujos de respuesta automática" actions={<button className="button primary" type="button" onClick={openCreate}><Plus size={15} /> Crear flujo</button>}>
      <div className="grid-stats" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon"><Workflow size={18} /></div>
          <div className="stat-label">FLUJOS TOTALES</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-meta">Creados en tu cuenta</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><CheckCircle2 size={18} /></div>
          <div className="stat-label">FLUJOS ACTIVOS</div>
          <div className="stat-value">{stats.active}</div>
          <div className="stat-meta">{stats.total ? Math.round((stats.active / stats.total) * 100) : 0}% del total</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Sparkles size={18} /></div>
          <div className="stat-label">FLUJOS CON IA</div>
          <div className="stat-value">{stats.withAi}</div>
          <div className="stat-meta">Próximamente</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Share2 size={18} /></div>
          <div className="stat-label">COMPARTIDOS</div>
          <div className="stat-value">{stats.shared}</div>
          <div className="stat-meta">Flujos con más de un bot</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 20 }}>
        <div className="searchbox">
          <Search size={15} />
          <input placeholder="Buscar automatización..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="chat-quick-filters">
          <button type="button" className={`chat-quick-tab ${!folderFilter ? 'active' : ''}`} onClick={() => setFolderFilter('')}>Todos <span className="row-sub" style={{ marginTop: 0 }}>{flows.length}</span></button>
          {folders.map((folder) => (
            <button key={folder.id} type="button" className={`chat-quick-tab ${folderFilter === folder.id ? 'active' : ''}`} onClick={() => setFolderFilter(folder.id)}>
              {folder.name} <span className="row-sub" style={{ marginTop: 0 }}>{folderCounts.get(folder.id) || 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Automatización</th>
              <th>Disparador</th>
              <th>Carpeta</th>
              <th>Bot</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {flows.map((flow) => (
              <Fragment key={flow.id}>
                <tr>
                  <td>
                    <div className="row-main"><Zap size={13} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--brand)' }} />{flow.name}</div>
                  </td>
                  <td>{flow.triggerKeywords.map((keyword) => <span key={keyword} className="status-pill neutral" style={{ marginRight: 4 }}>{keyword}</span>)}</td>
                  <td>{flow.folder ? <span className="status-pill info">{flow.folder.name}</span> : <span className="row-sub">Sin carpeta</span>}</td>
                  <td>
                    {flow.instances.map((instance) => (
                      <span key={instance.id} className="status-pill neutral" style={{ marginRight: 4 }}>{instance.displayName || instance.phoneNumber || instance.name}</span>
                    ))}
                  </td>
                  <td>
                    <button type="button" className={`status-pill ${flow.active ? 'success' : 'neutral'}`} onClick={() => void toggleActive(flow)} style={{ border: 0 }}>
                      <span className="status-dot" /> {flow.active ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="button small" type="button" onClick={() => router.push(`/automations/${flow.id}`)}><Pencil size={13} /> Editar</button>
                      <button className={`button small ${optionsOpenId === flow.id ? 'info' : ''}`} type="button" onClick={() => setOptionsOpenId(optionsOpenId === flow.id ? null : flow.id)}>
                        <ChevronDown size={13} style={{ transform: optionsOpenId === flow.id ? 'rotate(180deg)' : undefined }} /> Opciones
                      </button>
                    </div>
                  </td>
                </tr>
                {optionsOpenId === flow.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: 0 }}>
                      <div className="flow-options-row">
                        <button type="button" className="flow-option-tile" onClick={() => void duplicateFlow(flow)}><Layers size={16} /> Duplicar</button>
                        <button type="button" className="flow-option-tile" onClick={() => openMove(flow)}><FolderInput size={16} /> Mover</button>
                        <button type="button" className="flow-option-tile" onClick={() => openShare(flow)}><Share2 size={16} /> Compartir</button>
                        <button type="button" className="flow-option-tile danger" onClick={() => void removeFlow(flow)}><Trash2 size={16} /> Eliminar</button>
                      </div>
                    </td>
                  </tr>
                )}
                {moveOpenId === flow.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: 0 }}>
                      <div className="flow-move-row">
                        <FolderInput size={15} />
                        <span>Mover a:</span>
                        <select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>
                          <option value="">Sin carpeta</option>
                          {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                        </select>
                        <button className="button small primary" type="button" onClick={() => void submitMove(flow)}>Mover</button>
                        <button className="button small" type="button" onClick={() => setMoveOpenId(null)}>Cancelar</button>
                      </div>
                    </td>
                  </tr>
                )}
                {shareOpenId === flow.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: 0 }}>
                      <div className="flow-share-row">
                        <Share2 size={15} />
                        <span>Compartir con:</span>
                        <div className="flow-share-chips">
                          {instances.map((instance) => (
                            <button key={instance.id} type="button" className={`chat-quick-tab ${shareTargets.includes(instance.id) ? 'active' : ''}`} onClick={() => toggleShareTarget(instance.id)}>
                              {instance.displayName || instance.phoneNumber || instance.name}
                            </button>
                          ))}
                        </div>
                        <button className="button small primary" type="button" disabled={shareSaving || !shareTargets.length} onClick={() => void submitShare(flow)}>{shareSaving ? 'Guardando...' : 'Guardar'}</button>
                        <button className="button small" type="button" onClick={() => setShareOpenId(null)}>Cancelar</button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!loading && !flows.length && (
              <tr><td colSpan={6}><div className="empty-state"><div><strong>Todavía no tienes automatizaciones</strong><p className="row-sub">Crea tu primer flujo para responder solo cuando llegue una palabra clave.</p></div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <div className="modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Crear nuevo flujo</h2><p>Configura tu automatización.</p></div>
            <div className="modal-body">
              {createError && <div className="error-box">{createError}</div>}
              <div className="form-grid">
                <div className="field">
                  <label>Nombre</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Funnel de ventas automatizado" />
                </div>
                <div className="field">
                  <label>Carpeta (opcional)</label>
                  <select value={form.folderId} onChange={(e) => setForm({ ...form, folderId: e.target.value })}>
                    <option value="">Sin carpeta</option>
                    {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                    <option value={NEW_FOLDER_VALUE}>+ Crear nueva carpeta...</option>
                  </select>
                </div>
                <div className="field">
                  <label>Bot(s) asignado(s)</label>
                  <div className="chat-quick-filters" style={{ marginTop: 2 }}>
                    {instances.map((instance) => (
                      <button key={instance.id} type="button" className={`chat-quick-tab ${form.instanceIds.includes(instance.id) ? 'active' : ''}`} onClick={() => toggleFormInstance(instance.id)}>
                        {instance.displayName || instance.phoneNumber || instance.name}
                      </button>
                    ))}
                    {!instances.length && <span className="row-sub">No tienes bots conectados todavía</span>}
                  </div>
                </div>
                {form.folderId === NEW_FOLDER_VALUE && (
                  <div className="field">
                    <label>Nombre de la nueva carpeta</label>
                    <input value={form.newFolderName} onChange={(e) => setForm({ ...form, newFolderName: e.target.value })} placeholder="Ventas" autoFocus />
                  </div>
                )}
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 13 }}>
                  <div className="field">
                    <label>Tipo de disparador</label>
                    <select value="KEYWORD" disabled><option value="KEYWORD">Palabra clave</option></select>
                  </div>
                  <div className="field">
                    <label>Palabra clave</label>
                    <input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="Ej: precio, info, comprar" />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" type="button" onClick={() => setCreateOpen(false)}>Cancelar</button>
              <button className="button primary" type="button" disabled={creating} onClick={() => void submitCreate()}>{creating ? 'Creando...' : 'Crear flujo'}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
