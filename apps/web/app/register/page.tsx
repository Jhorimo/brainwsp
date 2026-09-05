'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, Building2, Check, Copy, Eye, EyeOff, KeyRound, MessageSquareText, Radio, Sparkles } from 'lucide-react';
import { API_URL, setAuthSession } from '@/lib/api';
import { GoogleIcon } from '@/components/google-icon';
import { BrandIcon } from '@/components/brand-mark';

type ApiCredential = { appKey: string; authKey: string };
type Plan = { id: string; name: string; billingCycle: string; price: number; priceUsd: number; isDefault: boolean };

// Países más comunes entre los clientes de BrainWSP — no es una lista exhaustiva de todos los
// prefijos del mundo a propósito, para no convertir un selector simple en un buscador aparte.
const COUNTRIES = [
  { code: 'PE', name: 'Perú', dial: '+51' },
  { code: 'CO', name: 'Colombia', dial: '+57' },
  { code: 'MX', name: 'México', dial: '+52' },
  { code: 'CL', name: 'Chile', dial: '+56' },
  { code: 'AR', name: 'Argentina', dial: '+54' },
  { code: 'EC', name: 'Ecuador', dial: '+593' },
  { code: 'BO', name: 'Bolivia', dial: '+591' },
  { code: 'VE', name: 'Venezuela', dial: '+58' },
  { code: 'PA', name: 'Panamá', dial: '+507' },
  { code: 'ES', name: 'España', dial: '+34' },
  { code: 'US', name: 'Estados Unidos', dial: '+1' },
] as const;

function formatPlanPrice(plan: Plan) {
  if (plan.priceUsd) return `US$ ${(plan.priceUsd / 100).toFixed(2)}/mes`;
  if (plan.price) return `S/ ${(plan.price / 100).toFixed(2)}/mes`;
  return 'Gratis';
}

