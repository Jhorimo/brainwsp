'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Ban, Calendar, Check, CreditCard, Lock, MessageSquare, Phone, Settings, Smartphone, Wifi } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { MODULE_OPTIONS } from '@/lib/modules';
import { PaymentModal } from './payment-modal';

type PlanUsage = {
  planName: string | null; mode: 'QR' | 'API'; licenseRenewsAt: string | null; daysUntilRenewal: number | null;
  maxMessages: number | null; messagesThisMonth: number; dailyBudget: number | null; messagesToday: number;
  activeInstances: number; maxInstances: number | null;
};

type Plan = {
  id: string; name: string; billingCycle: string; price: number; priceUsd: number;
  maxAgents: number | null; maxInstances: number | null; maxMessages: number | null; features: string[];
  moduleKeys: string[];
};

type PaymentMethod = { id: string; label: string; accountNumber: string; accountHolder: string; instructions?: string | null; qrImageUrl?: string | null };

type PaymentRequest = { id: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string; plan: { id: string; name: string } };

function formatPrice(plan: Plan) {
  if (plan.priceUsd) return { amount: `$${(plan.priceUsd / 100).toFixed(2)}`, suffix: '/mes' };
  if (plan.price) return { amount: `S/ ${(plan.price / 100).toFixed(2)}`, suffix: '/mes' };
  return { amount: 'Gratis', suffix: '' };
}

// Si el admin cargó beneficios en texto libre (ver /admin/plans), esos son la lista — así el
// texto que se muestra puede decir "Generador de flujo" o "Asistente de IA" en vez de limitarse
// a lo que el modelo Plan sabe medir. Sin beneficios cargados, se arma sola con los límites.
function planFeatures(plan: Plan) {
  if (plan.features?.length) return plan.features;
  return [
    plan.maxInstances ? `${plan.maxInstances} WhatsApp` : 'WhatsApp ilimitados',
    plan.maxAgents ? `${plan.maxAgents} agentes` : 'Agentes ilimitados',
    plan.maxMessages ? `${plan.maxMessages.toLocaleString('es-PE')} mensajes/mes` : 'Mensajes ilimitados',
  ];
}

