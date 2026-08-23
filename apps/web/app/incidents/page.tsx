'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Lightbulb, MessageCircle } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { apiFetch, getStoredUser } from '@/lib/api';

type IncidentType = 'SUGGESTION' | 'BUG' | 'OTHER';
type IncidentStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';
type Department = { id: string; name: string; users: Array<{ user: { id: string } }> };
type IncidentItem = {
  id: string;
  type: IncidentType;
  status: IncidentStatus;
  subject: string;
  message: string;
  createdAt: string;
  conversation: { id: string; contact: { id: string; name?: string | null; pushName?: string | null; phone?: string | null; waId: string } };
  department: { id: string; name: string };
  createdByUser: { id: string; name: string };
};

const typeMeta: Record<IncidentType, { label: string; icon: typeof Lightbulb }> = {
  BUG: { label: 'Error', icon: AlertTriangle },
  SUGGESTION: { label: 'Sugerencia', icon: Lightbulb },
  OTHER: { label: 'Otro', icon: MessageCircle },
};

const statusLabels: Record<IncidentStatus, string> = { PENDING: 'Pendiente', IN_PROGRESS: 'En proceso', RESOLVED: 'Solucionado' };

function clientName(incident: IncidentItem) {
  const contact = incident.conversation.contact;
  return contact.name || contact.pushName || contact.phone || contact.waId.split('@')[0] || 'Cliente';
}

export default function IncidentsPage() {
  const [items, setItems] = useState<IncidentItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [identity, setIdentity] = useState({ id: '', role: '' });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [incidents, teamDepartments] = await Promise.all([
        apiFetch<IncidentItem[]>('/incidents'),
        apiFetch<Department[]>('/team/departments'),
      ]);
      setItems(incidents);
      setDepartments(teamDepartments);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las incidencias');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    try {
      const user = getStoredUser<{ id?: string; role?: string }>();
      setIdentity({ id: String(user.id || ''), role: String(user.role || '') });
    } catch {}
  }, []);

  const isAdmin = identity.role === 'OWNER' || identity.role === 'ADMIN';
  const myDepartmentIds = useMemo(() => new Set(
    departments.filter((department) => department.users.some((item) => item.user.id === identity.id)).map((department) => department.id),
  ), [departments, identity.id]);
  const canManage = useCallback((incident: IncidentItem) => isAdmin || myDepartmentIds.has(incident.department.id), [isAdmin, myDepartmentIds]);

  const updateStatus = async (incident: IncidentItem, status: IncidentStatus) => {
    setItems((current) => current.map((entry) => entry.id === incident.id ? { ...entry, status } : entry));
    try {
      await apiFetch(`/incidents/${incident.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    } catch (err) {
      setItems((current) => current.map((entry) => entry.id === incident.id ? { ...entry, status: incident.status } : entry));
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la incidencia');
    }
  };

  return (
    <AppShell title="Incidencias" subtitle="Reportes de clientes clasificados y asignados al área que debe resolverlos">
      {error && <div className="error-box">{error}</div>}
      <section className="table-card">
        <table>
          <thead><tr><th>Cliente</th><th>Asunto</th><th>Tipo</th><th>Área asignada</th><th>Reportado por</th><th>Fecha</th><th>Estado</th></tr></thead>
          <tbody>
            {items.map((incident) => {
              const meta = typeMeta[incident.type];
              const Icon = meta.icon;
              return (
                <tr key={incident.id}>
                  <td>{clientName(incident)}</td>
                  <td><span className="row-main">{incident.subject}</span><span className="row-sub">{incident.message}</span></td>
                  <td><span className={`feedback-type-badge feedback-type-${incident.type.toLowerCase()}`}><Icon size={12} />{meta.label}</span></td>
                  <td>{incident.department.name}</td>
                  <td>{incident.createdByUser.name}</td>
                  <td>{new Date(incident.createdAt).toLocaleDateString('es-PE')}</td>
                  <td>
                    {canManage(incident) ? (
                      <select className={`status-select status-select-${incident.status.toLowerCase()}`} value={incident.status} onChange={(e) => void updateStatus(incident, e.target.value as IncidentStatus)}>
                        <option value="PENDING">Pendiente</option>
                        <option value="IN_PROGRESS">En proceso</option>
                        <option value="RESOLVED">Solucionado</option>
                      </select>
                    ) : (
                      <span className={`status-pill ${incident.status === 'RESOLVED' ? 'success' : incident.status === 'IN_PROGRESS' ? 'warning' : 'neutral'}`}><span className="status-dot" />{statusLabels[incident.status]}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items.length && <div className="empty-state"><div><strong>Aún no hay incidencias</strong>Se crean desde una conversación con el botón &quot;Incidencia&quot;.</div></div>}
      </section>
    </AppShell>
  );
}