export default function RegisterPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState<(typeof COUNTRIES)[number]['code']>('PE');
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [credential, setCredential] = useState<ApiCredential | null>(null);
  const [needsPayment, setNeedsPayment] = useState(false);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [planPickerOpen, setPlanPickerOpen] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/auth/plans`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Plan[]) => {
        setPlans(list);
        const defaultPlan = list.find((p) => p.isDefault) || list[0];
        if (defaultPlan) setSelectedPlanId(defaultPlan.id);
      })
      .catch(() => undefined);
  }, []);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const dialCode = COUNTRIES.find((c) => c.code === country)?.dial || '';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!companyName.trim() || !name.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Completa todos los campos para continuar.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          name,
          email,
          password,
          phone: whatsapp.trim() ? `${dialCode} ${whatsapp.trim()}` : undefined,
          requestedPlanId: selectedPlanId || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudo crear la cuenta');
      setAuthSession(data, true);
      setNeedsPayment(!!data.needsPayment);
      // El AUTH KEY "Principal" (creado junto con la empresa, ver AuthService.register)
      // viaja en texto plano en esta respuesta y luego queda cifrado para poder revelarlo
      // bajo demanda. Se muestra aquí para que el OWNER no tenga que entrar a "API e
      // integraciones" a buscarlo; recién al cerrar este aviso se entra al dashboard (o a
      // "Mi Plan" si eligió un plan pago, para que complete el pago manual de una vez).
      if (data.apiCredential?.authKey) setCredential(data.apiCredential);
      else router.replace(data.needsPayment ? '/my-plan' : '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  const copy = (value: string) => navigator.clipboard.writeText(value);

  return (
    <div className="login-shell">
      <section className="login-visual">
        <Link href="/" className="login-brand"><div className="brand-mark"><BrandIcon size={58} /></div><div><strong>BrainWSP</strong><div style={{color:'#a9c0e3'}}>by Brain Tech Perú</div></div></Link>
        <div className="login-copy">
          <h1>Crea tu cuenta y conecta WhatsApp a tu operación.</h1>
          <p>En minutos tendrás tu propio espacio de trabajo: agrega tu número de WhatsApp, invita a tu equipo y automatiza conversaciones.</p>
          <div className="login-features">
            <div className="login-feature"><MessageSquareText size={15} /> Chat en vivo</div>
            <div className="login-feature"><Radio size={15} /> API Gateway</div>
            <div className="login-feature"><Sparkles size={15} /> IA Ready</div>
          </div>
        </div>
        <div style={{position:'relative',zIndex:1,color:'#7797c5',fontSize:10}}>Brain Tech Perú · Plataforma privada de comunicaciones</div>
      </section>

      <section className="login-form-wrap">
        <form className="login-card" onSubmit={submit} noValidate>
          <div className="stat-icon" style={{marginBottom:18}}><Building2 size={19} /></div>
          <h2>Crea tu empresa</h2>
          <p>Registra tu empresa en BrainWSP y empieza a operar en minutos.</p>
          {error && <div className="error-box">{error}</div>}

          {plans.length > 0 && (
            <div className="plan-select" style={{ marginBottom: 16 }}>
              <button type="button" className="plan-select-trigger" onClick={() => setPlanPickerOpen((v) => !v)}>
                <span className="plan-select-dot" />
                <div>
                  <span className="plan-select-label">Plan seleccionado</span>
                  <strong>{selectedPlan?.name || 'Elige un plan'} {selectedPlan && <span className="plan-select-price">— {formatPlanPrice(selectedPlan)}</span>}</strong>
                </div>
                <ChevronDown size={15} style={{ transform: planPickerOpen ? 'rotate(180deg)' : undefined, marginLeft: 'auto' }} />
              </button>
              {planPickerOpen && (
                <div className="plan-select-panel">
                  <span className="row-sub" style={{ display: 'block', marginBottom: 6 }}>Selecciona tu plan</span>
                  {plans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      className={`plan-select-option ${plan.id === selectedPlanId ? 'active' : ''}`}
                      onClick={() => { setSelectedPlanId(plan.id); setPlanPickerOpen(false); }}
                    >
                      <div><strong>{plan.name}</strong><span>{formatPlanPrice(plan)}</span></div>
                      {plan.id === selectedPlanId && <Check size={15} />}
                    </button>
                  ))}
                  <span className="row-sub" style={{ display: 'block', marginTop: 6 }}>Puedes empezar con este plan y cambiarlo luego desde &quot;Mi Plan&quot;.</span>
                </div>
              )}
            </div>
          )}

          <a className="button google-button" href={`${API_URL}/auth/google`}><GoogleIcon /> Registrarme con Google</a>
          <div className="login-divider"><span>o con tu correo</span></div>

          <div className="form-grid">
            <div className="field"><label>Nombre de la empresa</label><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} type="text" /></div>
            <div className="field"><label>Tu nombre</label><input value={name} onChange={(e) => setName(e.target.value)} type="text" /></div>
            <div className="field"><label>Correo electrónico</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></div>
            <div className="form-grid" style={{ gridTemplateColumns: '110px 1fr', gap: 10 }}>
              <div className="field">
                <label>País</label>
                <select value={country} onChange={(e) => setCountry(e.target.value as typeof country)}>
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.code} {c.dial}</option>)}
                </select>
              </div>
              <div className="field"><label>WhatsApp</label><input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.replace(/[^\d\s-]/g, ''))} type="tel" placeholder="999 888 777" /></div>
            </div>
            <span className="row-sub" style={{ marginTop: -8 }}>Así podemos contactarte para coordinar tu plan o soporte.</span>
            <div className="field">
              <label>Contraseña</label>
              <div className="password-input">
                <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            <div className="field">
              <label>Confirmar contraseña</label>
              <div className="password-input">
                <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" />
                <button type="button" className="password-toggle" onClick={() => setShowConfirmPassword((current) => !current)} aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            <button className="button primary" disabled={loading}>{loading ? 'Creando cuenta...' : 'Crear cuenta'}</button>
          </div>
          <div style={{marginTop:16, textAlign:'center', fontSize:11, color:'#6b7690'}}>
            ¿Ya tienes cuenta? <Link href="/login" style={{color:'#213786', fontWeight:700}}>Inicia sesión</Link>
          </div>
        </form>
      </section>

      {credential && (
        <div className="modal-backdrop">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Tu AUTH KEY está listo</h2>
              <p>Úsalo para conectar tus sistemas (por ejemplo BrainPOS Restaurante) al Gateway de BrainWSP. Cópialo ahora — más tarde también podrás verlo desde &quot;API e integraciones&quot;.</p>
            </div>
            <div className="modal-body form-grid">
              <div className="field"><label>APP KEY</label><div className="secret-box">{credential.appKey}</div></div>
              <div className="field"><label>AUTH KEY</label><div className="secret-box">{credential.authKey}</div></div>
              <div className="warning-box"><KeyRound size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Guárdalo en un lugar seguro: con este AUTH KEY se pueden crear y controlar tus instancias de WhatsApp.</div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => void copy(`${credential.appKey}\n${credential.authKey}`)}><Copy size={14} />Copiar</button>
              <button className="button primary" onClick={() => router.replace(needsPayment ? '/my-plan' : '/dashboard')}>Ya lo guardé, continuar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
