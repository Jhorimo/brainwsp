'use client';

import { useState } from 'react';
import { ArrowLeft, CreditCard, FileText, Upload, X } from 'lucide-react';
import { apiFetch, paymentMethodQrUrl } from '@/lib/api';

type Plan = { id: string; name: string; price: number; priceUsd: number };
type PaymentMethod = { id: string; label: string; accountNumber: string; accountHolder: string; instructions?: string | null; qrImageUrl?: string | null };

function formatPrice(plan: Plan) {
  if (plan.priceUsd) return `US$ ${(plan.priceUsd / 100).toFixed(2)}/mes`;
  if (plan.price) return `S/ ${(plan.price / 100).toFixed(2)}/mes`;
  return 'Gratis';
}

// Dos pasos en un solo modal: elegir cómo pagar (Tarjeta — deshabilitado por ahora — o
// manual), y si eligen manual, el formulario para subir el comprobante. Se queda todo acá
// porque comparten el plan elegido y el mismo botón "← Volver".
export function PaymentModal({ plan, paymentMethods, onClose, onSubmitted }: { plan: Plan; paymentMethods: PaymentMethod[]; onClose: () => void; onSubmitted: () => void }) {
  const [step, setStep] = useState<'choose' | 'manual'>('choose');
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id || '');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedMethod = paymentMethods.find((m) => m.id === methodId);

  const submit = async () => {
    setError('');
    if (!methodId) return setError('Elige un método de pago');
    if (!whatsappPhone.trim()) return setError('Ingresa tu número de WhatsApp');
    if (!file) return setError('Sube tu comprobante de pago');

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('planId', plan.id);
      formData.append('paymentMethodId', methodId);
      formData.append('whatsappPhone', whatsappPhone.trim());
      formData.append('file', file);
      await apiFetch('/billing/payment-requests', { method: 'POST', body: formData });
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar tu solicitud de pago');
    } finally {
      setSaving(false);
    }
  };

  if (step === 'choose') {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" type="button" onClick={onClose}><X size={15} /></button>
          <div className="modal-header"><h2>Elige tu forma de pago</h2></div>
          <div className="modal-body">
            <div className="plan-summary-row">
              <CreditCard size={18} />
              <div><strong>{plan.name}</strong><span>{formatPrice(plan)}</span></div>
            </div>
            <div className="payment-choice-list">
              <div className="payment-choice-option disabled">
                <div><strong>Tarjeta (Stripe)</strong><span>Próximamente — pago automático con tarjeta</span></div>
              </div>
              <button type="button" className="payment-choice-option" onClick={() => setStep('manual')}>
                <div><strong>Pago manual</strong><span>Yape, Plin, Binance, transferencia... Nuestro equipo confirma tu pago manualmente.</span></div>
              </button>
            </div>
          </div>
          <div className="modal-actions">
            <button className="button" type="button" onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose}><X size={15} /></button>
        <div className="modal-header"><h2>Pago manual</h2></div>
        <div className="modal-body">
          <div className="plan-summary-row">
            <CreditCard size={18} />
            <div><strong>{plan.name}</strong><span>{formatPrice(plan)}</span></div>
          </div>
          {error && <div className="error-box">{error}</div>}
          <p className="row-sub" style={{ marginBottom: 10 }}>Al confirmar, enviaremos tu solicitud a nuestro equipo. Déjanos tu WhatsApp para coordinar el pago y activar tu plan contigo.</p>

          <div className="field">
            <label>Número de WhatsApp</label>
            <input value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} placeholder="Incluye código de país. Ej.: +51 999 999 999" />
          </div>

          {paymentMethods.length ? (
            <>
              <div className="field" style={{ marginTop: 12 }}>
                <label>¿Cómo prefieres pagar?</label>
                <div className="payment-method-tabs">
                  {paymentMethods.map((method) => (
                    <button key={method.id} type="button" className={`payment-method-tab ${methodId === method.id ? 'active' : ''}`} onClick={() => setMethodId(method.id)}>{method.label}</button>
                  ))}
                </div>
              </div>
              {selectedMethod && (
                <div className="payment-method-details">
                  {selectedMethod.qrImageUrl && <img src={paymentMethodQrUrl(selectedMethod.id)} alt={`QR ${selectedMethod.label}`} />}
                  <div className="payment-method-account">
                    <span className="row-sub" style={{ marginTop: 0 }}>CUENTA / NÚMERO</span>
                    <strong>{selectedMethod.accountNumber} - {selectedMethod.accountHolder}</strong>
                    {selectedMethod.instructions && <span className="row-sub">{selectedMethod.instructions}</span>}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="error-box" style={{ marginTop: 12 }}>Todavía no hay métodos de pago configurados — contacta directamente a nuestro equipo para activar tu plan.</div>
          )}

          <div className="field" style={{ marginTop: 12 }}>
            <label>Comprobante de pago (obligatorio)</label>
            <span className="row-sub" style={{ marginBottom: 6, display: 'block' }}>Foto o PDF. Sin el comprobante no podemos activar tu cuenta.</span>
            <label className="upload-dropzone">
              {file ? <><FileText size={16} /> {file.name}</> : <><Upload size={16} /> Elegir archivo</>}
              <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
        </div>
        <div className="modal-actions">
          <button className="button" type="button" onClick={() => setStep('choose')}><ArrowLeft size={13} /> Volver</button>
          <button className="button" type="button" onClick={onClose}>Cancelar</button>
          <button className="button primary" type="button" disabled={saving || !paymentMethods.length} onClick={() => void submit()}>{saving ? 'Enviando...' : 'Confirmar solicitud'}</button>
        </div>
      </div>
    </div>
  );
}
