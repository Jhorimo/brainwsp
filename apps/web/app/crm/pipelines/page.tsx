'use client';

import { useEffect, useRef, useState } from 'react';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { io } from 'socket.io-client';
import { Kanban, Plus } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { apiFetch, getToken, SOCKET_URL } from '@/lib/api';

type TeamUser = { id: string; name: string };
type Stage = { id: string; name: string; color: string; isWon: boolean; order: number };
type Department = { id: string; name: string; stages: Stage[] };
type Deal = {
  id: string; title: string; value?: number | null; stage: { id: string }; probability?: number | null;
  assignedUser?: TeamUser | null; companyName?: string | null; personName?: string | null;
};

function initialsOf(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function DealCard({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.35 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="kanban-card">
      <strong>{deal.title}</strong>
      {deal.value ? <span className="kanban-card-value">USD {deal.value.toLocaleString('es-PE')}</span> : null}
      {(deal.companyName || deal.personName) && <span className="kanban-card-meta">{deal.companyName || deal.personName}</span>}
      <div className="kanban-card-footer">
        {deal.assignedUser ? <span className="kanban-card-avatar" title={deal.assignedUser.name}>{initialsOf(deal.assignedUser.name)}</span> : <span />}
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

  useEffect(() => {
    apiFetch<Department[]>('/crm/pipelines')
      .then((items) => { setDepartments(items); setDepartmentId((current) => current || items[0]?.id || ''); })
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los departamentos'))
      .finally(() => setLoaded(true));
  }, []);

  const load = () => {
    if (!departmentId) return;
    apiFetch<Deal[]>(`/crm/deals?departmentId=${departmentId}`).then(setDeals).catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los tratos'));
  };
  useEffect(load, [departmentId]);

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
