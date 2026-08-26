'use client';

import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Pencil, Plus } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { useConfirm } from '@/components/confirm-provider';
import { apiFetch } from '@/lib/api';

type Plan = {
  id: string; name: string; billingCycle: string; price: number;
  maxAgents?: number | null; maxInstances?: number | null; active: boolean;
  _count: { companies: number };
};

const cycleLabels: Record<string, string> = { FREE: 'Gratis', MONTHLY: 'Mensual', ANNUAL: 'Anual' };

function formatPrice(cents: number) {
  if (!cents) return 'Gratis';
  return `S/ ${(cents / 100).toFixed(2)}`;
}

export default function AdminPlansPage() {
  const confirm = useConfirm();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', billingCycle: 'MONTHLY', price: '', maxAgents: '', maxInstances: '' });
  const [editForm, setEditForm] = useState({ name: '', billingCycle: 'MONTHLY', price: '', maxAgents: '', maxInstances: '' });

  const load = useCallback(async () => {
    try { setPlans(await apiFetch<Plan[]>('/admin/plans')); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron cargar los planes'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const createPlan = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/admin/plans', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          billingCycle: form.billingCycle,
          price: form.price ? Math.round(Number(form.price) * 100) : 0,
          maxAgents: form.maxAgents ? Number(form.maxAgents) : undefined,
          maxInstances: form.maxInstances ? Number(form.maxInstances) : undefined,
        }),
      });
      setModal(false);
      setForm({ name: '', billingCycle: 'MONTHLY', price: '', maxAgents: '', maxInstances: '' });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear el plan'); }
    finally { setSaving(false); }
  };

  const openEdit = (plan: Plan) => {
    setEditForm({
      name: plan.name,
      billingCycle: plan.billingCycle,
      price: plan.price ? (plan.price / 100).toFixed(2) : '',
      maxAgents: plan.maxAgents ? String(plan.maxAgents) : '',
      maxInstances: plan.maxInstances ? String(plan.maxInstances) : '',
    });
    setEditPlan(plan);
  };

  const saveEdit = async () => {
    if (!editPlan || !editForm.name.trim()) return;
    setSaving(true);
    try {
      const updated = await apiFetch<Plan>(`/admin/plans/${editPlan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name.trim(),
          billingCycle: editForm.billingCycle,
          price: editForm.price ? Math.round(Number(editForm.price) * 100) : 0,
          maxAgents: editForm.maxAgents ? Number(editForm.maxAgents) : null,
          maxInstances: editForm.maxInstances ? Number(editForm.maxInstances) : null,
        }),
      });
      setPlans((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setEditPlan(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar el plan'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (plan: Plan) => {
    setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, active: !plan.active } : item));
    try { await apiFetch(`/admin/plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ active: !plan.active }) }); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar el plan'); await load(); }
  };

  const removePlan = async (plan: Plan) => {
    if (!(await confirm(`¿Eliminar el plan "${plan.name}"? Los clientes que lo tengan quedarán sin plan.`, { confirmText: 'Eliminar' }))) return;
    setPlans((current) => current.filter((item) => item.id !== plan.id));
    try { await apiFetch(`/admin/plans/${plan.id}`, { method: 'DELETE' }); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo eliminar el plan'); await load(); }
  };

  return (
    <AdminShell title="Planes" subtitle="Catálogo de planes que puedes asignar a cada cliente" actions={<button className="button primary" onClick={() => setModal(true)}><Plus size={16} />Nuevo plan</button>}>
      {error && <div className="error-box">{error}</div>}

      <div className="grid-stats team-stats">
        {plans.map((plan) => (
          <div className="stat-card" key={plan.id}>
            <div className="stat-icon"><CreditCard size={19} /></div>
            <div className="stat-label">{plan.name} · {cycleLabels[plan.billingCycle] || plan.billingCycle}</div>
            <div className="stat-value">{formatPrice(plan.price)}</div>
            <div className="stat-meta">
              {plan._count.companies} cliente(s) · {plan.maxAgents ? `${plan.maxAgents} agentes` : 'agentes ilimitados'} · {plan.maxInstances ? `${plan.maxInstances} WhatsApp` : 'WhatsApp ilimitado'}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <button className="button small" onClick={() => openEdit(plan)}><Pencil size={13} />Editar</button>
              <button className={`button small ${plan.active ? '' : 'primary'}`} onClick={() => void toggleActive(plan)}>{plan.active ? 'Desactivar' : 'Activar'}</button>
              <button className="button small danger" onClick={() => void removePlan(plan)}>Eliminar</button>
            </div>
          </div>
        ))}
        {!plans.length && <div className="empty-state"><div><strong>Aún no hay planes</strong>Crea el primero con "Nuevo plan".</div></div>}
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Nuevo plan</h2><p>Se agrega al catálogo; luego lo asignas a cada cliente desde Usuarios.</p></div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field"><label>Nombre</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Anual" /></div>
                <div className="field"><label>Ciclo de cobro</label>
                  <select value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}>
                    <option value="FREE">Gratis</option>
                    <option value="MONTHLY">Mensual</option>
                    <option value="ANNUAL">Anual</option>
                  </select>
                </div>
                <div className="field"><label>Precio (S/)</label><input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="99.00" /></div>
                <div className="field"><label>Máximo de agentes (opcional)</label><input type="number" min="1" value={form.maxAgents} onChange={(e) => setForm({ ...form, maxAgents: e.target.value })} placeholder="10" /></div>
                <div className="field"><label>Máximo de líneas WhatsApp (opcional)</label><input type="number" min="1" value={form.maxInstances} onChange={(e) => setForm({ ...form, maxInstances: e.target.value })} placeholder="3" /></div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setModal(false)}>Cancelar</button>
              <button className="button primary" disabled={saving || !form.name.trim()} onClick={() => void createPlan()}>{saving ? 'Guardando...' : 'Crear plan'}</button>
            </div>
          </div>
        </div>
      )}

      {editPlan && (
        <div className="modal-backdrop" onClick={() => setEditPlan(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Editar plan</h2><p>Los cambios aplican a los clientes que ya tienen este plan asignado.</p></div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field"><label>Nombre</label><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div>
                <div className="field"><label>Ciclo de cobro</label>
                  <select value={editForm.billingCycle} onChange={(e) => setEditForm({ ...editForm, billingCycle: e.target.value })}>
                    <option value="FREE">Gratis</option>
                    <option value="MONTHLY">Mensual</option>
                    <option value="ANNUAL">Anual</option>
                  </select>
                </div>
                <div className="field"><label>Precio (S/)</label><input type="number" min="0" step="0.01" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} /></div>
                <div className="field"><label>Máximo de agentes (opcional)</label><input type="number" min="1" value={editForm.maxAgents} onChange={(e) => setEditForm({ ...editForm, maxAgents: e.target.value })} placeholder="Ilimitado" /></div>
                <div className="field"><label>Máximo de líneas WhatsApp (opcional)</label><input type="number" min="1" value={editForm.maxInstances} onChange={(e) => setEditForm({ ...editForm, maxInstances: e.target.value })} placeholder="Ilimitado" /></div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setEditPlan(null)}>Cancelar</button>
              <button className="button primary" disabled={saving || !editForm.name.trim()} onClick={() => void saveEdit()}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
