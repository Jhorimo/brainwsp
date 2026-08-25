'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Bot,
  ChevronDown,
  Eye,
  Handshake,
  Kanban,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  MessageSquareText,
  Settings,
  UserPlus,
  Users,
  Wifi,
} from 'lucide-react';
import { Protected } from './protected';
import { FeedbackWidget } from './feedback-widget';
import { apiFetch, clearAuthSession, getStoredCompany, getStoredUser, isImpersonating, stopImpersonation } from '@/lib/api';

const roleLabels: Record<string, string> = {
  SUPERADMIN: 'Super administrador',
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  AGENT: 'Agente',
};

const navigation = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { href: '/conversations', label: 'Conversaciones', icon: MessageSquareText, module: 'conversations' },
  { href: '/instances', label: 'WhatsApp', icon: Wifi, module: 'instances' },
  { href: '/team', label: 'Equipo y agentes', icon: Users, module: 'team' },
  { href: '/incidents', label: 'Incidencias', icon: AlertTriangle, module: 'incidents' },
  { href: '/api-settings', label: 'API e integraciones', icon: KeyRound, module: 'api-settings' },
  { href: '/feedback', label: 'Sugerencias y reportes', icon: Lightbulb, module: 'feedback' },
];

const crmNavigation = [
  { href: '/crm/leads', label: 'Prospectos', icon: UserPlus, module: 'crm' },
  { href: '/crm/deals', label: 'Tratos', icon: Handshake, module: 'crm' },
  { href: '/crm/pipelines', label: 'Pipelines', icon: Kanban, module: 'crm' },
];

export function AppShell({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [identity, setIdentity] = useState({ company: 'Empresa', role: 'Usuario', initials: 'BW', name: '', email: '' });
  const [profileModal, setProfileModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  // null = ver todo (rol no restringido, o aún no se resolvió /auth/me). Un array = lista
  // de módulos permitidos para un Agente restringido — ver AppShell más abajo.
  const [allowedModules, setAllowedModules] = useState<string[] | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  // Below 640px the sidebar becomes a hidden off-canvas drawer instead of an icon rail
  // (see the ≤640px block in globals.css) — this tracks whether it's pulled open. The
  // same hamburger button drives both `collapsed` and this; each is only visually
  // meaningful at its own breakpoint; toggling the other is harmless.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem('brainwsp_sidebar_collapsed') === '1');
    setImpersonating(isImpersonating());
  }, []);

  const returnToAdmin = () => {
    stopImpersonation();
    router.replace('/admin/clients');
  };

  // Close the mobile drawer on route change, and don't let the page scroll behind it while open.
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileNavOpen]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem('brainwsp_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
    setMobileNavOpen((current) => !current);
  };

  useEffect(() => {
    try {
      const user = getStoredUser<{ role?: string; name?: string; email?: string }>();
      const company = getStoredCompany<{ name?: string }>();
      const name = String(company.name || 'Empresa');
      setIdentity({
        company: name,
        role: String(user.role || 'Usuario'),
        initials: name.split(' ').slice(0, 2).map((part: string) => part[0]).join('').toUpperCase() || 'BW',
        name: String(user.name || ''),
        email: String(user.email || ''),
      });
    } catch {}
  }, []);

  const openProfile = () => {
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordError('');
    setPasswordSuccess(false);
    setProfileModal(true);
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

  // Resuelto en cada carga (no cacheado en el token) para que un cambio de permisos
  // hecho por un admin se refleje sin que el agente tenga que volver a iniciar sesión.
  useEffect(() => {
    apiFetch<{ role: string; allowedModules?: string[] }>('/auth/me')
      .then((me) => setAllowedModules(me.role === 'AGENT' && me.allowedModules?.length ? me.allowedModules : null))
      .catch(() => setAllowedModules(null));
  }, []);

  const visibleNavigation = allowedModules ? navigation.filter((item) => allowedModules.includes(item.module)) : navigation;
  const visibleCrmNavigation = allowedModules ? crmNavigation.filter((item) => allowedModules.includes(item.module)) : crmNavigation;

  // Si el agente navega directo a una ruta que ya no tiene permitida, lo saca de ahí
  // en vez de dejarlo viendo una página vacía o rebotando contra el backend.
  useEffect(() => {
    if (!allowedModules) return;
    const current = [...navigation, ...crmNavigation].find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    if (current && !allowedModules.includes(current.module)) {
      router.replace(visibleNavigation[0]?.href || visibleCrmNavigation[0]?.href || '/login');
    }
  }, [allowedModules, pathname, router, visibleNavigation, visibleCrmNavigation]);

  const logout = () => {
    clearAuthSession();
    router.replace('/login');
  };

  return (
    <Protected>
      {impersonating && (
        <div className="impersonation-banner">
          <Eye size={14} />
          <span>Estás viendo la cuenta de <strong>{identity.name || identity.company}</strong> como soporte.</span>
          <button type="button" onClick={returnToAdmin}>Volver a admin</button>
        </div>
      )}
      <div className={`app-frame ${collapsed ? 'collapsed' : ''} ${mobileNavOpen ? 'mobile-nav-open' : ''} ${impersonating ? 'with-impersonation-banner' : ''}`}>
        <div className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} />
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">B</div>
            <div>
              <strong>BrainWSP</strong>
              <span>Business Hub</span>
            </div>
          </div>

          <nav className="nav-list">
            <div className="nav-caption">OPERACIÓN</div>
            {visibleNavigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link className={`nav-item ${active ? 'active' : ''}`} href={item.href} key={item.href}>
                  <Icon size={19} />
                  <span>{item.label}</span>
                  {item.href === '/conversations' && <span className="nav-badge">Live</span>}
                </Link>
              );
            })}
            {visibleCrmNavigation.length > 0 && (
              <>
                <div className="nav-caption nav-gap">CRM</div>
                {visibleCrmNavigation.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link className={`nav-item ${active ? 'active' : ''}`} href={item.href} key={item.href}>
                      <Icon size={19} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </>
            )}
            <div className="nav-caption nav-gap">PRÓXIMAMENTE</div>
            <div className="nav-item muted"><Bot size={19} /><span>Agentes IA</span></div>
            <div className="nav-item muted"><Activity size={19} /><span>Automatizaciones</span></div>
          </nav>

          <div className="sidebar-footer">
            <button className="account-button" type="button" onClick={openProfile}>
              <div className="avatar">{identity.initials}</div>
              <div className="account-copy"><strong>{identity.company}</strong><span>{identity.role}</span></div>
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
            <div className="topbar-actions">
              {actions}
              <button className="icon-button" type="button" aria-label="Configuración" title="Mi perfil y configuración" onClick={openProfile}><Settings size={19} /></button>
            </div>
          </header>
          <div className="page-content">{children}</div>
        </main>
      </div>

      {profileModal && (
        <div className="modal-backdrop" onClick={() => setProfileModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Mi perfil</h2><p>Tus datos de acceso a BrainWSP.</p></div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field"><label>Nombre</label><input value={identity.name} disabled /></div>
                <div className="field"><label>Correo</label><input value={identity.email} disabled /></div>
                <div className="field"><label>Empresa</label><input value={identity.company} disabled /></div>
                <div className="field"><label>Rol</label><input value={roleLabels[identity.role] || identity.role} disabled /></div>
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

      <FeedbackWidget />
    </Protected>
  );
}
