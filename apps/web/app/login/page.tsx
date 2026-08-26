'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, LockKeyhole, MessageSquareText, Radio, Sparkles } from 'lucide-react';
import { API_URL, apiFetch, clearAuthSession, getToken, setAuthSession } from '@/lib/api';
import { GoogleIcon } from '@/components/google-icon';
import { BrandIcon } from '@/components/brand-mark';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="center-screen"><div className="spinner" /></div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Antes de mostrar el formulario, si ya hay un token guardado (por "Recuérdame" o
  // porque el de 12h todavía no expiró), se valida contra el backend y se entra directo
  // al panel — sin esto, /login siempre mostraba el formulario aunque la sesión siguiera
  // vigente, que era justamente lo que "Recuérdame" debía evitar.
  const [checkingSession, setCheckingSession] = useState(true);

  // Estado del regreso de Google: `g` es el ticket de un solo uso que emite
  // /auth/google/callback (ver auth.controller.ts) — nunca la sesión real. "needsCompany"
  // es el paso extra solo para un correo de Google sin cuenta BrainWSP todavía.
  const [googleTicket, setGoogleTicket] = useState<string | null>(null);
  const [googleStep, setGoogleStep] = useState<'idle' | 'exchanging' | 'needsCompany'>('idle');
  const [googleName, setGoogleName] = useState('');
  const [companyName, setCompanyName] = useState('');

  const finishSession = (data: { user: { role: string } }) => {
    router.replace(data.user.role === 'SUPERADMIN' ? '/admin/clients' : '/dashboard');
  };

  const exchangeGoogleTicket = async (ticket: string, withCompanyName?: string) => {
    setError('');
    setGoogleStep('exchanging');
    try {
      const response = await fetch(`${API_URL}/auth/google/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, companyName: withCompanyName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudo continuar con Google');
      if (data.needsCompany) {
        setGoogleTicket(ticket);
        setGoogleName(data.name || '');
        setGoogleStep('needsCompany');
        return;
      }
      setAuthSession(data, true);
      setCheckingSession(true);
      finishSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado con Google');
      setGoogleStep('idle');
      router.replace('/login');
    }
  };

  useEffect(() => {
    const ticket = searchParams.get('g');
    if (ticket) {
      setCheckingSession(false);
      void exchangeGoogleTicket(ticket);
      return;
    }
    if (searchParams.get('google_error')) {
      setError('No se pudo completar el ingreso con Google. Inténtalo de nuevo.');
      setCheckingSession(false);
      router.replace('/login');
      return;
    }

    const token = getToken();
    if (!token) { setCheckingSession(false); return; }
    apiFetch<{ role: string }>('/auth/me')
      .then((me) => router.replace(me.role === 'SUPERADMIN' ? '/admin/clients' : '/dashboard'))
      .catch(() => { clearAuthSession(); setCheckingSession(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitCompanyName = (event: React.FormEvent) => {
    event.preventDefault();
    if (!companyName.trim() || !googleTicket) return;
    void exchangeGoogleTicket(googleTicket, companyName.trim());
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Completa tu correo y contraseña para continuar.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudo iniciar sesión');
      setAuthSession(data, remember);
      finishSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession || googleStep === 'exchanging') return <div className="center-screen"><div className="spinner" /></div>;

  return (
    <div className="login-shell">
      <section className="login-visual">
        <div className="login-brand"><div className="brand-mark"><BrandIcon size={58} /></div><div><strong>BrainWSP</strong><div style={{color:'#a9c0e3'}}>by Brain Tech Perú</div></div></div>
        <div className="login-copy">
          <h1>WhatsApp empresarial, integrado a todo tu ecosistema.</h1>
          <p>Centraliza tus sistemas de negocio, agentes humanos, conversaciones y automatizaciones en una sola plataforma preparada para crecer.</p>
          <div className="login-features">
            <div className="login-feature"><MessageSquareText size={15} /> Chat en vivo</div>
            <div className="login-feature"><Radio size={15} /> API Gateway</div>
            <div className="login-feature"><Sparkles size={15} /> IA Ready</div>
          </div>
        </div>
        <div style={{position:'relative',zIndex:1,color:'#7797c5',fontSize:10}}>Brain Tech Perú · Plataforma privada de comunicaciones</div>
      </section>

      <section className="login-form-wrap">
        {googleStep === 'needsCompany' ? (
          <form className="login-card" onSubmit={submitCompanyName} noValidate>
            <div className="stat-icon" style={{marginBottom:18}}><GoogleIcon /></div>
            <h2>Ya casi, {googleName.split(' ')[0] || 'bienvenido'}</h2>
            <p>Es tu primera vez con esta cuenta de Google — ¿cómo se llama tu empresa?</p>
            {error && <div className="error-box">{error}</div>}
            <div className="field"><label>Nombre de la empresa</label><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} autoFocus /></div>
            <button className="button primary" disabled={!companyName.trim()}>Crear mi cuenta</button>
            <div style={{marginTop:14, textAlign:'center', fontSize:11, color:'#6b7690'}}>
              <button type="button" onClick={() => { setGoogleStep('idle'); setGoogleTicket(null); router.replace('/login'); }} style={{color:'#213786', fontWeight:700, background:'none', border:0}}>Cancelar</button>
            </div>
          </form>
        ) : (
          <form className="login-card" onSubmit={submit} noValidate>
            <div className="stat-icon" style={{marginBottom:18}}><LockKeyhole size={19} /></div>
            <h2>Bienvenido</h2>
            <p>Ingresa al panel de administración de BrainWSP.</p>
            {error && <div className="error-box">{error}</div>}

            <a className="button google-button" href={`${API_URL}/auth/google`}><GoogleIcon /> Ingresar con Google</a>
            <div className="login-divider"><span>o con tu correo</span></div>

            <div className="field"><label>Correo electrónico</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete={remember ? 'username' : 'off'} /></div>
            <div className="field">
              <label>Contraseña</label>
              <div className="password-input">
                {/* autoComplete="new-password" es el truco estándar para que el navegador no
                    ofrezca guardar/autocompletar la clave cuando el usuario no marcó "Recuérdame". */}
                <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} autoComplete={remember ? 'current-password' : 'new-password'} />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            <label className="remember-me">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Recuérdame
            </label>
            <button className="button primary" disabled={loading}>{loading ? 'Ingresando...' : 'Ingresar al panel'}</button>
            <div className="login-hint">Las credenciales mostradas son las del entorno de desarrollo. Cámbialas antes de publicar el sistema.</div>
            <div style={{marginTop:14, textAlign:'center', fontSize:11, color:'#6b7690'}}>
              ¿No tienes cuenta? <Link href="/register" style={{color:'#213786', fontWeight:700}}>Regístrate</Link>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
