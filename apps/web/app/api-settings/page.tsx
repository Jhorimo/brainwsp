'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, KeyRound, Plus, RefreshCw, RotateCw, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { io } from 'socket.io-client';
import { AppShell } from '@/components/app-shell';
import { ApiDocs } from '@/components/api-docs';
import { StatusPill } from '@/components/status-pill';
import { API_URL, apiFetch, getToken, SOCKET_URL } from '@/lib/api';

type Credential = { id: string; name: string; appKey: string; hasAuthKey: boolean; instanceId: string | null; active: boolean; lastUsedAt?: string | null; createdAt: string; instance?: { id: string; name: string; slug: string; status: string } | null };

type CreatedCredential = Credential & { authKey: string; warning: string };

type Instance = { id: string; name: string; slug: string; status: string };

export default function ApiSettingsPage() {
  const [items, setItems] = useState<Credential[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [search, setSearch] = useState('');
  const [created, setCreated] = useState<CreatedCredential | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('Integración Producción');
  const [instanceId, setInstanceId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [revealedAuthKeys, setRevealedAuthKeys] = useState<Record<string, string>>({});
  const [revealingAuthKeyId, setRevealingAuthKeyId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => { try { setItems(await apiFetch<Credential[]>('/api-credentials')); } catch (err) { setError(err instanceof Error ? err.message : 'Error'); } }, []);
  const loadInstances = useCallback(async () => { try { setInstances(await apiFetch<Instance[]>('/instances')); } catch (err) { setError(err instanceof Error ? err.message : 'Error'); } }, []);
  useEffect(() => { void load(); void loadInstances(); }, [load, loadInstances]);

  const usedInstanceIds = new Set(items.map((item) => item.instanceId));
  const availableInstances = instances.filter((instance) => !usedInstanceIds.has(instance.id));

  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { token: getToken() } });
    socket.on('instance.updated', (updated: { id: string; name: string; slug: string; status: string }) => {
      setItems((current) => current.map((item) => item.instanceId === updated.id ? { ...item, instance: { ...item.instance, ...updated } } : item));
    });
    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => {
    if (!created) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setCreated(null); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [created]);

  const create = async () => {
    setCreating(true); setError('');
    try {
      const data = await apiFetch<CreatedCredential>('/api-credentials', { method: 'POST', body: JSON.stringify({ name, instanceId }) });
      setCreated(data); setCreateOpen(false); setName('Integración Producción'); setInstanceId(''); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Error'); } finally { setCreating(false); }
  };

  const copy = (value: string) => navigator.clipboard.writeText(value);
  const filtered = items.filter((item) => `${item.name} ${item.appKey}`.toLowerCase().includes(search.toLowerCase()));

  const toggleReveal = (id: string) => {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleRevealAuthKey = async (item: Credential) => {
    if (revealedAuthKeys[item.id]) {
      setRevealedAuthKeys((current) => { const next = { ...current }; delete next[item.id]; return next; });
      return;
    }
    setRevealingAuthKeyId(item.id); setError('');
    try {
      const data = await apiFetch<{ authKey: string }>(`/api-credentials/${item.id}/reveal`);
      setRevealedAuthKeys((current) => ({ ...current, [item.id]: data.authKey }));
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo obtener el AUTH KEY'); }
    finally { setRevealingAuthKeyId(null); }
  };

  const remove = async (item: Credential) => {
    if (!window.confirm(`¿Eliminar la credencial "${item.name}"? Cualquier sistema que la use dejará de poder conectarse. Esta acción no se puede deshacer.`)) return;
    setBusyId(item.id); setError('');
    try {
      await apiFetch(`/api-credentials/${item.id}`, { method: 'DELETE' });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo eliminar la credencial'); }
    finally { setBusyId(null); }
  };

  const regenerate = async (item: Credential) => {
    if (!window.confirm(`¿Generar un nuevo AUTH KEY para "${item.name}"? El AUTH KEY actual dejará de funcionar de inmediato.`)) return;
    setBusyId(item.id); setError('');
    try {
      const data = await apiFetch<CreatedCredential>(`/api-credentials/${item.id}/regenerate`, { method: 'PATCH' });
      setCreated(data);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo regenerar el AUTH KEY'); }
    finally { setBusyId(null); }
  };

  return (
    <AppShell title="API e integraciones" subtitle="Credenciales para conectar tus sistemas externos" actions={<button className="button primary" onClick={() => { setError(''); void loadInstances(); setCreateOpen(true); }}><Plus size={16} />Nueva credencial</button>}>
      {error && !createOpen && <div className="error-box">{error}</div>}
      <section className="api-hero"><div><h2>BrainWSP Gateway API</h2><p>Integra tus sistemas actuales sin conocer Baileys. Solo necesitan la URL, APP KEY y AUTH KEY. La plataforma gestiona la cola, sesión, reconexión y entrega.</p></div><div className="api-url">{API_URL}/v1/messages/text</div></section>
      <div className="toolbar"><div className="searchbox"><Search size={17} /><input placeholder="Buscar credencial..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><button className="button" onClick={() => void load()}><RefreshCw size={14} />Actualizar</button></div>
      <div className="table-card">
        <table><thead><tr><th>Integración</th><th>APP KEY</th><th>AUTH KEY</th><th>Instancia</th><th>Último uso</th><th>Estado</th><th></th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><span className="row-main">{item.name}</span><span className="row-sub">Creada {new Date(item.createdAt).toLocaleDateString('es-PE')}</span></td><td><code className="app-key-cell">{revealed.has(item.id) ? item.appKey : `${item.appKey.slice(0, 13)}…${item.appKey.slice(-6)}`}</code><button className="icon-button ghost small" onClick={() => toggleReveal(item.id)} title={revealed.has(item.id) ? 'Ocultar' : 'Ver completo'}>{revealed.has(item.id) ? <EyeOff size={13} /> : <Eye size={13} />}</button></td><td>{revealedAuthKeys[item.id] ? <><code className="app-key-cell">{revealedAuthKeys[item.id]}</code><button className="icon-button ghost small" onClick={() => void toggleRevealAuthKey(item)} title="Ocultar"><EyeOff size={13} /></button><button className="icon-button ghost small" onClick={() => void copy(revealedAuthKeys[item.id])} title="Copiar AUTH KEY"><Copy size={13} /></button></> : item.hasAuthKey ? <><code className="app-key-cell">••••••••••••••••</code><button className="icon-button ghost small" disabled={revealingAuthKeyId === item.id} onClick={() => void toggleRevealAuthKey(item)} title="Ver AUTH KEY">{revealingAuthKeyId === item.id ? <RefreshCw size={13} /> : <Eye size={13} />}</button></> : <span className="row-sub" title="Creada antes de esta función — regenérala para poder verla">No disponible</span>}</td><td>{item.instance?.name ?? <span className="row-sub" title="Se crea sola cuando este AUTH KEY llama POST /api/user/device por primera vez">Sin dispositivo aún</span>}</td><td>{item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString('es-PE') : 'Nunca'}</td><td><StatusPill status={!item.active ? 'revoked' : item.instance?.status || 'unknown'} /></td><td className="row-actions"><button className="icon-button" onClick={() => void copy(item.appKey)} title="Copiar APP KEY"><Copy size={15} /></button><button className="icon-button" disabled={busyId === item.id} onClick={() => void regenerate(item)} title="Regenerar AUTH KEY"><RotateCw size={15} /></button><button className="icon-button danger" disabled={busyId === item.id} onClick={() => void remove(item)} title="Eliminar credencial"><Trash2 size={15} /></button></td></tr>)}</tbody></table>
      </div>

      <section className="card" style={{marginTop:18}}><div className="card-header"><div><h2>Compatibilidad con tu sistema actual</h2><p>Endpoint legacy conservado para migrar sin romper tus sistemas actuales</p></div><ShieldCheck size={20} color="#168a55" /></div><div className="card-body"><div className="secret-box">POST {API_URL}/create-message<br/><br/>appkey=APP_KEY&amp;authkey=AUTH_KEY&amp;to=51999999999&amp;message=Hola</div></div></section>

      <ApiDocs appKey={items.find((item) => item.active)?.appKey} />

      {createOpen && <div className="modal-backdrop" onClick={() => setCreateOpen(false)}><div className="modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setCreateOpen(false)} title="Cerrar"><X size={16} /></button><div className="modal-header"><h2>Nueva credencial</h2><p>Genera un APP KEY y AUTH KEY para que un sistema externo se conecte a una instancia de WhatsApp. Cada instancia solo puede tener una credencial.</p></div><div className="modal-body form-grid">{error && <div className="error-box">{error}</div>}<div className="field"><label>Nombre</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Integración Producción" /></div><div className="field"><label>Instancia de WhatsApp</label>{availableInstances.length === 0 ? <div className="error-box">Todas tus instancias ya tienen una credencial. Crea una nueva instancia en "WhatsApp" primero.</div> : <select value={instanceId} onChange={(e) => setInstanceId(e.target.value)}><option value="">Selecciona una instancia...</option>{availableInstances.map((instance) => <option key={instance.id} value={instance.id}>{instance.name} ({instance.slug})</option>)}</select>}</div></div><div className="modal-actions"><button className="button" onClick={() => setCreateOpen(false)}>Cancelar</button><button className="button primary" disabled={creating || name.trim().length < 3 || !instanceId} onClick={() => void create()}>{creating ? 'Creando...' : 'Crear credencial'}</button></div></div></div>}

      {created && <div className="modal-backdrop" onClick={() => setCreated(null)}><div className="modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setCreated(null)} title="Cerrar"><X size={16} /></button><div className="modal-header"><h2>Credencial creada</h2><p>{created.warning}</p></div><div className="modal-body form-grid"><div className="field"><label>Nombre</label><input readOnly value={created.name} /></div><div className="field"><label>APP KEY</label><div className="secret-box">{created.appKey}</div></div><div className="field"><label>AUTH KEY</label><div className="secret-box">{created.authKey}</div></div><div className="warning-box"><KeyRound size={14} style={{verticalAlign:'middle',marginRight:6}}/>Cópialo ahora si lo necesitas. También podrás verlo más tarde desde el icono del ojo en la tabla.</div></div><div className="modal-actions"><button className="button" onClick={() => void copy(`${created.appKey}\n${created.authKey}`)}><Copy size={14} />Copiar</button><button className="button primary" onClick={() => setCreated(null)}>Ya lo guardé</button></div></div></div>}
    </AppShell>
  );
}
