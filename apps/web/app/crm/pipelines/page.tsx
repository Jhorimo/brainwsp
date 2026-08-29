'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { io } from 'socket.io-client';
import { Kanban, MessageCircle, Plus } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { NoteButton } from '@/components/note-button';
import { apiFetch, getToken, SOCKET_URL } from '@/lib/api';

type TeamUser = { id: string; name: string };
type Tag = { id: string; name: string; color: string };
type Stage = { id: string; name: string; color: string; isWon: boolean; order: number };
type Department = { id: string; name: string; isDefault: boolean; stages: Stage[] };
type Deal = {
  id: string; title: string; value?: number | null; stage: { id: string }; probability?: number | null; conversationId?: string | null;
  assignedUser?: TeamUser | null; companyName?: string | null; personName?: string | null;
  phone?: string | null; notes?: string | null; contactTags?: Tag[]; project?: { id: string; name: string } | null;
};

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

function initialsOf(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function DealCard({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.35 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="kanban-card">
      <div className="kanban-card-title-row">
        <strong>{deal.title}</strong>
        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {deal.conversationId && (
            <Link
              className="row-note-icon"
              href={`/conversations?id=${deal.conversationId}`}
              title="Ver conversación"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <MessageCircle size={12} />
            </Link>
          )}
          {deal.notes && <NoteButton notes={deal.notes} />}
        </span>
      </div>
      {deal.value ? <span className="kanban-card-value">USD {deal.value.toLocaleString('es-PE')}</span> : null}
      {(deal.companyName || deal.personName) && <span className="kanban-card-meta">{deal.companyName || deal.personName}</span>}
      {deal.phone && <span className="kanban-card-meta">{deal.phone}</span>}
      {deal.project && <span className="kanban-card-project">{deal.project.name}</span>}
      {!!deal.contactTags?.length && (
        <div className="kanban-card-tags">
          {deal.contactTags.map((tag) => <span className="tag-pill" key={tag.id} style={{ background: `${tag.color}22`, color: tag.color, borderColor: `${tag.color}55` }}>{tag.name}</span>)}
        </div>
      )}
      <div className="kanban-card-footer">
        {deal.assignedUser ? (
          <span className="kanban-card-assignee" title={deal.assignedUser.name}>
            <span className="kanban-card-avatar">{initialsOf(deal.assignedUser.name)}</span>
            <span className="kanban-card-assignee-name">{deal.assignedUser.name.split(' ')[0]}</span>
          </span>
        ) : <span className="kanban-card-assignee-name">Sin responsable</span>}
        {deal.probability != null && <span className="kanban-card-probability">{deal.probability}%</span>}
      </div>
    </div>
  );
}

function StageColumn({ stage, deals }: { stage: Stage; deals: Deal[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((sum, d) => sum + (d.value || 0), 0);
  return (
    <div className={`kanban-column ${isOver ? 'over' : ''}`}>
      <div className="kanban-column-header" style={{ borderColor: stage.color }}>
        <span>{stage.name}</span>
        <span className="kanban-count">{deals.length}</span>
      </div>
      <div className="kanban-column-total">USD {total.toLocaleString('es-PE')}</div>
      <div ref={setNodeRef} className="kanban-column-body">
        {deals.map((deal) => <DealCard deal={deal} key={deal.id} />)}
        {!deals.length && <p className="contact-empty-hint">Suelta un trato acá</p>}
      </div>
    </div>
  );
}

export default function PipelinesPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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

  // `to` viaja como límite superior EXCLUSIVO (medianoche del día siguiente al "hasta"
  // elegido) — mismo criterio que el Dashboard, así un rango de un solo día cubre el día
  // completo en vez de no matchear nada.
  const rangeQuery = useMemo(() => {
    if (preset === 'all') return '';
    const start = parseDateInputValue(fromDate);
    const end = parseDateInputValue(toDate);
    end.setDate(end.getDate() + 1);
    return `&from=${start.toISOString()}&to=${end.toISOString()}`;
  }, [preset, fromDate, toDate]);

  useEffect(() => {
    // Enlace directo desde /crm/leads ("Ver Pipelines") — si trae ?departmentId=, abrir ese
    // tablero en vez del predeterminado de la empresa.
    const requestedDepartmentId = new URLSearchParams(window.location.search).get('departmentId') || '';
    apiFetch<Department[]>('/crm/pipelines')
      .then((items) => {
        setDepartments(items);
        const requested = requestedDepartmentId && items.some((d) => d.id === requestedDepartmentId) ? requestedDepartmentId : '';
        setDepartmentId((current) => current || requested || items.find((d) => d.isDefault)?.id || items[0]?.id || '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los departamentos'))
      .finally(() => setLoaded(true));
  }, []);

  const load = () => {
    if (!departmentId) return;
    apiFetch<Deal[]>(`/crm/deals?departmentId=${departmentId}${rangeQuery}`).then(setDeals).catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los tratos'));
  };
  useEffect(load, [departmentId, rangeQuery]);

  // Un trato puede moverse de etapa desde Conversaciones o desde Tratos — se refresca el
  // Kanban en vivo en vez de requerir recargar la página para ver la tarjeta en su columna.
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

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const stageId = String(over.id);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage.id === stageId) return;
    setDeals((current) => current.map((d) => d.id === dealId ? { ...d, stage: { id: stageId } } : d));
    try { await apiFetch(`/crm/deals/${dealId}`, { method: 'PATCH', body: JSON.stringify({ stageId }) }); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo mover el trato'); load(); }
  };

  const createDeal = async () => {
    if (!title.trim() || !currentDepartment) return;
    setSaving(true);
    try {
      await apiFetch('/crm/deals', { method: 'POST', body: JSON.stringify({ title: title.trim(), departmentId: currentDepartment.id, stageId: currentDepartment.stages[0]?.id }) });
      setCreateOpen(false);
      setTitle('');
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear el trato'); }
    finally { setSaving(false); }
  };

  return (
    <AppShell title="Pipelines" subtitle="Visualiza tus tratos por etapa y arrástralos entre columnas." actions={<button className="button primary" onClick={() => setCreateOpen(true)} disabled={!currentDepartment}><Plus size={16} />Crear trato</button>}>
      {error && <div className="error-box">{error}</div>}

      {departments.length > 0 && (
        <div className="searchbox-row" style={{ marginBottom: 16 }}>
          <select className="status-select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            {departments.map((d) => <option value={d.id} key={d.id}>Departamento: {d.name}</option>)}
          </select>
        </div>
      )}

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

      {currentDepartment ? (
        <DndContext sensors={sensors} onDragEnd={(e) => void onDragEnd(e)}>
          <div className="kanban-board">
            {currentDepartment.stages.map((stage) => (
              <StageColumn key={stage.id} stage={stage} deals={deals.filter((d) => d.stage.id === stage.id)} />
            ))}
            {!currentDepartment.stages.length && <div className="empty-state"><div><Kanban size={22} /><strong>Este departamento todavía no tiene etapas</strong>Créalas en Equipo y agentes → Etapas.</div></div>}
          </div>
        </DndContext>
      ) : (
        <div className="empty-state">
          <div>
            <Kanban size={22} />
            <strong>{loaded ? 'Aún no hay departamentos' : 'Cargando...'}</strong>
            {loaded && 'Crea un departamento en Equipo y agentes para ver su Pipeline acá.'}
          </div>
        </div>
      )}

      {createOpen && (
        <div className="modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Crear trato</h2><p>Se crea en la primera etapa de &quot;{currentDepartment?.name}&quot;.</p></div>
            <div className="modal-body">
              <div className="field"><label>Título</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Flete marítimo LCL" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') void createDeal(); }} /></div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setCreateOpen(false)}>Cancelar</button>
              <button className="button primary" disabled={saving || !title.trim()} onClick={() => void createDeal()}>{saving ? 'Guardando...' : 'Crear trato'}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
