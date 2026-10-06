'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Cable, Copy, MessageCircle, Pencil, Plus, Power, QrCode, RefreshCw, Search, Smartphone, Trash2, Unplug } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { io } from 'socket.io-client';
import { AppShell } from '@/components/app-shell';
import { StatusPill } from '@/components/status-pill';
import { apiFetch, getStoredCompany, getToken, SOCKET_URL } from '@/lib/api';

type WidgetConfig = { displayName?: string; welcomeMessage?: string; color?: string; position?: 'left' | 'right'; buttonText?: string; autoOpen?: boolean };
type Instance = {
  id: string; name: string; slug: string; provider: string; phoneNumber?: string | null; displayName?: string | null;
  status: string; qr?: string | null; reconnectAttempt: number; lastError?: string | null; lastConnectedAt?: string | null;
  inboundCount: number; outboundCount: number; widgetPublicKey?: string | null; configuration?: WidgetConfig | null;
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export default function InstancesPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [search, setSearch] = useState('');
  const [qrInstance, setQrInstance] = useState<Instance | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('WhatsApp Ventas');
  const [slug, setSlug] = useState('ventas');
  const [busy, setBusy] = useState<string | null>(null);
  // Instancia para la que el usuario pidió conectar: apenas llega su QR se abre el modal solo.
  const awaitingQr = useRef<string | null>(null);
  const [error, setError] = useState('');
  const [editInstance, setEditInstance] = useState<Instance | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteInstance, setDeleteInstance] = useState<Instance | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [activatingChat, setActivatingChat] = useState(false);
  const [widgetConfigOpen, setWidgetConfigOpen] = useState(false);
  const [widgetConfigDraft, setWidgetConfigDraft] = useState<WidgetConfig>({});
  const [savingWidgetConfig, setSavingWidgetConfig] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const companySlug = (getStoredCompany<{ slug?: string }>().slug) || '';

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
      if (updated.qr && awaitingQr.current === updated.id) {
        awaitingQr.current = null;
        setQrInstance((current) => current ?? updated);
      }
    });
    return () => { socket.disconnect(); };
  }, [load]);

  const action = async (id: string, name: 'connect' | 'disconnect' | 'logout') => {
    setBusy(id + name); setError('');
    try {
      await apiFetch(`/instances/${id}/${name}`, { method: 'POST' });
      if (name === 'connect') awaitingQr.current = id;
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); } finally { setBusy(null); }
  };

  // Encola un resync completo de fotos (contactos y grupos) en el worker — ver
  // SessionManager.forceRefreshAvatars. Corre en segundo plano; los avatares van
  // llegando por socket a medida que el worker los va obteniendo, así que no hace
  // falta esperar ni recargar la lista de instancias.
  const refreshAvatars = async (id: string) => {
    setBusy(id + 'refresh-avatars'); setError('');
    try { await apiFetch(`/instances/${id}/refresh-avatars`, { method: 'POST' }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setBusy(null); }
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

  const waInstances = instances.filter((item) => item.provider !== 'CLIENERA_CHAT');
  const filtered = waInstances.filter((item) => `${item.name} ${item.phoneNumber || ''} ${item.slug}`.toLowerCase().includes(search.toLowerCase()));
  const clieneraChannel = instances.find((item) => item.provider === 'CLIENERA_CHAT') || null;
  const publicLink = companySlug ? `${SITE_URL}/c/${companySlug}` : '';
  const embedSnippet = clieneraChannel && companySlug
    ? `<script src="${SITE_URL}/widget.js" data-company="${companySlug}"${clieneraChannel.configuration?.position === 'left' ? ' data-position="left"' : ''}></script>`
    : '';

  const activateClieneraChat = async () => {
    setActivatingChat(true); setError('');
    try {
      await apiFetch('/instances', { method: 'POST', body: JSON.stringify({ name: 'Clienera Chat', slug: 'clienera-chat', provider: 'CLIENERA_CHAT' }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo activar Clienera Chat'); }
    finally { setActivatingChat(false); }
  };

  const regenerateWidgetKey = async () => {
    if (!clieneraChannel) return;
    setBusy(clieneraChannel.id + 'widget-key'); setError('');
    try { await apiFetch(`/instances/${clieneraChannel.id}/widget-key/regenerate`, { method: 'POST' }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo rotar la clave'); }
    finally { setBusy(null); }
  };

  const openWidgetConfig = () => {
    setWidgetConfigDraft(clieneraChannel?.configuration || {});
    setWidgetConfigOpen(true);
  };

  const saveWidgetConfig = async () => {
    if (!clieneraChannel) return;
    setSavingWidgetConfig(true); setError('');
    try {
      await apiFetch(`/instances/${clieneraChannel.id}/widget-config`, { method: 'PATCH', body: JSON.stringify(widgetConfigDraft) });
      setWidgetConfigOpen(false);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar la configuración'); }
    finally { setSavingWidgetConfig(false); }
  };

  const copySnippet = async () => {
    try { await navigator.clipboard.writeText(embedSnippet); setCopiedSnippet(true); setTimeout(() => setCopiedSnippet(false), 2000); } catch {}
  };

  return (
    <AppShell title="WhatsApp" subtitle="Administra las conexiones y sesiones" actions={<button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={16} />Nueva instancia</button>}>
      {error && <div className="error-box">{error}</div>}
      <div className="instance-grid" style={{ marginBottom: 20 }}>
        <article className="instance-card">
          <div className="instance-head">
            <div className="instance-logo"><MessageCircle size={21} /></div>
            <div className="instance-name"><strong>Clienera Chat</strong><span>Canal propio: enlace público + widget para tu web</span></div>
            {clieneraChannel && <StatusPill status="Activo" />}
          </div>
          {!clieneraChannel ? (
            <>
              <p style={{ fontSize: 12, color: '#748097', margin: '4px 0 12px' }}>Permite que tus clientes te escriban directamente desde tu web, Instagram o cualquier enlace, sin depender de WhatsApp.</p>
              <div className="instance-actions">
                <button className="button small primary" disabled={activatingChat} onClick={() => void activateClieneraChat()}><Plus size={14} />{activatingChat ? 'Activando...' : 'Activar Clienera Chat'}</button>
              </div>
            </>
          ) : (
            <>
              <div className="instance-meta">
                <div className="meta-item"><span>Enlace público</span><strong style={{ wordBreak: 'break-all' }}>{publicLink || 'Configura el slug de tu empresa'}</strong></div>
                <div className="meta-item"><span>Conversaciones recibidas</span><strong>{clieneraChannel.inboundCount}</strong></div>
                <div className="meta-item"><span>Respuestas enviadas</span><strong>{clieneraChannel.outboundCount}</strong></div>
              </div>
              <div className="field" style={{ marginTop: 10 }}>
                <label>Script para tu web</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input readOnly value={embedSnippet} style={{ fontFamily: 'monospace', fontSize: 11 }} />
                  <button className="button small" onClick={() => void copySnippet()}><Copy size={13} />{copiedSnippet ? 'Copiado' : 'Copiar'}</button>
                </div>
              </div>
              <div className="instance-actions">
                {publicLink && <a className="button small" href={publicLink} target="_blank" rel="noreferrer">Abrir enlace público</a>}
                <button className="button small" onClick={openWidgetConfig}><Pencil size={14} />Personalizar</button>
                <button className="button small" disabled={busy === clieneraChannel.id + 'widget-key'} onClick={() => void regenerateWidgetKey()}><RefreshCw size={14} />Rotar clave del widget</button>
              </div>
            </>
          )}
        </article>
      </div>

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
              {instance.status !== 'CONNECTED' && <button className="button small primary" disabled={busy === instance.id + 'connect'} onClick={() => void action(instance.id, 'connect')}><Cable size={14} />{instance.status === 'LOGGED_OUT' || instance.status === 'ERROR' ? 'Generar QR' : 'Conectar'}</button>}
              {instance.qr && <button className="button small" onClick={() => setQrInstance(instance)}><QrCode size={14} />Ver QR</button>}
              {instance.status === 'CONNECTED' && <button className="button small" disabled={busy === instance.id + 'disconnect'} onClick={() => void action(instance.id, 'disconnect')}><Unplug size={14} />Desconectar</button>}
              {instance.status !== 'DISCONNECTED' && instance.status !== 'LOGGED_OUT' && <button className="button small" disabled={busy === instance.id + 'logout'} onClick={() => void action(instance.id, 'logout')}><Power size={14} />Cerrar sesión</button>}
              {instance.status === 'CONNECTED' && <button className="button small" disabled={busy === instance.id + 'refresh-avatars'} onClick={() => void refreshAvatars(instance.id)} title="Vuelve a descargar la foto de perfil de todos los contactos y grupos"><RefreshCw size={14} />Actualizar fotos</button>}
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

      {widgetConfigOpen && (
        <div className="modal-backdrop" onClick={() => setWidgetConfigOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Personalizar Clienera Chat</h2><p>Cómo se ve el canal para tus clientes.</p></div>
            <div className="modal-body form-grid">
              <div className="field"><label>Nombre mostrado</label><input value={widgetConfigDraft.displayName || ''} onChange={(e) => setWidgetConfigDraft((d) => ({ ...d, displayName: e.target.value }))} placeholder="Nombre de tu empresa" /></div>
              <div className="field"><label>Mensaje de bienvenida</label><input value={widgetConfigDraft.welcomeMessage || ''} onChange={(e) => setWidgetConfigDraft((d) => ({ ...d, welcomeMessage: e.target.value }))} placeholder="Hola 👋 ¿En qué podemos ayudarte?" /></div>
              <div className="field"><label>Color principal</label><input type="color" value={widgetConfigDraft.color || '#6b8afd'} onChange={(e) => setWidgetConfigDraft((d) => ({ ...d, color: e.target.value }))} /></div>
              <div className="field"><label>Texto del botón</label><input value={widgetConfigDraft.buttonText || ''} onChange={(e) => setWidgetConfigDraft((d) => ({ ...d, buttonText: e.target.value }))} placeholder="¿Necesitas ayuda?" /></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!widgetConfigDraft.autoOpen} onChange={(e) => setWidgetConfigDraft((d) => ({ ...d, autoOpen: e.target.checked }))} />
                Abrir automáticamente al entrar a la página
              </label>
              <p style={{ fontSize: 11, color: '#92a0b5', margin: '-6px 0 0' }}>
                {widgetConfigDraft.autoOpen
                  ? 'El panel de chat se abre solo apenas el visitante carga la página.'
                  : 'El visitante solo ve el botón flotante; el chat se abre al hacer clic.'}
              </p>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setWidgetConfigOpen(false)}>Cancelar</button>
              <button className="button primary" disabled={savingWidgetConfig} onClick={() => void saveWidgetConfig()}>{savingWidgetConfig ? 'Guardando...' : 'Guardar'}</button>
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
