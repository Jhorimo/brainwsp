'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { PaymentModal } from './payment-modal';

type PlanUsage = {
  planName: string | null; mode: 'QR' | 'API'; licenseRenewsAt: string | null; daysUntilRenewal: number | null;
  maxMessages: number | null; messagesThisMonth: number; dailyBudget: number | null; messagesToday: number;
};

type Plan = {
  id: string; name: string; billingCycle: string; price: number; priceUsd: number;
  maxAgents: number | null; maxInstances: number | null; maxMessages: number | null; features: string[];
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

  const load = useCallback(() => {
    apiFetch<PlanUsage>('/dashboard/plan-usage').then(setPlanUsage).catch(() => undefined);
    apiFetch<Plan[]>('/billing/plans').then(setPlans).catch(() => undefined);
    apiFetch<PaymentMethod[]>('/billing/payment-methods').then(setPaymentMethods).catch(() => undefined);
    apiFetch<PaymentRequest[]>('/billing/payment-requests').then(setRequests).catch(() => undefined);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingRequest = requests.find((r) => r.status === 'PENDING');
  const planUrgent = planUsage?.daysUntilRenewal !== null && planUsage?.daysUntilRenewal !== undefined && planUsage.daysUntilRenewal <= 7;

  return (
    <AppShell title="Mi Plan" subtitle="Gestiona tu suscripción y actualiza tu plan">
      {planUsage && planUrgent && (
        <div className="plan-alert-banner">
          <div className="plan-alert-icon"><AlertTriangle size={18} /></div>
          <div className="plan-alert-copy">
            <strong>{(planUsage.daysUntilRenewal ?? 0) < 0 ? 'Tu plan venció' : 'Tu plan vence pronto'}</strong>
            <span>
              {(planUsage.daysUntilRenewal ?? 0) < 0
                ? `Venció hace ${Math.abs(planUsage.daysUntilRenewal ?? 0)} día(s) — no podrás conectar un WhatsApp nuevo hasta renovar.`
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

      {planUsage && (
        <section className="card plan-usage-card">
          <div className="card-header">
            <div>
              <span className="plan-usage-badge">Plan activo: {planUsage.planName || 'sin asignar'}</span>
              <p>Modo {planUsage.mode === 'QR' ? '📱 WhatsApp QR' : '🔌 API Oficial'} {planUsage.licenseRenewsAt && <> · Vence {new Date(planUsage.licenseRenewsAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</>}</p>
            </div>
          </div>
          <div className="plan-usage-bars">
            <div className="plan-usage-bar-block">
              <div className="plan-usage-bar-head"><span>Mensajes este mes</span><span>{planUsage.maxMessages ? Math.min(100, Math.round((planUsage.messagesThisMonth / planUsage.maxMessages) * 100)) : 0}%</span></div>
              <div className="plan-usage-bar-track"><div className="plan-usage-bar-fill" style={{ width: `${planUsage.maxMessages ? Math.min(100, (planUsage.messagesThisMonth / planUsage.maxMessages) * 100) : 0}%` }} /></div>
              <div className="plan-usage-bar-foot"><strong>{planUsage.messagesThisMonth.toLocaleString('es-PE')}</strong> / {planUsage.maxMessages ? planUsage.maxMessages.toLocaleString('es-PE') : '∞'}<span>{planUsage.maxMessages ? `${Math.max(0, planUsage.maxMessages - planUsage.messagesThisMonth).toLocaleString('es-PE')} rest.` : 'sin límite'}</span></div>
            </div>
            <div className="plan-usage-bar-block">
              <div className="plan-usage-bar-head"><span>Actividad de hoy</span><span>{planUsage.dailyBudget ? Math.min(100, Math.round((planUsage.messagesToday / planUsage.dailyBudget) * 100)) : 0}%</span></div>
              <div className="plan-usage-bar-track"><div className="plan-usage-bar-fill accent" style={{ width: `${planUsage.dailyBudget ? Math.min(100, (planUsage.messagesToday / planUsage.dailyBudget) * 100) : 0}%` }} /></div>
              <div className="plan-usage-bar-foot"><strong>{planUsage.messagesToday.toLocaleString('es-PE')}</strong> / {planUsage.dailyBudget ? planUsage.dailyBudget.toLocaleString('es-PE') : '∞'}<span>{planUsage.dailyBudget ? `${Math.max(0, planUsage.dailyBudget - planUsage.messagesToday).toLocaleString('es-PE')} rest.` : 'sin límite'}</span></div>
            </div>
          </div>
        </section>
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
            return (
              <div className={`plan-pick-card ${isCurrent ? 'current' : ''}`} key={plan.id}>
                {isCurrent && <span className="plan-pick-current-badge">Tu plan actual</span>}
                <strong>{plan.name}</strong>
                <div className="plan-pick-price"><span className="amount">{price.amount}</span><span className="suffix">{price.suffix}</span></div>
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
