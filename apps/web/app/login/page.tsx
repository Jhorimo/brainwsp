'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, LockKeyhole, MessageSquareText, Radio, Sparkles } from 'lucide-react';
import { API_URL, apiFetch, clearAuthSession, getToken, setAuthSession } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
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

  useEffect(() => {
    const token = getToken();
    if (!token) { setCheckingSession(false); return; }
    apiFetch<{ role: string }>('/auth/me')
      .then((me) => router.replace(me.role === 'SUPERADMIN' ? '/admin/clients' : '/dashboard'))
      .catch(() => { clearAuthSession(); setCheckingSession(false); });
  }, [router]);

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
      router.replace(data.user.role === 'SUPERADMIN' ? '/admin/clients' : '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) return <div className="center-screen"><div className="spinner" /></div>;

  return (
    <div className="login-shell">
      <section className="login-visual">
        <div className="login-brand"><div className="brand-mark">B</div><div><strong>BrainWSP</strong><div style={{color:'#a9c0e3',fontSize:11}}>by Brain Tech Perú</div></div></div>
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
        <form className="login-card" onSubmit={submit} noValidate>
          <div className="stat-icon" style={{marginBottom:18}}><LockKeyhole size={19} /></div>
          <h2>Bienvenido</h2>
          <p>Ingresa al panel de administración de BrainWSP.</p>
          {error && <div className="error-box">{error}</div>}
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
      </section>
    </div>
  );
}
