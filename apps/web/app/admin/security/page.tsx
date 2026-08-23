'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api';

type LogEntry = {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  ip?: string | null;
  device: string;
  success: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  user?: { id: string; name: string; email: string } | null;
  company?: { id: string; name: string } | null;
};

const eventLabels: Record<string, string> = {
  LOGIN: 'Inicio de sesión',
  REGISTER: 'Registro',
  COMPANY_IMPERSONATED: 'Soporte (admin)',
  COMPANY_ACTIVATED: 'Activó empresa',
  COMPANY_SUSPENDED: 'Suspendió empresa',
  COMPANY_PLAN_CHANGED: 'Cambió plan',
};

const eventPillClass: Record<string, string> = {
  LOGIN: 'neutral',
  REGISTER: 'info',
  COMPANY_IMPERSONATED: 'warning',
  COMPANY_ACTIVATED: 'success',
  COMPANY_SUSPENDED: 'danger',
  COMPANY_PLAN_CHANGED: 'info',
};

function detailFor(item: LogEntry): string {
  if (item.action === 'LOGIN' && !item.success) {
    return item.metadata?.reason === 'INACTIVE_ACCOUNT' ? 'Cuenta inactiva' : 'Credenciales inválidas';
  }
  if (item.action === 'COMPANY_IMPERSONATED' && item.metadata?.actorName) {
    return `por ${item.metadata.actorName}`;
  }
  return '—';
}

export default function AdminSecurityPage() {
  const [items, setItems] = useState<LogEntry[]>([]);
  const [error, setError] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [event, setEvent] = useState('');
  const [status, setStatus] = useState('');

  // Debounce: espera a que el usuario deje de escribir antes de pegarle al backend.
  useEffect(() => {
    const timer = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (event) params.set('event', event);
    if (status) params.set('status', status);
    const query = params.toString();
    apiFetch<LogEntry[]>(`/admin/security-log${query ? `?${query}` : ''}`)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el registro de seguridad'));
  }, [q, event, status]);

  return (
    <AdminShell title="Seguridad" subtitle={`Accesos a la plataforma — desde dónde se conectan los clientes y qué intentos de acceso hubo. ${items.length} en total.`}>
      {error && <div className="error-box">{error}</div>}

      <div className="searchbox-row" style={{ marginBottom: 16 }}>
        <div className="searchbox"><Search size={16} /><input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Buscar por email o IP..." /></div>
        <select className="status-select" value={event} onChange={(e) => setEvent(e.target.value)}>
          <option value="">Todos los eventos</option>
          {Object.entries(eventLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select>
        <select className="status-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="success">Exitoso</option>
          <option value="failed">Fallido</option>
        </select>
      </div>

      <section className="table-card">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Evento</th>
              <th>Estado</th>
              <th>Cuenta</th>
              <th>IP</th>
              <th>Dispositivo</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.createdAt).toLocaleString('es-PE')}</td>
                <td><span className={`status-pill ${eventPillClass[item.action] || 'neutral'}`}>{eventLabels[item.action] || item.action}</span></td>
                <td><span className={`status-pill ${item.success ? 'success' : 'danger'}`}><span className="status-dot" />{item.success ? 'Exitoso' : 'Fallido'}</span></td>
                <td>
                  {item.user
                    ? <><span className="row-main">{item.user.name}</span><span className="row-sub">{item.user.email}</span></>
                    : <><span className="row-main">{String(item.metadata?.email || '—')}</span><span className="row-sub">Cuenta no encontrada</span></>}
                </td>
                <td>{item.ip || '—'}</td>
                <td>{item.device}</td>
                <td>{detailFor(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <div className="empty-state"><div><strong>Sin actividad registrada</strong>Los inicios de sesión, registros y accesos de soporte van a aparecer aquí.</div></div>}
      </section>
    </AdminShell>
  );
}
