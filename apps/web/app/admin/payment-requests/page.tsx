'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, Plus, X } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { adminPaymentRequestProofUrl, apiFetch } from '@/lib/api';

type PaymentRequest = {
  id: string;
  whatsappPhone: string | null;
  proofUrl?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reviewNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  company: { id: string; name: string };
  plan: { id: string; name: string; billingCycle: string; price: number; priceUsd: number };
  paymentMethod?: { id: string; label: string } | null;
  reviewedBy?: { id: string; name: string } | null;
};

type Company = { id: string; name: string; users: { id: string; name: string; email: string }[] };
type Plan = { id: string; name: string; billingCycle: string; price: number; priceUsd: number; active: boolean };
type PaymentMethod = { id: string; label: string; active: boolean };

const statusLabels: Record<PaymentRequest['status'], string> = { PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada' };
const statusPillClass: Record<PaymentRequest['status'], string> = { PENDING: 'neutral', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' };

function formatPrice(plan: PaymentRequest['plan']) {
  if (plan.priceUsd) return `US$ ${(plan.priceUsd / 100).toFixed(2)}`;
  if (plan.price) return `S/ ${(plan.price / 100).toFixed(2)}`;
  return 'Gratis';
}

const emptyNewForm = { companyId: '', planId: '', paymentMethodId: '', status: 'APPROVED' as 'PENDING' | 'APPROVED' };

export default function AdminPaymentRequestsPage() {
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<'' | PaymentRequest['status']>('PENDING');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [newModal, setNewModal] = useState(false);
  const [newForm, setNewForm] = useState(emptyNewForm);
  const [saving, setSaving] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      setRequests(await apiFetch<PaymentRequest[]>(`/admin/payment-requests${params}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las solicitudes');
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const openNew = async () => {
    setNewForm(emptyNewForm);
    setCompanySearch('');
    setCompanyPickerOpen(false);
    setNewModal(true);
    try {
      const [companyList, planList, methodList] = await Promise.all([
        apiFetch<Company[]>('/admin/companies'),
        apiFetch<Plan[]>('/admin/plans'),
        apiFetch<PaymentMethod[]>('/admin/payment-methods'),
      ]);
      setCompanies(companyList);
      setPlans(planList.filter((plan) => plan.active));
      setPaymentMethods(methodList.filter((method) => method.active));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar empresas y planes');
    }
  };

  const selectedPlan = plans.find((plan) => plan.id === newForm.planId);

  const companyMatches = (company: Company, query: string) => {
    const owner = company.users[0];
    const haystack = `${company.name} ${owner?.name || ''} ${owner?.email || ''}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  };
  const filteredCompanies = companySearch.trim() ? companies.filter((c) => companyMatches(c, companySearch)) : companies;

  const selectCompany = (company: Company) => {
    setNewForm({ ...newForm, companyId: company.id });
    setCompanySearch(company.name);
    setCompanyPickerOpen(false);
  };

  const createPaymentRequest = async () => {
    if (!newForm.companyId || !newForm.planId) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch('/admin/payment-requests', {
        method: 'POST',
        body: JSON.stringify({
          companyId: newForm.companyId,
          planId: newForm.planId,
          paymentMethodId: newForm.paymentMethodId || undefined,
          status: newForm.status,
        }),
      });
      setNewModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago');
    } finally {
      setSaving(false);
    }
  };

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

  const cancel = async () => {
    if (!cancelId) return;
    setBusyId(cancelId);
    setError('');
    setSuccessMsg('');
    try {
      const result = await apiFetch<{ companyReverted: boolean }>(`/admin/payment-requests/${cancelId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ note: cancelNote.trim() || undefined }),
      });
      setCancelId(null);
      setCancelNote('');
      setSuccessMsg(result.companyReverted
        ? 'Solicitud cancelada — el plan de la empresa volvió a como estaba antes de esta aprobación.'
        : 'Solicitud cancelada — el plan de la empresa no se tocó porque ya había cambiado después con otra aprobación.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cancelar la solicitud');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminShell
      title="Solicitudes de pago"
      subtitle="Revisa los comprobantes de pago manual que suben tus clientes desde Mi Plan"
      actions={<button className="button primary" onClick={() => void openNew()}><Plus size={16} />Nuevo pago</button>}
    >
      {error && <div className="error-box">{error}</div>}
      {successMsg && <div className="success-box">{successMsg}</div>}

      <div className="chat-quick-filters" style={{ marginBottom: 16 }}>
        {(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', ''] as const).map((status) => (
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
                <td>{request.whatsappPhone || '—'}</td>
                <td>{new Date(request.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                <td><span className={`status-pill ${statusPillClass[request.status]}`}><span className="status-dot" /> {statusLabels[request.status]}</span></td>
                <td>
                  <div className="row-actions">
                    {request.proofUrl && <a className="button small" href={adminPaymentRequestProofUrl(request.id)} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Ver comprobante</a>}
                    {!request.proofUrl && <span className="row-sub" style={{ marginTop: 0 }}>Registrado desde el panel</span>}
                    {request.status === 'PENDING' && (
                      <>
                        <button className="button small primary" disabled={busyId === request.id} onClick={() => void approve(request)}><Check size={13} /> Aprobar</button>
                        <button className="button small danger" disabled={busyId === request.id} onClick={() => { setRejectId(request.id); setRejectNote(''); }}><X size={13} /> Rechazar</button>
                      </>
                    )}
                    {request.status === 'APPROVED' && (
                      <button className="button small danger" disabled={busyId === request.id} onClick={() => { setCancelId(request.id); setCancelNote(''); }}><X size={13} /> Cancelar</button>
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

      {cancelId && (
        <div className="modal-backdrop" onClick={() => setCancelId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Cancelar pago aprobado</h2><p>Si nadie volvió a cambiar el plan de esta empresa desde entonces, se revierte al que tenía antes de aprobar este pago. Si ya cambió por otra aprobación posterior, solo se marca como cancelada.</p></div>
            <div className="modal-body">
              <div className="field"><label>Motivo (opcional)</label><textarea rows={3} value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} placeholder="Pago revertido / comprobante inválido" /></div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setCancelId(null)}>Volver</button>
              <button className="button danger" disabled={busyId === cancelId} onClick={() => void cancel()}>{busyId === cancelId ? 'Cancelando...' : 'Cancelar pago'}</button>
            </div>
          </div>
        </div>
      )}

      {newModal && (
        <div className="modal-backdrop" onClick={() => setNewModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Nuevo pago</h2><p>Registra un pago coordinado fuera de la app (transferencia, efectivo, etc). &quot;Completado&quot; activa el plan de inmediato.</p></div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field company-picker">
                  <label>Empresa</label>
                  <input
                    value={companySearch}
                    onChange={(e) => { setCompanySearch(e.target.value); setNewForm({ ...newForm, companyId: '' }); setCompanyPickerOpen(true); }}
                    onFocus={(e) => { e.target.select(); setCompanyPickerOpen(true); }}
                    onBlur={() => setTimeout(() => setCompanyPickerOpen(false), 120)}
                    placeholder="Busca por empresa, propietario o correo..."
                    autoComplete="off"
                  />
                  {companyPickerOpen && (
                    <div className="company-picker-panel">
                      {filteredCompanies.length ? filteredCompanies.map((company) => {
                        const owner = company.users[0];
                        return (
                          <button
                            type="button"
                            key={company.id}
                            className={`company-picker-option ${newForm.companyId === company.id ? 'active' : ''}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectCompany(company)}
                          >
                            <strong>{company.name}</strong>
                            {owner && <span>{owner.name} · {owner.email}</span>}
                          </button>
                        );
                      }) : <div className="company-picker-empty">Sin resultados para &quot;{companySearch}&quot;</div>}
                    </div>
                  )}
                </div>
                <div className="field">
                  <label>Plan</label>
                  <select value={newForm.planId} onChange={(e) => setNewForm({ ...newForm, planId: e.target.value })}>
                    <option value="">Selecciona un plan</option>
                    {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {formatPrice(plan)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Precio</label>
                  <input value={selectedPlan ? formatPrice(selectedPlan) : ''} disabled placeholder="Elige un plan" />
                </div>
                <div className="field">
                  <label>Forma de pago (opcional)</label>
                  <select value={newForm.paymentMethodId} onChange={(e) => setNewForm({ ...newForm, paymentMethodId: e.target.value })}>
                    <option value="">Sin especificar</option>
                    {paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Estado</label>
                  <select value={newForm.status} onChange={(e) => setNewForm({ ...newForm, status: e.target.value as 'PENDING' | 'APPROVED' })}>
                    <option value="APPROVED">Completado — activa el plan ya</option>
                    <option value="PENDING">Pendiente — revisar después</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setNewModal(false)}>Cancelar</button>
              <button className="button primary" disabled={saving || !newForm.companyId || !newForm.planId} onClick={() => void createPaymentRequest()}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
