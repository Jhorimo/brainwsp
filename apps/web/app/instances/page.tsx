'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cable, Pencil, Plus, Power, QrCode, Search, Smartphone, Trash2, Unplug } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { io } from 'socket.io-client';
import { AppShell } from '@/components/app-shell';
import { StatusPill } from '@/components/status-pill';
import { apiFetch, getToken, SOCKET_URL } from '@/lib/api';

type Instance = {
  id: string; name: string; slug: string; provider: string; phoneNumber?: string | null; displayName?: string | null;
  status: string; qr?: string | null; reconnectAttempt: number; lastError?: string | null; lastConnectedAt?: string | null;
  inboundCount: number; outboundCount: number;
};

export default function InstancesPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [search, setSearch] = useState('');
  const [qrInstance, setQrInstance] = useState<Instance | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('WhatsApp Ventas');
  const [slug, setSlug] = useState('ventas');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [editInstance, setEditInstance] = useState<Instance | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteInstance, setDeleteInstance] = useState<Instance | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    try { setInstances(await apiFetch<Instance[]>('/instances')); } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { token: getToken() } });
    // A dropped connection (dev server reload, network blip, worker restart) can miss the
    // "connected" event while it's down, leaving the QR modal stuck showing a scanned code
    // forever — same failure mode conversations/page.tsx already guards against. Every
    // (re)connect forces a refetch so the instance list can't get stuck on stale data.
    socket.on('connect', () => void load());
    socket.on('instance.updated', (updated: Instance) => {
      setInstances((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setQrInstance((current) => current?.id === updated.id ? { ...current, ...updated } : current);
    });
    return () => { socket.disconnect(); };
  }, [load]);

  const action = async (id: string, name: 'connect' | 'disconnect' | 'logout') => {
    setBusy(id + name); setError('');
    try { await apiFetch(`/instances/${id}/${name}`, { method: 'POST' }); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'Error'); } finally { setBusy(null); }
  };

  const create = async () => {
    setError('');
    try {
      await apiFetch('/instances', { method: 'POST', body: JSON.stringify({ name, slug, provider: 'BAILEYS' }) });
      setCreateOpen(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
  };

  const openEdit = (instance: Instance) => {
    setEditInstance(instance);
    setEditName(instance.name);
    setEditSlug(instance.slug);
    setEditError('');
  };

  const saveEdit = async () => {
    if (!editInstance || !editName.trim() || !editSlug.trim()) return;
    setSavingEdit(true); setEditError('');
    try {
      await apiFetch(`/instances/${editInstance.id}`, { method: 'PATCH', body: JSON.stringify({ name: editName.trim(), slug: editSlug.trim() }) });
      setEditInstance(null);
      await load();
    } catch (err) { setEditError(err instanceof Error ? err.message : 'No se pudo guardar la instancia'); }
    finally { setSavingEdit(false); }
  };

  const confirmRemove = async () => {
    if (!deleteInstance) return;
    setDeleteError('');
    setBusy(deleteInstance.id + 'delete');
    try {
      await apiFetch(`/instances/${deleteInstance.id}`, { method: 'DELETE' });
      setDeleteInstance(null);
      await load();
    } catch (err) { setDeleteError(err instanceof Error ? err.message : 'No se pudo eliminar la instancia'); }
    finally { setBusy(null); }
  };

  const filtered = instances.filter((item) => `${item.name} ${item.phoneNumber || ''} ${item.slug}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <AppShell title="WhatsApp" subtitle="Administra las conexiones y sesiones" actions={<button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={16} />Nueva instancia</button>}>
      {error && <div className="error-box">{error}</div>}
      <div className="toolbar"><div className="searchbox"><Search size={17} /><input placeholder="Buscar instancia..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><StatusPill status={`${instances.filter((i) => i.status === 'CONNECTED').length} connected`} /></div>
      <div className="instance-grid">
        {filtered.map((instance) => (
          <article className="instance-card" key={instance.id}>
            <div className="instance-head"><div className="instance-logo"><Smartphone size={21} /></div><div className="instance-name"><strong>{instance.name}</strong><span>{instance.displayName || instance.phoneNumber || instance.slug}</span></div><StatusPill status={instance.status} /></div>
            <div className="instance-meta">
              <div className="meta-item"><span>Proveedor</span><strong>{instance.provider}</strong></div>
              <div className="meta-item"><span>Teléfono</span><strong>{instance.phoneNumber || 'Sin vincular'}</strong></div>
              <div className="meta-item"><span>Reconexiones</span><strong>{instance.reconnectAttempt}</strong></div>
              <div className="meta-item"><span>Última conexión</span><strong>{instance.lastConnectedAt ? new Date(instance.lastConnectedAt).toLocaleString('es-PE') : '—'}</strong></div>
              <div className="meta-item"><span>Recibidos</span><strong>{instance.inboundCount}</strong></div>
              <div className="meta-item"><span>Enviados</span><strong>{instance.outboundCount}</strong></div>
            </div>
            {instance.lastError && <div className="instance-error">{instance.lastError}</div>}
            <div className="instance-actions">
              {instance.status !== 'CONNECTED' && <button className="button small primary" disabled={busy === instance.id + 'connect'} onClick={() => void action(instance.id, 'connect')}><Cable size={14} />Conectar</button>}
              {instance.qr && <button className="button small" onClick={() => setQrInstance(instance)}><QrCode size={14} />Ver QR</button>}
              {instance.status === 'CONNECTED' && <button className="button small" disabled={busy === instance.id + 'disconnect'} onClick={() => void action(instance.id, 'disconnect')}><Unplug size={14} />Desconectar</button>}
              {instance.status !== 'DISCONNECTED' && instance.status !== 'LOGGED_OUT' && <button className="button small" disabled={busy === instance.id + 'logout'} onClick={() => void action(instance.id, 'logout')}><Power size={14} />Cerrar sesión</button>}
              <button className="button small" onClick={() => openEdit(instance)}><Pencil size={14} />Editar</button>
              <button className="button small danger" disabled={busy === instance.id + 'delete'} onClick={() => { setDeleteInstance(instance); setDeleteError(''); }}><Trash2 size={14} />Eliminar</button>
            </div>
          </article>
        ))}
      </div>

      {qrInstance?.qr && <div className="qr-backdrop" onClick={() => setQrInstance(null)}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-header"><h2>Vincular {qrInstance.name}</h2><p>En WhatsApp: Dispositivos vinculados → Vincular dispositivo. El QR se actualiza automáticamente si la sesión lo renueva.</p></div><div className="modal-body"><div className="qr-box"><QRCodeSVG value={qrInstance.qr} size={230} level="M" /></div><div style={{textAlign:'center',fontSize:10,color:'#748097',marginTop:12}}>Estado: {qrInstance.status}</div></div><div className="modal-actions"><button className="button" onClick={() => setQrInstance(null)}>Cerrar</button></div></div></div>}

      {createOpen && <div className="modal-backdrop"><div className="modal"><div className="modal-header"><h2>Nueva instancia</h2><p>Crea un canal independiente de WhatsApp para ventas, soporte, delivery u otra área.</p></div><div className="modal-body form-grid"><div className="field"><label>Nombre</label><input value={name} onChange={(e) => setName(e.target.value)} /></div><div className="field"><label>Slug</label><input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} /></div><div className="field"><label>Proveedor</label><select><option>BAILEYS</option></select></div></div><div className="modal-actions"><button className="button" onClick={() => setCreateOpen(false)}>Cancelar</button><button className="button primary" onClick={() => void create()}>Crear instancia</button></div></div></div>}

      {editInstance && (
        <div className="modal-backdrop" onClick={() => setEditInstance(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Editar instancia</h2><p>Cambia el nombre y el slug de "{editInstance.name}".</p></div>
            <div className="modal-body form-grid">
              {editError && <div className="error-box">{editError}</div>}
              <div className="field"><label>Nombre</label><input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit(); }} /></div>
              <div className="field"><label>Slug</label><input value={editSlug} onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit(); }} /></div>
              <div className="warning-box">El slug se usa para elegir esta instancia desde la API (parámetro <code>instance</code>). Si lo cambias, actualiza también las integraciones que lo usan.</div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setEditInstance(null)}>Cancelar</button>
              <button className="button primary" disabled={savingEdit || !editName.trim() || !editSlug.trim()} onClick={() => void saveEdit()}>{savingEdit ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteInstance && (
        <div className="modal-backdrop" onClick={() => setDeleteInstance(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Eliminar instancia</h2><p>¿Eliminar &quot;{deleteInstance.name}&quot;? Si nunca se conectó se borra por completo; si ya tiene historial, se cerrará su sesión y se ocultará del panel conservando las conversaciones. Esta acción no se puede deshacer.</p></div>
            <div className="modal-body">
              {deleteError && <div className="error-box">{deleteError}</div>}
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setDeleteInstance(null)}>Cancelar</button>
              <button className="button danger" disabled={busy === deleteInstance.id + 'delete'} onClick={() => void confirmRemove()}>{busy === deleteInstance.id + 'delete' ? 'Eliminando...' : 'Eliminar'}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
