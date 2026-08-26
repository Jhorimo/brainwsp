'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BrandIcon } from './brand-mark';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, Check, ChevronDown, CreditCard, KeyRound, Lightbulb, LogOut, Menu, ShieldCheck } from 'lucide-react';
import { apiFetch, clearAuthSession, getStoredUser, getToken, updateStoredUser } from '@/lib/api';

const navigation = [
  { href: '/admin/clients', label: 'Usuarios', icon: Building2 },
  { href: '/admin/plans', label: 'Planes', icon: CreditCard },
  { href: '/admin/licenses', label: 'Licencias', icon: KeyRound },
  { href: '/admin/suggestions', label: 'Sugerencias', icon: Lightbulb },
  { href: '/admin/security', label: 'Seguridad', icon: ShieldCheck },
];

// Separate from <Protected> (used by the tenant panel) because this checks the role,
// not just "is there a token" — a regular OWNER/AGENT must never land on /admin/*.
function ProtectedAdmin({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    try {
      const user = getStoredUser<{ role?: string }>();
      if (user.role !== 'SUPERADMIN') { router.replace('/dashboard'); return; }
    } catch { router.replace('/login'); return; }
    setReady(true);
  }, [router]);

  if (!ready) return <div className="center-screen"><div className="spinner" /></div>;
  return children;
}

export function AdminShell({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [name, setName] = useState('Super Admin');
  const [email, setEmail] = useState('');
  const [profileModal, setProfileModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  // Mismo patrón que AppShell (el panel de cada empresa): abajo de 640px la barra lateral
  // pasa a ser un cajón oculto en vez de una barra de íconos — este botón controla ambos
  // casos, cada uno relevante solo en su propio breakpoint.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    try {
      const user = getStoredUser<{ name?: string; email?: string }>();
      setName(String(user.name || 'Super Admin'));
      setEmail(String(user.email || ''));
    } catch {}
    setCollapsed(localStorage.getItem('brainwsp_admin_sidebar_collapsed') === '1');
  }, []);

  const openProfile = () => {
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordError('');
    setPasswordSuccess(false);
    setNameDraft(name);
    setNameError('');
    setNameSaved(false);
    setProfileModal(true);
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === name) return;
    setNameSaving(true);
    setNameError('');
    setNameSaved(false);
    try {
      const updated = await apiFetch<{ name: string }>('/auth/me', { method: 'PATCH', body: JSON.stringify({ name: trimmed }) });
      updateStoredUser({ name: updated.name });
      setName(updated.name);
      setNameSaved(true);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'No se pudo actualizar el nombre');
    } finally {
      setNameSaving(false);
    }
  };

  const changePassword = async () => {
    setPasswordError('');
    setPasswordSuccess(false);
    if (passwordForm.newPassword.length < 10) { setPasswordError('La nueva contraseña debe tener al menos 10 caracteres'); return; }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { setPasswordError('Las contraseñas no coinciden'); return; }
    setPasswordSaving(true);
    try {
      await apiFetch('/auth/password', { method: 'PATCH', body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }) });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordSuccess(true);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña');
    } finally {
      setPasswordSaving(false);
    }
  };

  useEffect(() => { setMobileNavOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileNavOpen]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem('brainwsp_admin_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
    setMobileNavOpen((current) => !current);
  };

  const logout = () => {
    clearAuthSession();
    router.replace('/login');
  };

  return (
    <ProtectedAdmin>
      <div className={`app-frame ${collapsed ? 'collapsed' : ''} ${mobileNavOpen ? 'mobile-nav-open' : ''}`}>
        <div className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} />
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark"><BrandIcon /></div>
            <div>
              <strong>Brain Tech</strong>
              <span>Panel de plataforma</span>
            </div>
          </div>

          <nav className="nav-list">
            <div className="nav-caption">ADMINISTRADOR</div>
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link className={`nav-item ${active ? 'active' : ''}`} href={item.href} key={item.href}>
                  <Icon size={19} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            <button className="account-button" type="button" onClick={openProfile}>
              <div className="avatar">{name.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()}</div>
              <div className="account-copy"><strong>{name}</strong><span>Super Admin</span></div>
              <ChevronDown size={16} />
            </button>
            <button className="logout-button" onClick={logout} type="button"><LogOut size={17} /><span>Cerrar sesión</span></button>
          </div>
        </aside>

        <main className="main-area">
          <header className="topbar">
            <div className="topbar-left">
              <button className="sidebar-toggle" type="button" onClick={toggleCollapsed} title={collapsed ? 'Expandir menú' : 'Reducir menú'} aria-label={collapsed ? 'Expandir menú' : 'Reducir menú'}>
                <Menu size={18} />
              </button>
              <div>
                <h1>{title}</h1>
                {subtitle && <p>{subtitle}</p>}
              </div>
            </div>
            <div className="topbar-actions">{actions}</div>
          </header>
          <div className="page-content">{children}</div>
        </main>
      </div>

      {profileModal && (
        <div className="modal-backdrop" onClick={() => setProfileModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Mi perfil</h2><p>Tus datos de acceso al panel de plataforma.</p></div>
            <div className="modal-body">
              {nameError && <div className="error-box">{nameError}</div>}
              <div className="form-grid">
                <div className="field">
                  <label>Nombre</label>
                  <div className="field-with-action">
                    <input value={nameDraft} onChange={(e) => { setNameDraft(e.target.value); setNameSaved(false); }} onKeyDown={(e) => { if (e.key === 'Enter') void saveName(); }} />
                    {nameDraft.trim() && nameDraft.trim() !== name && (
                      <button className={`button small notes-save-button ${nameSaved ? 'saved' : ''}`} disabled={nameSaving} onMouseDown={(e) => e.preventDefault()} onClick={() => void saveName()} title="Guardar nombre">
                        {nameSaving ? '...' : <Check size={13} />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="field"><label>Correo</label><input value={email} disabled /></div>
                <div className="field"><label>Rol</label><input value="Super administrador" disabled /></div>
              </div>

              <div className="field" style={{ marginTop: '1.25rem' }}>
                <label>Cambiar contraseña</label>
              </div>
              {passwordError && <div className="error-box">{passwordError}</div>}
              {passwordSuccess && <div className="success-box">Contraseña actualizada correctamente.</div>}
              <div className="form-grid">
                <div className="field"><label>Contraseña actual</label><input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} /></div>
                <div className="field"><label>Nueva contraseña</label><input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} placeholder="Mínimo 10 caracteres" /></div>
                <div className="field"><label>Confirmar nueva contraseña</label><input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} /></div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setProfileModal(false)}>Cerrar</button>
              <button className="button primary" disabled={passwordSaving || !passwordForm.currentPassword || !passwordForm.newPassword} onClick={() => void changePassword()}>{passwordSaving ? 'Guardando...' : 'Cambiar contraseña'}</button>
            </div>
          </div>
        </div>
      )}
    </ProtectedAdmin>
  );
}
