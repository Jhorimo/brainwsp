'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Bot,
  ChevronDown,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  MessageSquareText,
  Settings,
  Users,
  Wifi,
} from 'lucide-react';
import { Protected } from './protected';
import { FeedbackWidget } from './feedback-widget';

const navigation = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/conversations', label: 'Conversaciones', icon: MessageSquareText },
  { href: '/instances', label: 'WhatsApp', icon: Wifi },
  { href: '/team', label: 'Equipo y agentes', icon: Users },
  { href: '/incidents', label: 'Incidencias', icon: AlertTriangle },
  { href: '/api-settings', label: 'API e integraciones', icon: KeyRound },
  { href: '/feedback', label: 'Sugerencias y reportes', icon: Lightbulb },
];

export function AppShell({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [identity, setIdentity] = useState({ company: 'Empresa', role: 'Usuario', initials: 'BW' });

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('brainwsp_user') || '{}');
      const company = JSON.parse(localStorage.getItem('brainwsp_company') || '{}');
      const name = String(company.name || 'Empresa');
      setIdentity({
        company: name,
        role: String(user.role || 'Usuario'),
        initials: name.split(' ').slice(0, 2).map((part: string) => part[0]).join('').toUpperCase() || 'BW',
      });
    } catch {}
  }, []);

  const logout = () => {
    localStorage.removeItem('brainwsp_token');
    localStorage.removeItem('brainwsp_user');
    localStorage.removeItem('brainwsp_company');
    router.replace('/login');
  };

  return (
    <Protected>
      <div className="app-frame">
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
            {navigation.map((item) => {
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
            <div className="nav-caption nav-gap">PRÓXIMAMENTE</div>
            <div className="nav-item muted"><Bot size={19} /><span>Agentes IA</span></div>
            <div className="nav-item muted"><Activity size={19} /><span>Automatizaciones</span></div>
          </nav>

          <div className="sidebar-footer">
            <button className="account-button" type="button">
              <div className="avatar">{identity.initials}</div>
              <div className="account-copy"><strong>{identity.company}</strong><span>{identity.role}</span></div>
              <ChevronDown size={16} />
            </button>
            <button className="logout-button" onClick={logout} type="button"><LogOut size={17} />Cerrar sesión</button>
          </div>
        </aside>

        <main className="main-area">
          <header className="topbar">
            <div>
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
            <div className="topbar-actions">
              {actions}
              <button className="icon-button" type="button" aria-label="Configuración"><Settings size={19} /></button>
            </div>
          </header>
          <div className="page-content">{children}</div>
        </main>
      </div>
      <FeedbackWidget />
    </Protected>
  );
}
