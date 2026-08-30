'use client';

import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Pencil, Plus } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { useConfirm } from '@/components/confirm-provider';
import { apiFetch } from '@/lib/api';

type Plan = {
  id: string; name: string; billingCycle: string; price: number; priceUsd: number;
  maxAgents?: number | null; maxInstances?: number | null; maxMessages?: number | null; active: boolean;
  isDefault: boolean; trialDays: number; features: string[];
  _count: { companies: number };
};

const cycleLabels: Record<string, string> = { FREE: 'Gratis', MONTHLY: 'Mensual', ANNUAL: 'Anual' };

function parseFeatures(text: string) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

function formatPrices(plan: Pick<Plan, 'price' | 'priceUsd'>) {
  if (!plan.price && !plan.priceUsd) return 'Gratis';
  const parts: string[] = [];
  if (plan.price) parts.push(`S/ ${(plan.price / 100).toFixed(2)}`);
  if (plan.priceUsd) parts.push(`US$ ${(plan.priceUsd / 100).toFixed(2)}`);
  return parts.join(' · ');
}

export default function AdminPlansPage() {
  const confirm = useConfirm();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', billingCycle: 'MONTHLY', price: '', priceUsd: '', maxAgents: '', maxInstances: '', maxMessages: '', isDefault: false, trialDays: '3', featuresText: '' });
  const [editForm, setEditForm] = useState({ name: '', billingCycle: 'MONTHLY', price: '', priceUsd: '', maxAgents: '', maxInstances: '', maxMessages: '', isDefault: false, trialDays: '3', featuresText: '' });

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
          priceUsd: form.priceUsd ? Math.round(Number(form.priceUsd) * 100) : 0,
          maxAgents: form.maxAgents ? Number(form.maxAgents) : undefined,
          maxInstances: form.maxInstances ? Number(form.maxInstances) : undefined,
          maxMessages: form.maxMessages ? Number(form.maxMessages) : undefined,
          isDefault: form.isDefault,
          trialDays: form.trialDays ? Number(form.trialDays) : 0,
          features: parseFeatures(form.featuresText),
        }),
      });
      setModal(false);
      setForm({ name: '', billingCycle: 'MONTHLY', price: '', priceUsd: '', maxAgents: '', maxInstances: '', maxMessages: '', isDefault: false, trialDays: '3', featuresText: '' });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear el plan'); }
    finally { setSaving(false); }
  };

  const openEdit = (plan: Plan) => {
    setEditForm({
      name: plan.name,
      billingCycle: plan.billingCycle,
      price: plan.price ? (plan.price / 100).toFixed(2) : '',
      priceUsd: plan.priceUsd ? (plan.priceUsd / 100).toFixed(2) : '',
      maxAgents: plan.maxAgents ? String(plan.maxAgents) : '',
      maxInstances: plan.maxInstances ? String(plan.maxInstances) : '',
      maxMessages: plan.maxMessages ? String(plan.maxMessages) : '',
      isDefault: plan.isDefault,
      trialDays: String(plan.trialDays ?? 3),
      featuresText: (plan.features || []).join('\n'),
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
          priceUsd: editForm.priceUsd ? Math.round(Number(editForm.priceUsd) * 100) : 0,
          maxAgents: editForm.maxAgents ? Number(editForm.maxAgents) : null,
          maxInstances: editForm.maxInstances ? Number(editForm.maxInstances) : null,
          maxMessages: editForm.maxMessages ? Number(editForm.maxMessages) : null,
          isDefault: editForm.isDefault,
          trialDays: editForm.trialDays ? Number(editForm.trialDays) : 0,
          features: parseFeatures(editForm.featuresText),
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
            <div className="stat-label">
              {plan.name} · {cycleLabels[plan.billingCycle] || plan.billingCycle}
              {plan.isDefault && <span className="default-badge" style={{ marginLeft: 8 }}>Predeterminado</span>}
            </div>
            <div className="stat-value">{formatPrices(plan)}</div>
            <div className="stat-meta">
              {plan._count.companies} cliente(s) · {plan.maxAgents ? `${plan.maxAgents} agentes` : 'agentes ilimitados'} · {plan.maxInstances ? `${plan.maxInstances} WhatsApp` : 'WhatsApp ilimitado'} · {plan.maxMessages ? `${plan.maxMessages.toLocaleString('es-PE')} msj/mes` : 'mensajes ilimitados'}
              {plan.isDefault && <> · {plan.trialDays} día(s) de prueba al registrarse</>}
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
                <div className="field"><label>Precio en soles (S/)</label><input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="99.00" /></div>
                <div className="field"><label>Precio en dólares (US$)</label><input type="number" min="0" step="0.01" value={form.priceUsd} onChange={(e) => setForm({ ...form, priceUsd: e.target.value })} placeholder="27.00" /></div>
                <div className="field"><label>Máximo de agentes (opcional)</label><input type="number" min="1" value={form.maxAgents} onChange={(e) => setForm({ ...form, maxAgents: e.target.value })} placeholder="10" /></div>
                <div className="field"><label>Máximo de líneas WhatsApp (opcional)</label><input type="number" min="1" value={form.maxInstances} onChange={(e) => setForm({ ...form, maxInstances: e.target.value })} placeholder="3" /></div>
                <div className="field"><label>Cuota de mensajes al mes (opcional)</label><input type="number" min="1" value={form.maxMessages} onChange={(e) => setForm({ ...form, maxMessages: e.target.value })} placeholder="75000" /></div>
                <div className="field"><label>Días de prueba gratis</label><input type="number" min="0" value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: e.target.value })} placeholder="3" /></div>
                <div className="field">
                  <label>Beneficios (uno por línea)</label>
                  <textarea rows={5} value={form.featuresText} onChange={(e) => setForm({ ...form, featuresText: e.target.value })} placeholder={'1 WhatsApp (Cód. QR)\nGenerador de flujo\nPalabras clave\nAsistente de IA\nSoporte 24/7'} />
                  <span className="row-sub">Se muestran tal cual en la tarjeta del plan en &quot;Mi Plan&quot;. Vacío = se arma sola a partir de los límites de arriba.</span>
                </div>
                <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} style={{ width: 16, height: 16 }} />
                  <label style={{ margin: 0 }}>Plan por defecto al registrarse (reemplaza al que esté marcado)</label>
                </div>
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
                <div className="field"><label>Precio en soles (S/)</label><input type="number" min="0" step="0.01" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} /></div>
                <div className="field"><label>Precio en dólares (US$)</label><input type="number" min="0" step="0.01" value={editForm.priceUsd} onChange={(e) => setEditForm({ ...editForm, priceUsd: e.target.value })} /></div>
                <div className="field"><label>Máximo de agentes (opcional)</label><input type="number" min="1" value={editForm.maxAgents} onChange={(e) => setEditForm({ ...editForm, maxAgents: e.target.value })} placeholder="Ilimitado" /></div>
                <div className="field"><label>Máximo de líneas WhatsApp (opcional)</label><input type="number" min="1" value={editForm.maxInstances} onChange={(e) => setEditForm({ ...editForm, maxInstances: e.target.value })} placeholder="Ilimitado" /></div>
                <div className="field"><label>Cuota de mensajes al mes (opcional)</label><input type="number" min="1" value={editForm.maxMessages} onChange={(e) => setEditForm({ ...editForm, maxMessages: e.target.value })} placeholder="Ilimitado" /></div>
                <div className="field"><label>Días de prueba gratis</label><input type="number" min="0" value={editForm.trialDays} onChange={(e) => setEditForm({ ...editForm, trialDays: e.target.value })} /></div>
                <div className="field">
                  <label>Beneficios (uno por línea)</label>
                  <textarea rows={5} value={editForm.featuresText} onChange={(e) => setEditForm({ ...editForm, featuresText: e.target.value })} placeholder={'1 WhatsApp (Cód. QR)\nGenerador de flujo\nPalabras clave\nAsistente de IA\nSoporte 24/7'} />
                  <span className="row-sub">Se muestran tal cual en la tarjeta del plan en &quot;Mi Plan&quot;. Vacío = se arma sola a partir de los límites de arriba.</span>
                </div>
                <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={editForm.isDefault} onChange={(e) => setEditForm({ ...editForm, isDefault: e.target.checked })} style={{ width: 16, height: 16 }} />
                  <label style={{ margin: 0 }}>Plan por defecto al registrarse (reemplaza al que esté marcado)</label>
                </div>
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
