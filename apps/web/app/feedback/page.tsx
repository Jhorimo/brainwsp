'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Lightbulb, MessageCircle } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type FeedbackType = 'SUGGESTION' | 'BUG' | 'OTHER';
type FeedbackStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED';
type FeedbackItem = {
  id: string;
  type: FeedbackType;
  status: FeedbackStatus;
  subject: string;
  message: string;
  createdAt: string;
  user: { id: string; name: string };
  department?: { id: string; name: string } | null;
};

const typeMeta: Record<FeedbackType, { label: string; icon: typeof Lightbulb }> = {
  SUGGESTION: { label: 'Sugerencia', icon: Lightbulb },
  BUG: { label: 'Error', icon: AlertTriangle },
  OTHER: { label: 'Otro', icon: MessageCircle },
};

const statusLabels: Record<FeedbackStatus, string> = { PENDING: 'Pendiente', IN_REVIEW: 'En revisión', RESOLVED: 'Resuelto' };

export default function FeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [error, setError] = useState('');
  const [canManage, setCanManage] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await apiFetch<FeedbackItem[]>('/feedback')); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron cargar los reportes'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('brainwsp_user') || '{}');
      setCanManage(['OWNER', 'ADMIN'].includes(String(user.role || '')));
    } catch {}
  }, []);

  const updateStatus = async (item: FeedbackItem, status: FeedbackStatus) => {
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status } : entry));
    try {
      await apiFetch(`/feedback/${item.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    } catch (err) {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: item.status } : entry));
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado');
    }
  };

  return (
    <AppShell title="Sugerencias y reportes" subtitle="Lo que tu equipo reporta sobre BrainWSP">
      {error && <div className="error-box">{error}</div>}
      <section className="table-card">
        <table>
          <thead><tr><th>Asunto</th><th>Tipo</th><th>Área</th><th>Reportado por</th><th>Fecha</th><th>Estado</th></tr></thead>
          <tbody>
            {items.map((item) => {
              const meta = typeMeta[item.type];
              const Icon = meta.icon;
              return (
                <tr key={item.id}>
                  <td><span className="row-main">{item.subject}</span><span className="row-sub">{item.message}</span></td>
                  <td><span className={`feedback-type-badge feedback-type-${item.type.toLowerCase()}`}><Icon size={12} />{meta.label}</span></td>
                  <td>{item.department?.name || 'General'}</td>
                  <td>{item.user.name}</td>
                  <td>{new Date(item.createdAt).toLocaleDateString('es-PE')}</td>
                  <td>
                    {canManage ? (
                      <select className={`status-select status-select-${item.status.toLowerCase()}`} value={item.status} onChange={(e) => void updateStatus(item, e.target.value as FeedbackStatus)}>
                        <option value="PENDING">Pendiente</option>
                        <option value="IN_REVIEW">En revisión</option>
                        <option value="RESOLVED">Resuelto</option>
                      </select>
                    ) : (
                      <span className={`status-pill ${item.status === 'RESOLVED' ? 'success' : item.status === 'IN_REVIEW' ? 'warning' : 'neutral'}`}><span className="status-dot" />{statusLabels[item.status]}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items.length && <div className="empty-state"><div><strong>Aún no hay reportes</strong>Usa el botón flotante para mandar una sugerencia o reportar un error.</div></div>}
      </section>
    </AppShell>
  );
}
