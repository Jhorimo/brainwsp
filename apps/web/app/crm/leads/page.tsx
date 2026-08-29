'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { io } from 'socket.io-client';
import { Handshake, Kanban, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { NoteButton } from '@/components/note-button';
import { useConfirm } from '@/components/confirm-provider';
import { apiFetch, getToken, SOCKET_URL } from '@/lib/api';

type LeadStatus = 'NONE' | 'COLD' | 'INTERESTED' | 'VERY_INTERESTED';
type TeamUser = { id: string; name: string };
type Department = { id: string; name: string; active: boolean };
type Tag = { id: string; name: string; color: string };
type Lead = {
  id: string; title: string; personName?: string | null; personEmail?: string | null; companyName?: string | null;
  status: LeadStatus; channel?: string | null; source?: string | null; score?: number | null; value?: number | null;
  assignedUserId?: string | null; assignedUser?: TeamUser | null; departmentId?: string | null;
  convertedDealId?: string | null; createdAt: string;
  phone?: string | null; notes?: string | null; contactTags?: Tag[]; project?: { id: string; name: string } | null;
};

const statusLabels: Record<LeadStatus, string> = { NONE: 'Sin estado', COLD: 'Frío', INTERESTED: 'Interesado', VERY_INTERESTED: 'Muy interesado' };

const emptyForm = { title: '', personName: '', personEmail: '', personPhone: '', companyName: '', channel: '', source: '', value: '' };

type Preset = 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';
const presetLabels: Record<Preset, string> = { all: 'Todos', today: 'Hoy', yesterday: 'Ayer', '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', month: 'Este mes', custom: 'Personalizado' };

function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
// Un string de solo fecha como "2026-08-21" parseado con `new Date(...)` se lee como
// medianoche UTC, cayendo en el día calendario equivocado al pasar a la zona horaria local
// del navegador — se parsean los componentes directo a un Date en hora local en su lugar.
function parseDateInputValue(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export default function LeadsPage() {
  const confirm = useConfirm();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const todayValue = useMemo(() => toDateInputValue(new Date()), []);
  const [fromDate, setFromDate] = useState(todayValue);
  const [toDate, setToDate] = useState(todayValue);
  const [preset, setPreset] = useState<Preset>('all');

  const applyPreset = (next: Preset) => {
    if (next === 'all') { setPreset('all'); return; }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    const end = new Date(today);
    if (next === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
    else if (next === '7d') { start.setDate(start.getDate() - 6); }
    else if (next === '30d') { start.setDate(start.getDate() - 29); }
    else if (next === 'month') { start.setDate(1); }
    setFromDate(toDateInputValue(start));
    setToDate(toDateInputValue(end));
    setPreset(next);
  };

  useEffect(() => { void apiFetch<TeamUser[]>('/team/users').then(setTeamUsers).catch(() => undefined); }, []);
  useEffect(() => { void apiFetch<Department[]>('/team/departments').then((items) => setDepartments(items.filter((d) => d.active))).catch(() => undefined); }, []);
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 300); return () => clearTimeout(t); }, [qInput]);

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (filterStatus) params.set('status', filterStatus);
    // `to` viaja como límite superior EXCLUSIVO (medianoche del día siguiente al "hasta"
    // elegido) — mismo criterio que Dashboard/Pipelines/Tratos, así un rango de un solo día
    // cubre el día completo en vez de no matchear nada.
    if (preset !== 'all') {
      const start = parseDateInputValue(fromDate);
      const end = parseDateInputValue(toDate);
      end.setDate(end.getDate() + 1);
      params.set('from', start.toISOString());
      params.set('to', end.toISOString());
    }
    const query = params.toString();
    apiFetch<Lead[]>(`/crm/leads${query ? `?${query}` : ''}`).then(setLeads).catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los prospectos'));
  };
  useEffect(load, [q, filterStatus, preset, fromDate, toDate]);

  // Un prospecto puede llegar solo (mensaje nuevo de WhatsApp) o cambiar desde otra
  // pestaña/usuario (Conversaciones, Tratos) — se refresca la lista en vivo en vez de
  // requerir que el agente recargue la página para verlo.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { token: getToken() } });
    socket.on('connect', () => loadRef.current());
    socket.on('lead.created', () => loadRef.current());
    socket.on('lead.updated', () => loadRef.current());
    socket.on('lead.removed', () => loadRef.current());
    return () => { socket.disconnect(); };
  }, []);

  const updateLead = async (lead: Lead, data: Partial<{ status: LeadStatus; assignedUserId: string | null; departmentId: string | null }>) => {
    setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, ...data } : item));
    try { await apiFetch(`/crm/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify(data) }); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar el prospecto'); load(); }
  };

  const createLead = async () => {
    if (!form.title.trim()) return;
    setFormError('');
    setSaving(true);
    try {
      await apiFetch('/crm/leads', {
        method: 'POST',
        body: JSON.stringify({ ...form, value: form.value ? Number(form.value) : undefined }),
      });
      setCreateOpen(false);
      setForm(emptyForm);
      load();
    } catch (err) { setFormError(err instanceof Error ? err.message : 'No se pudo crear el prospecto'); }
    finally { setSaving(false); }
  };

  const convert = async (lead: Lead) => {
    setBusyId(lead.id + 'convert'); setError('');
    try { await apiFetch(`/crm/leads/${lead.id}/convert`, { method: 'POST' }); load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo convertir el prospecto'); }
    finally { setBusyId(null); }
  };

  const remove = async (lead: Lead) => {
    if (!(await confirm(`¿Eliminar el prospecto "${lead.title}"?`, { confirmText: 'Eliminar' }))) return;
    setBusyId(lead.id + 'delete');
    try { await apiFetch(`/crm/leads/${lead.id}`, { method: 'DELETE' }); load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo eliminar el prospecto'); }
    finally { setBusyId(null); }
  };

  return (
    <AppShell title="Prospectos" subtitle="Revisa los prospectos entrantes antes de convertirlos en tratos." actions={<button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={16} />Crear prospecto</button>}>
      {error && <div className="error-box">{error}</div>}

      <div className="searchbox-row" style={{ marginBottom: 16 }}>
        <div className="searchbox"><Search size={16} /><input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Buscar por título, persona, empresa..." /></div>
        <select className="status-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(statusLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select>
      </div>

      <div className="dashboard-range-bar">
        <div className="dashboard-range-presets">
          {(['all', 'today', 'yesterday', '7d', '30d', 'month'] as Preset[]).map((item) => (
            <button key={item} className={`chat-quick-tab ${preset === item ? 'active' : ''}`} onClick={() => applyPreset(item)}>{presetLabels[item]}</button>
          ))}
        </div>
        <div className="dashboard-range-custom">
          <input type="date" value={fromDate} max={toDate} onChange={(e) => { setFromDate(e.target.value); setPreset('custom'); }} />
          <span>–</span>
          <input type="date" value={toDate} min={fromDate} max={todayValue} onChange={(e) => { setToDate(e.target.value); setPreset('custom'); }} />
        </div>
      </div>

      <section className="table-card">
        <table>
          <thead>
            <tr>
              <th>Título</th>
              <th>Persona / Empresa</th>
              <th>Estado</th>
              <th>Departamento</th>
              <th>Proyecto</th>
              <th>Etiquetas</th>
              <th>Canal</th>
              <th>Valor</th>
              <th>Responsable</th>
              <th>Recibido</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <span className="row-main">{lead.title}</span>
                  {lead.notes && <NoteButton notes={lead.notes} />}
                  {lead.source && <span className="row-sub">{lead.source}</span>}
                </td>
                <td>
                  <span className="row-main">{lead.personName || '—'}</span>
                  <span className="row-sub">{lead.companyName || lead.personEmail || ''}</span>
                  {lead.phone && <span className="row-sub">{lead.phone}</span>}
                </td>
                <td>
                  <select className="status-select" value={lead.status} onChange={(e) => void updateLead(lead, { status: e.target.value as LeadStatus })}>
                    {Object.entries(statusLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
                  </select>
                </td>
                <td>
                  <select className="status-select" value={lead.departmentId || ''} onChange={(e) => void updateLead(lead, { departmentId: e.target.value || null })}>
                    <option value="">Sin departamento</option>
                    {departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}
                  </select>
                </td>
                <td>{lead.project?.name || '—'}</td>
                <td>{lead.contactTags?.length ? lead.contactTags.map((tag) => <span className="tag-pill" key={tag.id} style={{ background: `${tag.color}22`, color: tag.color, borderColor: `${tag.color}55` }}>{tag.name}</span>) : '—'}</td>
                <td>{lead.channel || '—'}</td>
                <td>{lead.value ? `USD ${lead.value.toLocaleString('es-PE')}` : '—'}</td>
                <td>
                  <select className="status-select" value={lead.assignedUserId || ''} onChange={(e) => void updateLead(lead, { assignedUserId: e.target.value || null })}>
                    <option value="">Sin asignar</option>
                    {teamUsers.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}
                  </select>
                </td>
                <td>{new Date(lead.createdAt).toLocaleDateString('es-PE')}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {lead.convertedDealId
                    ? <><Link className="button small" href="/crm/deals"><Handshake size={13} />Ver trato</Link>{' '}<Link className="button small" href={lead.departmentId ? `/crm/pipelines?departmentId=${lead.departmentId}` : '/crm/pipelines'}><Kanban size={13} />Ver Pipelines</Link></>
                    : <button className="button small primary" disabled={busyId === lead.id + 'convert' || !lead.departmentId} title={!lead.departmentId ? 'Asigna un departamento antes de convertir' : undefined} onClick={() => void convert(lead)}><Handshake size={13} />Convertir</button>}{' '}
                  <button className="button small danger" disabled={busyId === lead.id + 'delete'} onClick={() => void remove(lead)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!leads.length && <div className="empty-state"><div><UserPlus size={22} /><strong>Sin prospectos todavía</strong>Los prospectos nuevos van a aparecer acá.</div></div>}
      </section>

      {createOpen && (
        <div className="modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Crear prospecto</h2><p>Registra un contacto interesado antes de convertirlo en trato.</p></div>
            <div className="modal-body">
              {formError && <div className="error-box">{formError}</div>}
              <div className="form-grid">
                <div className="field"><label>Título</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej. Flete marítimo LCL" /></div>
                <div className="field"><label>Persona</label><input value={form.personName} onChange={(e) => setForm({ ...form, personName: e.target.value })} /></div>
                <div className="field"><label>Correo</label><input value={form.personEmail} onChange={(e) => setForm({ ...form, personEmail: e.target.value })} type="email" /></div>
                <div className="field"><label>Teléfono</label><input value={form.personPhone} onChange={(e) => setForm({ ...form, personPhone: e.target.value })} /></div>
                <div className="field"><label>Empresa</label><input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></div>
                <div className="field"><label>Canal</label><input value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} placeholder="Manual, WhatsApp, Meta Ads..." /></div>
                <div className="field"><label>Lead source</label><input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
                <div className="field"><label>Valor estimado (USD)</label><input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value.replace(/[^0-9]/g, '') })} /></div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setCreateOpen(false)}>Cancelar</button>
              <button className="button primary" disabled={saving || !form.title.trim()} onClick={() => void createLead()}>{saving ? 'Guardando...' : 'Crear prospecto'}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
