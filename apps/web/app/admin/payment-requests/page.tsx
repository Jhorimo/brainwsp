'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, X } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { adminPaymentRequestProofUrl, apiFetch } from '@/lib/api';

type PaymentRequest = {
  id: string;
  whatsappPhone: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  company: { id: string; name: string };
  plan: { id: string; name: string; billingCycle: string; price: number; priceUsd: number };
  paymentMethod?: { id: string; label: string } | null;
  reviewedBy?: { id: string; name: string } | null;
};

const statusLabels: Record<PaymentRequest['status'], string> = { PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada' };
const statusPillClass: Record<PaymentRequest['status'], string> = { PENDING: 'neutral', APPROVED: 'success', REJECTED: 'danger' };

function formatPrice(plan: PaymentRequest['plan']) {
  if (plan.priceUsd) return `US$ ${(plan.priceUsd / 100).toFixed(2)}`;
  if (plan.price) return `S/ ${(plan.price / 100).toFixed(2)}`;
  return 'Gratis';
}

export default function AdminPaymentRequestsPage() {
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<'' | PaymentRequest['status']>('PENDING');
  const [error, setError] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      setRequests(await apiFetch<PaymentRequest[]>(`/admin/payment-requests${params}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las solicitudes');
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const approve = async (request: PaymentRequest) => {
    setBusyId(request.id);
    setError('');
    try {
      await apiFetch(`/admin/payment-requests/${request.id}/approve`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aprobar la solicitud');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!rejectId) return;
    setBusyId(rejectId);
    setError('');
    try {
      await apiFetch(`/admin/payment-requests/${rejectId}/reject`, { method: 'POST', body: JSON.stringify({ note: rejectNote.trim() || undefined }) });
      setRejectId(null);
      setRejectNote('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo rechazar la solicitud');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminShell title="Solicitudes de pago" subtitle="Revisa los comprobantes de pago manual que suben tus clientes desde Mi Plan">
      {error && <div className="error-box">{error}</div>}

      <div className="chat-quick-filters" style={{ marginBottom: 16 }}>
        {(['PENDING', 'APPROVED', 'REJECTED', ''] as const).map((status) => (
          <button key={status || 'all'} type="button" className={`chat-quick-tab ${statusFilter === status ? 'active' : ''}`} onClick={() => setStatusFilter(status)}>
            {status ? statusLabels[status] : 'Todas'}
          </button>
        ))}
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Plan solicitado</th>
              <th>Método</th>
              <th>WhatsApp</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td><div className="row-main">{request.company.name}</div></td>
                <td>{request.plan.name} <span className="row-sub" style={{ marginTop: 0 }}>{formatPrice(request.plan)}</span></td>
                <td>{request.paymentMethod?.label || '—'}</td>
                <td>{request.whatsappPhone}</td>
                <td>{new Date(request.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                <td><span className={`status-pill ${statusPillClass[request.status]}`}><span className="status-dot" /> {statusLabels[request.status]}</span></td>
                <td>
                  <div className="row-actions">
                    <a className="button small" href={adminPaymentRequestProofUrl(request.id)} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Ver comprobante</a>
                    {request.status === 'PENDING' && (
                      <>
                        <button className="button small primary" disabled={busyId === request.id} onClick={() => void approve(request)}><Check size={13} /> Aprobar</button>
                        <button className="button small danger" disabled={busyId === request.id} onClick={() => { setRejectId(request.id); setRejectNote(''); }}><X size={13} /> Rechazar</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!requests.length && (
              <tr><td colSpan={7}><div className="empty-state"><div><strong>No hay solicitudes {statusFilter ? `en estado "${statusLabels[statusFilter]}"` : ''}</strong></div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {rejectId && (
        <div className="modal-backdrop" onClick={() => setRejectId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Rechazar solicitud</h2><p>Opcionalmente, dile al cliente por qué (se guarda en el historial).</p></div>
            <div className="modal-body">
              <div className="field"><label>Motivo (opcional)</label><textarea rows={3} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="El comprobante no coincide con el monto del plan" /></div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setRejectId(null)}>Cancelar</button>
              <button className="button primary" disabled={busyId === rejectId} onClick={() => void reject()}>{busyId === rejectId ? 'Rechazando...' : 'Rechazar solicitud'}</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
