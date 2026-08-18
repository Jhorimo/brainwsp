'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api';

type Suggestion = {
  id: string; type: 'SUGGESTION' | 'BUG' | 'OTHER'; status: 'PENDING' | 'IN_REVIEW' | 'RESOLVED';
  subject: string; message: string; createdAt: string;
  company: { id: string; name: string };
  user: { id: string; name: string; email: string };
};

const typeLabels: Record<Suggestion['type'], string> = { SUGGESTION: 'Sugerencia', BUG: 'Error', OTHER: 'Otro' };
const statusLabels: Record<Suggestion['status'], string> = { PENDING: 'Pendiente', IN_REVIEW: 'En revisión', RESOLVED: 'Resuelto' };

export default function AdminSuggestionsPage() {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Suggestion[]>('/admin/suggestions').then(setItems).catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar las sugerencias'));
  }, []);

  return (
    <AdminShell title="Sugerencias" subtitle="Lo que reportan todos los clientes de la plataforma, en un solo lugar">
      {error && <div className="error-box">{error}</div>}
      <section className="table-card">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Reportado por</th>
              <th>Tipo</th>
              <th>Asunto</th>
              <th>Estado</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><span className="row-main">{item.company.name}</span></td>
                <td><span className="row-main">{item.user.name}</span><span className="row-sub">{item.user.email}</span></td>
                <td>{typeLabels[item.type]}</td>
                <td><span className="row-main">{item.subject}</span><span className="row-sub">{item.message}</span></td>
                <td><span className={`status-pill ${item.status === 'RESOLVED' ? 'success' : item.status === 'IN_REVIEW' ? 'warning' : 'neutral'}`}><span className="status-dot" />{statusLabels[item.status]}</span></td>
                <td>{new Date(item.createdAt).toLocaleDateString('es-PE')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <div className="empty-state"><div><strong>Sin sugerencias todavía</strong>Aparecerán aquí en cuanto algún cliente reporte algo desde su panel.</div></div>}
      </section>
    </AdminShell>
  );
}
