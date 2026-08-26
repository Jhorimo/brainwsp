'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, MessageSquareText, Radio, Sparkles } from 'lucide-react';
import { API_URL, setAuthSession } from '@/lib/api';
import { GoogleIcon } from '@/components/google-icon';

export default function RegisterPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        body: JSON.stringify({ companyName, name, email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudo crear la cuenta');
      setAuthSession(data, true);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <section className="login-visual">
        <div className="login-brand"><div className="brand-mark">B</div><div><strong>BrainWSP</strong><div style={{color:'#a9c0e3',fontSize:11}}>by Brain Tech Perú</div></div></div>
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

          <a className="button google-button" href={`${API_URL}/auth/google`}><GoogleIcon /> Registrarme con Google</a>
          <div className="login-divider"><span>o con tu correo</span></div>

          <div className="form-grid">
            <div className="field"><label>Nombre de la empresa</label><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} type="text" /></div>
            <div className="field"><label>Tu nombre</label><input value={name} onChange={(e) => setName(e.target.value)} type="text" /></div>
            <div className="field"><label>Correo electrónico</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></div>
            <div className="field"><label>Contraseña</label><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" /></div>
            <div className="field"><label>Confirmar contraseña</label><input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" /></div>
            <button className="button primary" disabled={loading}>{loading ? 'Creando cuenta...' : 'Crear cuenta'}</button>
          </div>
          <div style={{marginTop:16, textAlign:'center', fontSize:11, color:'#6b7690'}}>
            ¿Ya tienes cuenta? <Link href="/login" style={{color:'#213786', fontWeight:700}}>Inicia sesión</Link>
          </div>
        </form>
      </section>
    </div>
  );
}