export default function MyPlanPage() {
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [lockedModule, setLockedModule] = useState<string | null>(null);

  // Llega desde el menú lateral (app-shell.tsx) cuando el usuario hace clic en un módulo que
  // su plan actual no incluye — le explicamos por qué está aquí en vez de en esa página.
  useEffect(() => {
    setLockedModule(new URLSearchParams(window.location.search).get('locked'));
  }, []);

  const load = useCallback(() => {
    apiFetch<PlanUsage>('/dashboard/plan-usage').then(setPlanUsage).catch(() => undefined);
    apiFetch<Plan[]>('/billing/plans').then(setPlans).catch(() => undefined);
    apiFetch<PaymentMethod[]>('/billing/payment-methods').then(setPaymentMethods).catch(() => undefined);
    apiFetch<PaymentRequest[]>('/billing/payment-requests').then(setRequests).catch(() => undefined);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingRequest = requests.find((r) => r.status === 'PENDING');
  const planUrgent = planUsage?.daysUntilRenewal !== null && planUsage?.daysUntilRenewal !== undefined && planUsage.daysUntilRenewal <= 7;

  const lockedLabel = lockedModule ? (MODULE_OPTIONS.find((m) => m.key === lockedModule)?.label || lockedModule) : null;

  return (
    <AppShell title="Mi Plan" subtitle="Gestiona tu suscripción y actualiza tu plan">
      {lockedLabel && (
        <div className="plan-alert-banner info">
          <div className="plan-alert-icon"><Lock size={18} /></div>
          <div className="plan-alert-copy">
            <strong>&quot;{lockedLabel}&quot; no está incluido en tu plan actual</strong>
            <span>Elige abajo un plan que lo incluya para desbloquearlo.</span>
          </div>
        </div>
      )}

      {planUsage && (
        <section className="card plan-usage-card">
          <div className="plan-usage-head">
            <div className="plan-usage-head-title">
              <span className="plan-usage-icon"><CreditCard size={20} /></span>
              <div>
                <span className="plan-usage-eyebrow">Plan activo</span>
                <strong className="plan-usage-name">{planUsage.planName || 'Sin asignar'}</strong>
              </div>
            </div>
            <span className={`plan-mode-pill ${planUsage.mode === 'API' ? 'api' : 'qr'}`}>
              {planUsage.mode === 'API' ? <Wifi size={13} /> : <Smartphone size={13} />}
              {planUsage.mode === 'API' ? 'API Oficial' : 'WhatsApp QR'}
            </span>
          </div>

          <div className="plan-tiles">
            <div className="plan-tile" style={{ borderLeftColor: '#3ec6d6' }}>
              <div className="plan-tile-icon"><Calendar size={15} /></div>
              <div className="plan-tile-label">Vencimiento</div>
              <div className={`plan-tile-value ${planUrgent ? 'danger' : ''}`}>
                {planUsage.licenseRenewsAt ? new Date(planUsage.licenseRenewsAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin fecha'}
              </div>
            </div>
            <div className="plan-tile" style={{ borderLeftColor: 'var(--success)' }}>
              <div className="plan-tile-icon"><MessageSquare size={15} /></div>
              <div className="plan-tile-label">Mensajes este mes</div>
              <div className="plan-tile-value">{planUsage.messagesThisMonth.toLocaleString('es-PE')} / {planUsage.maxMessages ? planUsage.maxMessages.toLocaleString('es-PE') : '∞'}</div>
            </div>
            <div className="plan-tile" style={{ borderLeftColor: 'var(--brand-light)' }}>
              <div className="plan-tile-icon"><Phone size={15} /></div>
              <div className="plan-tile-label">Números por canal</div>
              <div className="plan-tile-value">{planUsage.activeInstances} / {planUsage.maxInstances ?? '∞'}</div>
            </div>
            <div className="plan-tile" style={{ borderLeftColor: 'var(--brand)' }}>
              <div className="plan-tile-icon"><Settings size={15} /></div>
              <div className="plan-tile-label">Tipo de activación</div>
              <div className="plan-tile-value">{planUsage.mode === 'API' ? 'Automática' : 'Manual'}</div>
            </div>
          </div>
        </section>
      )}

      {planUsage && planUrgent && (
        <div className="plan-alert-banner">
          <div className="plan-alert-icon">{(planUsage.daysUntilRenewal ?? 0) < 0 ? <Ban size={18} /> : <AlertTriangle size={18} />}</div>
          <div className="plan-alert-copy">
            <strong>{(planUsage.daysUntilRenewal ?? 0) < 0 ? 'Tu plan ha vencido' : 'Tu plan vence pronto'}</strong>
            <span>
              {(planUsage.daysUntilRenewal ?? 0) < 0
                ? 'Selecciona un plan abajo para reactivar tu cuenta.'
                : planUsage.daysUntilRenewal === 0 ? 'Tu plan vence hoy' : planUsage.daysUntilRenewal === 1 ? 'Tu plan vence mañana' : `Tu plan vence en ${planUsage.daysUntilRenewal} días`}
            </span>
          </div>
          <a className="button danger small" href="#planes-disponibles">Renovar</a>
        </div>
      )}

      {pendingRequest && (
        <div className="plan-alert-banner info">
          <div className="plan-alert-icon"><Check size={18} /></div>
          <div className="plan-alert-copy">
            <strong>Solicitud en revisión</strong>
            <span>Tu solicitud para el plan &quot;{pendingRequest.plan.name}&quot; está siendo revisada por nuestro equipo. Te avisaremos cuando se active.</span>
          </div>
        </div>
      )}

      <section className="card" id="planes-disponibles" style={{ marginTop: 20, padding: 20 }}>
        <div className="card-header" style={{ padding: 0, border: 0, marginBottom: 16 }}>
          <div>
            <strong style={{ fontSize: 14 }}>Planes disponibles</strong>
            <p>Elige el plan que mejor se adapte a tu negocio. El pago manual lo confirma nuestro equipo apenas subas tu comprobante.</p>
          </div>
        </div>

        <div className="plan-pick-grid">
          {plans.map((plan) => {
            const price = formatPrice(plan);
            const isCurrent = plan.name === planUsage?.planName;
            const includesLocked = lockedModule ? (plan.moduleKeys.length === 0 || plan.moduleKeys.includes(lockedModule)) : null;
            return (
              <div className={`plan-pick-card ${isCurrent ? 'current' : ''}`} key={plan.id}>
                {isCurrent && <span className="plan-pick-current-badge">Tu plan actual</span>}
                <strong>{plan.name}</strong>
                <div className="plan-pick-price"><span className="amount">{price.amount}</span><span className="suffix">{price.suffix}</span></div>
                {includesLocked !== null && (
                  <div className={`plan-pick-locked-hint ${includesLocked ? 'yes' : 'no'}`}>
                    {includesLocked ? <Check size={12} /> : <Lock size={12} />}
                    {includesLocked ? `Incluye "${lockedLabel}"` : `No incluye "${lockedLabel}"`}
                  </div>
                )}
                <ul className="plan-pick-features">
                  {planFeatures(plan).map((feature) => <li key={feature}><Check size={13} /> {feature}</li>)}
                </ul>
                <button
                  type="button"
                  className="button primary"
                  style={{ width: '100%' }}
                  disabled={isCurrent || !!pendingRequest}
                  onClick={() => setSelectedPlan(plan)}
                >
                  {isCurrent ? 'Plan actual' : 'Mejorar plan'}
                </button>
              </div>
            );
          })}
          {!plans.length && <div className="row-sub">Todavía no hay planes disponibles — contacta a nuestro equipo.</div>}
        </div>
      </section>

      {selectedPlan && (
        <PaymentModal
          plan={selectedPlan}
          paymentMethods={paymentMethods}
          onClose={() => setSelectedPlan(null)}
          onSubmitted={() => { setSelectedPlan(null); setJustSubmitted(true); load(); }}
        />
      )}

      {justSubmitted && (
        <div className="modal-backdrop" onClick={() => setJustSubmitted(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>¡Solicitud enviada!</h2><p>Revisaremos tu comprobante y activaremos tu plan a la brevedad. Te contactaremos por el WhatsApp que dejaste.</p></div>
            <div className="modal-actions">
              <button className="button primary" type="button" onClick={() => setJustSubmitted(false)}>Entendido</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
