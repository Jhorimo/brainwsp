'use client';

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Handshake, Plus, Search, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { NoteButton } from '@/components/note-button';
import { useConfirm } from '@/components/confirm-provider';
import { apiFetch, getToken, SOCKET_URL } from '@/lib/api';

type TeamUser = { id: string; name: string };
type Stage = { id: string; name: string; color: string; isWon: boolean };
type Department = { id: string; name: string; isDefault: boolean; stages: Stage[] };
type Tag = { id: string; name: string; color: string };
type Deal = {
  id: string; title: string; value?: number | null; departmentId: string; stage: Stage; probability?: number | null;
  expectedCloseAt?: string | null; assignedUserId?: string | null; assignedUser?: TeamUser | null;
  companyName?: string | null; personName?: string | null; tags: Tag[]; createdAt: string;
  phone?: string | null; notes?: string | null; contactTags?: Tag[]; project?: { id: string; name: string } | null;
};

const emptyForm = { title: '', companyName: '', personName: '', personEmail: '', personPhone: '', value: '' };

export default function DealsPage() {
  const confirm = useConfirm();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [error, setError] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<TeamUser[]>('/team/users').then(setTeamUsers).catch(() => undefined);
    void apiFetch<Department[]>('/crm/pipelines').then((items) => { setDepartments(items); setDepartmentId((current) => current || items.find((d) => d.isDefault)?.id || items[0]?.id || ''); }).catch(() => undefined);
  }, []);
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 300); return () => clearTimeout(t); }, [qInput]);

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (departmentId) params.set('departmentId', departmentId);
    const query = params.toString();
    apiFetch<Deal[]>(`/crm/deals${query ? `?${query}` : ''}`).then(setDeals).catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los tratos'));
  };
  useEffect(load, [q, departmentId]);

  // Un trato puede moverse de etapa desde Conversaciones o desde el Kanban de Pipelines —
  // se refresca en vivo en vez de requerir recargar la página para ver el cambio acá.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { token: getToken() } });
    socket.on('connect', () => loadRef.current());
    socket.on('deal.created', () => loadRef.current());
    socket.on('deal.updated', () => loadRef.current());
    socket.on('deal.removed', () => loadRef.current());
    return () => { socket.disconnect(); };
  }, []);

  const currentDepartment = departments.find((d) => d.id === departmentId);

  const updateDeal = async (deal: Deal, data: Record<string, unknown>) => {
    try { await apiFetch(`/crm/deals/${deal.id}`, { method: 'PATCH', body: JSON.stringify(data) }); load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar el trato'); }
  };

  const createDeal = async () => {
    if (!form.title.trim() || !currentDepartment) return;
    setFormError('');
    setSaving(true);
    try {
      await apiFetch('/crm/deals', {
        method: 'POST',
        body: JSON.stringify({ ...form, departmentId: currentDepartment.id, stageId: currentDepartment.stages[0]?.id, value: form.value ? Number(form.value) : undefined }),
      });
      setCreateOpen(false);
      setForm(emptyForm);
      load();
    } catch (err) { setFormError(err instanceof Error ? err.message : 'No se pudo crear el trato'); }
    finally { setSaving(false); }
  };

  const remove = async (deal: Deal) => {
    if (!(await confirm(`¿Eliminar el trato "${deal.title}"?`, { confirmText: 'Eliminar' }))) return;
    setBusyId(deal.id);
    try { await apiFetch(`/crm/deals/${deal.id}`, { method: 'DELETE' }); load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo eliminar el trato'); }
    finally { setBusyId(null); }
  };

  return (
    <AppShell title="Tratos" subtitle="Gestiona todos tus tratos en una planilla editable." actions={<button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={16} />Crear trato</button>}>
      {error && <div className="error-box">{error}</div>}

      <div className="searchbox-row" style={{ marginBottom: 16 }}>
        <div className="searchbox"><Search size={16} /><input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Buscar por título, persona, empresa..." /></div>
        <select className="status-select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          {departments.map((d) => <option value={d.id} key={d.id}>Departamento: {d.name}</option>)}
        </select>
      </div>

      <section className="table-card">
        <table>
          <thead>
            <tr>
              <th>Título</th>
              <th>Etapa</th>
              <th>Valor</th>
              <th>Responsable</th>
              <th>Empresa / Persona</th>
              <th>Proyecto</th>
              <th>Cierre esperado</th>
              <th>Probabilidad</th>
              <th>Etiquetas</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => (
              <tr key={deal.id}>
                <td>
                  <span className="row-main">{deal.title}</span>
                  {deal.notes && <NoteButton notes={deal.notes} />}
                </td>
                <td>
                  <select className="status-select" style={{ color: deal.stage.color, borderColor: `${deal.stage.color}55`, background: `${deal.stage.color}18` }} value={deal.stage.id} onChange={(e) => void updateDeal(deal, { stageId: e.target.value })}>
                    {currentDepartment?.stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}
                  </select>
                </td>
                <td>{deal.value ? `USD ${deal.value.toLocaleString('es-PE')}` : '—'}</td>
                <td>
                  <select className="status-select" value={deal.assignedUserId || ''} onChange={(e) => void updateDeal(deal, { assignedUserId: e.target.value || null })}>
                    <option value="">Sin asignar</option>
                    {teamUsers.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}
                  </select>
                </td>
                <td>
                  <span className="row-main">{deal.companyName || '—'}</span>
                  <span className="row-sub">{deal.personName || ''}</span>
                  {deal.phone && <span className="row-sub">{deal.phone}</span>}
                </td>
                <td>{deal.project?.name || '—'}</td>
                <td>{deal.expectedCloseAt ? new Date(deal.expectedCloseAt).toLocaleDateString('es-PE') : '—'}</td>
                <td>{deal.probability != null ? `${deal.probability}%` : '—'}</td>
                <td>{deal.contactTags?.length ? deal.contactTags.map((tag) => <span className="tag-pill" key={tag.id} style={{ background: `${tag.color}22`, color: tag.color, borderColor: `${tag.color}55` }}>{tag.name}</span>) : '—'}</td>
                <td style={{ textAlign: 'right' }}><button className="button small danger" disabled={busyId === deal.id} onClick={() => void remove(deal)}><Trash2 size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!deals.length && <div className="empty-state"><div><Handshake size={22} /><strong>Sin tratos todavía</strong>Convierte un prospecto o crea un trato directamente.</div></div>}
      </section>

      {createOpen && (
        <div className="modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Crear trato</h2><p>Se crea en la primera etapa de &quot;{currentDepartment?.name}&quot;.</p></div>
            <div className="modal-body">
              {formError && <div className="error-box">{formError}</div>}
              <div className="form-grid">
                <div className="field"><label>Título</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej. Flete marítimo LCL" /></div>
                <div className="field"><label>Empresa</label><input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></div>
                <div className="field"><label>Persona</label><input value={form.personName} onChange={(e) => setForm({ ...form, personName: e.target.value })} /></div>
                <div className="field"><label>Correo</label><input value={form.personEmail} onChange={(e) => setForm({ ...form, personEmail: e.target.value })} type="email" /></div>
                <div className="field"><label>Teléfono</label><input value={form.personPhone} onChange={(e) => setForm({ ...form, personPhone: e.target.value })} /></div>
                <div className="field"><label>Valor (USD)</label><input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value.replace(/[^0-9]/g, '') })} /></div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setCreateOpen(false)}>Cancelar</button>
              <button className="button primary" disabled={saving || !form.title.trim()} onClick={() => void createDeal()}>{saving ? 'Guardando...' : 'Crear trato'}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
