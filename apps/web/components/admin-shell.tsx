'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, ChevronDown, CreditCard, KeyRound, Lightbulb, LogOut, Menu, ShieldCheck } from 'lucide-react';
import { clearAuthSession, getStoredUser, getToken } from '@/lib/api';

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
  const [collapsed, setCollapsed] = useState(false);
  // Mismo patrón que AppShell (el panel de cada empresa): abajo de 640px la barra lateral
  // pasa a ser un cajón oculto en vez de una barra de íconos — este botón controla ambos
  // casos, cada uno relevante solo en su propio breakpoint.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    try {
      const user = getStoredUser<{ name?: string }>();
      setName(String(user.name || 'Super Admin'));
    } catch {}
    setCollapsed(localStorage.getItem('brainwsp_admin_sidebar_collapsed') === '1');
  }, []);

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
            <div className="brand-mark">B</div>
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
            <button className="account-button" type="button">
              <div className="avatar">{name.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()}</div>
              <div className="account-copy"><strong>{name}</strong><span>Super Admin</span></div>
              <ChevronDown size={16} />
            </button>
            <button className="logout-button" onClick={logout} type="button"><LogOut size={17} />Cerrar sesión</button>
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
    </ProtectedAdmin>
  );
}
