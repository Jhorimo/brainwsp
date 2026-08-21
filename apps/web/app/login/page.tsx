'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LockKeyhole, MessageSquareText, Radio, Sparkles } from 'lucide-react';
import { API_URL } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@braintech.com.pe');
  const [password, setPassword] = useState('ChangeMe-123456!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudo iniciar sesión');
      localStorage.setItem('brainwsp_token', data.accessToken);
      localStorage.setItem('brainwsp_user', JSON.stringify(data.user));
      localStorage.setItem('brainwsp_company', JSON.stringify(data.company));
      router.replace(data.user.role === 'SUPERADMIN' ? '/admin/clients' : '/dashboard');
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
        <form className="login-card" onSubmit={submit}>
          <div className="stat-icon" style={{marginBottom:18}}><LockKeyhole size={19} /></div>
          <h2>Bienvenido</h2>
          <p>Ingresa al panel de administración de BrainWSP.</p>
          {error && <div className="error-box">{error}</div>}
          <div className="form-grid">
            <div className="field"><label>Correo electrónico</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></div>
            <div className="field"><label>Contraseña</label><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required /></div>
            <button className="button primary" disabled={loading}>{loading ? 'Ingresando...' : 'Ingresar al panel'}</button>
          </div>
          <div className="login-hint">Las credenciales mostradas son las del entorno de desarrollo. Cámbialas antes de publicar el sistema.</div>
          <div style={{marginTop:14, textAlign:'center', fontSize:11, color:'#6b7690'}}>
            ¿No tienes cuenta? <Link href="/register" style={{color:'#1258d6', fontWeight:700}}>Regístrate</Link>
          </div>
        </form>
      </section>
    </div>
  );
}
