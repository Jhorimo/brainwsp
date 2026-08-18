'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api';

type LogEntry = {
  id: string; action: string; entity: string; entityId?: string | null; createdAt: string;
  user?: { id: string; name: string; email: string } | null;
  company?: { id: string; name: string } | null;
};

const actionLabels: Record<string, string> = {
  COMPANY_ACTIVATED: 'Activó la empresa',
  COMPANY_SUSPENDED: 'Suspendió la empresa',
  COMPANY_PLAN_CHANGED: 'Cambió el plan de',
  COMPANY_IMPERSONATED: 'Entró al panel de',
};

export default function AdminSecurityPage() {
  const [items, setItems] = useState<LogEntry[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<LogEntry[]>('/admin/security-log').then(setItems).catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el registro de seguridad'));
  }, []);

  return (
    <AdminShell title="Seguridad" subtitle="Registro de acciones administrativas sobre las cuentas de clientes">
      {error && <div className="error-box">{error}</div>}
      <section className="table-card">
        <table>
          <thead>
            <tr>
              <th>Administrador</th>
              <th>Acción</th>
              <th>Cliente</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><span className="row-main">{item.user?.name || 'Sistema'}</span><span className="row-sub">{item.user?.email}</span></td>
                <td>{actionLabels[item.action] || item.action}</td>
                <td>{item.company?.name || '—'}</td>
                <td>{new Date(item.createdAt).toLocaleString('es-PE')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <div className="empty-state"><div><strong>Sin actividad registrada</strong>Las acciones sobre clientes (suspender, cambiar plan, entrar a su panel) van a aparecer aquí.</div></div>}
      </section>
    </AdminShell>
  );
}
