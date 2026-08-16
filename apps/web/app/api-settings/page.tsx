'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, KeyRound, Plus, RefreshCw, RotateCw, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { ApiDocs } from '@/components/api-docs';
import { StatusPill } from '@/components/status-pill';
import { API_URL, apiFetch } from '@/lib/api';

type Credential = { id: string; name: string; appKey: string; instanceId?: string | null; active: boolean; lastUsedAt?: string | null; createdAt: string; instance?: { name: string; slug: string; status: string } | null };

type CreatedCredential = Credential & { authKey: string; warning: string };

export default function ApiSettingsPage() {
  const [items, setItems] = useState<Credential[]>([]);
  const [search, setSearch] = useState('');
  const [created, setCreated] = useState<CreatedCredential | null>(null);
  const [name, setName] = useState('BrainPOS Producción');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => { try { setItems(await apiFetch<Credential[]>('/api-credentials')); } catch (err) { setError(err instanceof Error ? err.message : 'Error'); } }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!created) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setCreated(null); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [created]);

  const create = async () => {
    setCreating(true); setError('');
    try { const data = await apiFetch<CreatedCredential>('/api-credentials', { method: 'POST', body: JSON.stringify({ name }) }); setCreated(data); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'Error'); } finally { setCreating(false); }
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
    <AppShell title="API e integraciones" subtitle="Credenciales para BrainPOS, ERP y sistemas externos" actions={<button className="button primary" onClick={() => void create()} disabled={creating}><Plus size={16} />Nueva credencial</button>}>
      {error && <div className="error-box">{error}</div>}
      <section className="api-hero"><div><h2>BrainWSP Gateway API</h2><p>Integra tus sistemas actuales sin conocer Baileys. BrainPOS y ERP solo necesitan la URL, APP KEY y AUTH KEY. La plataforma gestiona la cola, sesión, reconexión y entrega.</p></div><div className="api-url">{API_URL}/v1/messages/text</div></section>
      <div className="toolbar"><div className="searchbox"><Search size={17} /><input placeholder="Buscar credencial..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><button className="button" onClick={() => void load()}><RefreshCw size={14} />Actualizar</button></div>
      <div className="table-card">
        <table><thead><tr><th>Integración</th><th>APP KEY</th><th>Instancia</th><th>Último uso</th><th>Estado</th><th></th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><span className="row-main">{item.name}</span><span className="row-sub">Creada {new Date(item.createdAt).toLocaleDateString('es-PE')}</span></td><td><code className="app-key-cell">{revealed.has(item.id) ? item.appKey : `${item.appKey.slice(0, 13)}…${item.appKey.slice(-6)}`}</code><button className="icon-button ghost small" onClick={() => toggleReveal(item.id)} title={revealed.has(item.id) ? 'Ocultar' : 'Ver completo'}>{revealed.has(item.id) ? <EyeOff size={13} /> : <Eye size={13} />}</button></td><td>{item.instance?.name || 'Automática'}</td><td>{item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString('es-PE') : 'Nunca'}</td><td><StatusPill status={item.active ? 'active' : 'revoked'} /></td><td className="row-actions"><button className="icon-button" onClick={() => void copy(item.appKey)} title="Copiar APP KEY"><Copy size={15} /></button><button className="icon-button" disabled={busyId === item.id} onClick={() => void regenerate(item)} title="Regenerar AUTH KEY"><RotateCw size={15} /></button><button className="icon-button danger" disabled={busyId === item.id} onClick={() => void remove(item)} title="Eliminar credencial"><Trash2 size={15} /></button></td></tr>)}</tbody></table>
      </div>

      <section className="card" style={{marginTop:18}}><div className="card-header"><div><h2>Compatibilidad BrainPOS / ERP</h2><p>Endpoint legacy conservado para migrar sin romper tus sistemas actuales</p></div><ShieldCheck size={20} color="#168a55" /></div><div className="card-body"><div className="secret-box">POST {API_URL}/create-message<br/><br/>appkey=APP_KEY&amp;authkey=AUTH_KEY&amp;to=51999999999&amp;message=Hola</div></div></section>

      <ApiDocs appKey={items.find((item) => item.active)?.appKey} />

      {created && <div className="modal-backdrop" onClick={() => setCreated(null)}><div className="modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setCreated(null)} title="Cerrar"><X size={16} /></button><div className="modal-header"><h2>Credencial creada</h2><p>{created.warning}</p></div><div className="modal-body form-grid"><div className="field"><label>Nombre</label><input readOnly value={created.name} /></div><div className="field"><label>APP KEY</label><div className="secret-box">{created.appKey}</div></div><div className="field"><label>AUTH KEY</label><div className="secret-box">{created.authKey}</div></div><div className="warning-box"><KeyRound size={14} style={{verticalAlign:'middle',marginRight:6}}/>El AUTH KEY no se almacena en texto plano y no podrá mostrarse nuevamente.</div></div><div className="modal-actions"><button className="button" onClick={() => void copy(`${created.appKey}\n${created.authKey}`)}><Copy size={14} />Copiar</button><button className="button primary" onClick={() => setCreated(null)}>Ya lo guardé</button></div></div></div>}
    </AppShell>
  );
}
