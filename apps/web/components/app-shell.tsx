'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BrandIcon } from './brand-mark';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bot,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Handshake,
  Kanban,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  Lightbulb,
  Lock,
  LogOut,
  Menu,
  MessageSquareText,
  Minus,
  Settings,
  ShieldCheck,
  User,
  UserPlus,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import { Protected } from './protected';
import { API_URL, apiFetch, clearAuthSession, getStoredCompany, getStoredUser, isImpersonating, stopImpersonation, updateStoredCompany, updateStoredUser } from '@/lib/api';
import { ALL_MODULE_KEYS, MODULE_TREE } from '@/lib/modules';

type MasterCredential = {
  id: string;
  name: string;
  appKey: string;
  hasAuthKey: boolean;
  authKey?: string;
};

const GATEWAY_BASE_URL = API_URL.replace(/\/api\/?$/, '');

function personInitialsOf(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';
}

const roleLabels: Record<string, string> = {
  SUPERADMIN: 'Super administrador',
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  AGENT: 'Agente',
};

const navigation = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
  // Conversaciones va justo después del Dashboard (no dentro del grupo "CRM" de abajo) porque
  // es la página que un agente abre todo el día — el chat en vivo, el corazón del producto —
  // no algo de uso ocasional como el resto de items de esta lista.
  { href: '/conversations', label: 'Conversaciones', icon: MessageSquareText, module: 'conversations' },
  { href: '/instances', label: 'WhatsApp', icon: Wifi, module: 'instances' },
  { href: '/automations', label: 'Automatizaciones', icon: Zap, module: 'automations-flows' },
  { href: '/automations/templates', label: 'Galería de Plantillas', icon: LayoutTemplate, module: 'automations-templates' },
  { href: '/team', label: 'Equipo y agentes', icon: Users, module: 'team' },
  { href: '/incidents', label: 'Incidencias', icon: AlertTriangle, module: 'incidents' },
  { href: '/api-settings', label: 'API e integraciones', icon: KeyRound, module: 'api-settings' },
  { href: '/feedback', label: 'Sugerencias y reportes', icon: Lightbulb, module: 'feedback' },
];

const crmNavigation = [
  { href: '/calendar', label: 'Calendario', icon: CalendarDays, module: 'calendar' },
  { href: '/crm/leads', label: 'Prospectos', icon: UserPlus, module: 'crm-leads' },
  { href: '/crm/deals', label: 'Tratos', icon: Handshake, module: 'crm-deals' },
  { href: '/crm/pipelines', label: 'Pipelines', icon: Kanban, module: 'crm-pipelines' },
];

export function AppShell({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [identity, setIdentity] = useState({ company: 'Empresa', role: 'Usuario', initials: 'BW', personInitials: 'U', name: '', email: '' });
  const [profileModal, setProfileModal] = useState(false);
  const [profileTab, setProfileTab] = useState<'perfil' | 'seguridad'>('perfil');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState('');
  const [companyDraft, setCompanyDraft] = useState('');
  const [companySaving, setCompanySaving] = useState(false);
  const [companySaved, setCompanySaved] = useState(false);
  const [companyError, setCompanyError] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [phoneOriginal, setPhoneOriginal] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [masterCredential, setMasterCredential] = useState<MasterCredential | null>(null);
  const [masterAuthKey, setMasterAuthKey] = useState('');
  const [masterAuthVisible, setMasterAuthVisible] = useState(false);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterError, setMasterError] = useState('');
  // Módulos visibles para este usuario ahora mismo: el plan de la empresa es el techo (aplica
  // a todos los roles), y para un Agente restringido se filtra además por su allowedModules
  // propio. Arranca en ALL_MODULE_KEYS (ver todo) hasta que /auth/me resuelve.
  const [effectiveModules, setEffectiveModules] = useState<string[]>(ALL_MODULE_KEYS);
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
        personInitials: personInitialsOf(String(user.name || '')),
        name: String(user.name || ''),
        email: String(user.email || ''),
      });
    } catch {}
  }, []);

  const openProfile = () => {
    setProfileTab('perfil');
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordError('');
    setPasswordSuccess(false);
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setNameDraft(identity.name);
    setNameError('');
    setNameSaved(false);
    setCompanyDraft(identity.company);
    setCompanyError('');
    setCompanySaved(false);
    setPhoneDraft('');
    setPhoneOriginal('');
    setPhoneError('');
    setPhoneSaved(false);
    setMasterCredential(null);
    setMasterAuthKey('');
    setMasterAuthVisible(false);
    setMasterError('');
    setProfileModal(true);
    if (identity.role === 'OWNER' || identity.role === 'ADMIN') {
      void loadMasterCredential();
      void loadCompanyPhone();
    }
  };

  // El teléfono no viaja en el token ni en el company guardado en localStorage (solo
  // id/name/slug desde el login) — hay que pedirlo aparte, igual que el AUTH KEY maestro.
  const loadCompanyPhone = async () => {
    try {
      const company = await apiFetch<{ phone?: string | null }>('/team/company');
      setPhoneDraft(company.phone || '');
      setPhoneOriginal(company.phone || '');
    } catch {}
  };

  const loadMasterCredential = async () => {
    setMasterLoading(true);
    setMasterError('');
    try {
      const credential = await apiFetch<MasterCredential>('/api-credentials/master', { method: 'POST' });
      setMasterCredential(credential);
      if (credential.authKey) setMasterAuthKey(credential.authKey);
    } catch (err) {
      setMasterError(err instanceof Error ? err.message : 'No se pudo obtener el AUTH KEY maestro');
    } finally {
      setMasterLoading(false);
    }
  };

  const toggleMasterAuthKey = async () => {
    if (masterAuthVisible) {
      setMasterAuthVisible(false);
      return;
    }
    if (masterAuthKey) {
      setMasterAuthVisible(true);
      return;
    }
    if (!masterCredential) return;
    setMasterLoading(true);
    setMasterError('');
    try {
      const data = await apiFetch<{ authKey: string }>(`/api-credentials/${masterCredential.id}/reveal`);
      setMasterAuthKey(data.authKey);
      setMasterAuthVisible(true);
    } catch (err) {
      setMasterError(err instanceof Error ? err.message : 'No se pudo mostrar el AUTH KEY maestro');
    } finally {
      setMasterLoading(false);
    }
  };

  const copyMasterAuthKey = async () => {
    if (!masterAuthKey) return;
    await navigator.clipboard.writeText(masterAuthKey);
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === identity.name) return;
    setNameSaving(true);
    setNameError('');
    setNameSaved(false);
    try {
      const updated = await apiFetch<{ name: string }>('/auth/me', { method: 'PATCH', body: JSON.stringify({ name: trimmed }) });
      updateStoredUser({ name: updated.name });
      setIdentity((current) => ({ ...current, name: updated.name, personInitials: personInitialsOf(updated.name) }));
      setNameSaved(true);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'No se pudo actualizar el nombre');
    } finally {
      setNameSaving(false);
    }
  };

  const saveCompany = async () => {
    const trimmed = companyDraft.trim();
    if (!trimmed || trimmed === identity.company) return;
    setCompanySaving(true);
    setCompanyError('');
    setCompanySaved(false);
    try {
      const updated = await apiFetch<{ name: string }>('/team/company', { method: 'PATCH', body: JSON.stringify({ name: trimmed }) });
      updateStoredCompany({ name: updated.name });
      setIdentity((current) => ({
        ...current,
        company: updated.name,
        initials: updated.name.split(' ').slice(0, 2).map((part: string) => part[0]).join('').toUpperCase() || 'BW',
      }));
      setCompanySaved(true);
    } catch (err) {
      setCompanyError(err instanceof Error ? err.message : 'No se pudo actualizar la empresa');
    } finally {
      setCompanySaving(false);
    }
  };

  const savePhone = async () => {
    const trimmed = phoneDraft.trim();
    if (trimmed === phoneOriginal) return;
    setPhoneSaving(true);
    setPhoneError('');
    setPhoneSaved(false);
    try {
      const updated = await apiFetch<{ phone?: string | null }>('/team/company', { method: 'PATCH', body: JSON.stringify({ phone: trimmed }) });
      setPhoneOriginal(updated.phone || '');
      setPhoneDraft(updated.phone || '');
      setPhoneSaved(true);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'No se pudo actualizar el teléfono');
    } finally {
      setPhoneSaving(false);
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

  // Resuelto en cada carga (no cacheado en el token) para que un cambio de plan o de permisos
  // hecho por un admin se refleje sin que el usuario tenga que volver a iniciar sesión.
  useEffect(() => {
    apiFetch<{ role: string; allowedModules?: string[]; planModules?: string[]; licenseExpired?: boolean }>('/auth/me')
      .then((me) => {
        // Licencia vencida corta todo el menú (salvo "Mi Plan", que nunca está gateado por
        // módulo) hasta que la empresa renueve — no aplica a SUPERADMIN, que no depende del
        // estado de facturación de la empresa de su propia cuenta.
        if (me.licenseExpired && me.role !== 'SUPERADMIN') { setEffectiveModules([]); return; }
        const planModules = me.planModules?.length ? me.planModules : ALL_MODULE_KEYS;
        const modules = me.role === 'AGENT' && me.allowedModules?.length
          ? planModules.filter((key) => me.allowedModules!.includes(key))
          : planModules;
        setEffectiveModules(modules);
      })
      .catch(() => setEffectiveModules(ALL_MODULE_KEYS));
  }, []);

  // Un módulo que el plan no incluye sigue apareciendo en el menú (candado + texto atenuado)
  // en vez de ocultarse — el clic lleva a "Mi Plan" a subir de plan, no a la página real.
  const isLocked = (moduleKey: string) => !effectiveModules.includes(moduleKey);
  const lockedHref = (moduleKey: string) => `/my-plan?locked=${moduleKey}`;

  // Los bloqueados igual quedan visibles (son el gancho hacia "Mi Plan"), pero intercalados con
  // los que sí puede usar la sección se ve saturada de candados — se ordenan al final de su
  // propia sección en vez de ocultarse o de reordenar contra el resto del menú.
  const sortByLocked = <T extends { module: string }>(items: T[]) => [...items].sort((a, b) => Number(isLocked(a.module)) - Number(isLocked(b.module)));

  // Si el usuario navega directo (URL escrita a mano) a una ruta que su plan/permisos ya no
  // incluyen, lo saca de ahí hacia "Mi Plan" en vez de dejarlo viendo una página que el backend
  // igual le va a rechazar.
  useEffect(() => {
    const current = [...navigation, ...crmNavigation].find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    if (current && isLocked(current.module)) {
      router.replace(lockedHref(current.module));
    }
  }, [effectiveModules, pathname, router]);

  const isAccountManager = identity.role === 'OWNER' || identity.role === 'ADMIN';

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
            <div className="brand-mark"><BrandIcon /></div>
            <div>
              <strong>BrainWSP</strong>
              <span>Business Hub</span>
            </div>
          </div>

          <nav className="nav-list">
            <div className="nav-caption">OPERACIÓN</div>
            {sortByLocked(navigation).map((item) => {
              const Icon = item.icon;
              const locked = isLocked(item.module);
              const active = !locked && (pathname === item.href || pathname.startsWith(`${item.href}/`));
              return (
                <Link className={`nav-item ${active ? 'active' : ''} ${locked ? 'locked' : ''}`} href={locked ? lockedHref(item.module) : item.href} key={item.href} title={locked ? 'Disponible en un plan superior' : undefined}>
                  <Icon size={19} />
                  <span>{item.label}</span>
                  {item.href === '/conversations' && !locked && <span className="nav-badge">Live</span>}
                  {locked && <Lock size={11} className="nav-lock" />}
                </Link>
              );
            })}
            <div className="nav-caption nav-gap">CRM</div>
            {sortByLocked(crmNavigation).map((item) => {
              const Icon = item.icon;
              const locked = isLocked(item.module);
              const active = !locked && (pathname === item.href || pathname.startsWith(`${item.href}/`));
              return (
                <Link className={`nav-item ${active ? 'active' : ''} ${locked ? 'locked' : ''}`} href={locked ? lockedHref(item.module) : item.href} key={item.href} title={locked ? 'Disponible en un plan superior' : undefined}>
                  <Icon size={19} />
                  <span>{item.label}</span>
                  {locked && <Lock size={11} className="nav-lock" />}
                </Link>
              );
            })}
            {identity.role === 'OWNER' && (
              <>
                <div className="nav-caption nav-gap">CUENTA</div>
                <Link className={`nav-item ${pathname.startsWith('/my-plan') ? 'active' : ''}`} href="/my-plan">
                  <CreditCard size={19} />
                  <span>Mi Plan</span>
                </Link>
              </>
            )}
            <div className="nav-caption nav-gap">PRÓXIMAMENTE</div>
            <div className="nav-item muted"><Bot size={19} /><span>Agentes IA</span></div>
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
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Mi perfil</h2><p>Tus datos de acceso a BrainWSP.</p></div>
            <div className="chat-quick-filters profile-tabs">
              <button type="button" className={`chat-quick-tab ${profileTab === 'perfil' ? 'active' : ''}`} onClick={() => setProfileTab('perfil')}><User size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Perfil</button>
              <button type="button" className={`chat-quick-tab ${profileTab === 'seguridad' ? 'active' : ''}`} onClick={() => setProfileTab('seguridad')}><ShieldCheck size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Seguridad</button>
            </div>

            {profileTab === 'perfil' ? (
              <div className="modal-body profile-modal-body">
                <div className="profile-avatar-card">
                  <div className="profile-avatar">{identity.personInitials}</div>
                  <div className="profile-avatar-name">{identity.name || identity.email}</div>
                  <div className="profile-avatar-email">{identity.email}</div>
                  <span className="status-pill neutral">{roleLabels[identity.role] || identity.role}</span>
                </div>

                <div>
                  {nameError && <div className="error-box">{nameError}</div>}
                  {companyError && <div className="error-box">{companyError}</div>}

                  <div className="profile-section">
                    <div className="profile-section-title"><User size={14} />Información personal</div>
                    <div className="form-grid plan-form-grid">
                      <div className="field">
                        <label>Nombre</label>
                        <div className="field-with-action">
                          <input value={nameDraft} onChange={(e) => { setNameDraft(e.target.value); setNameSaved(false); }} onKeyDown={(e) => { if (e.key === 'Enter') void saveName(); }} />
                          {nameDraft.trim() && nameDraft.trim() !== identity.name && (
                            <button className={`button small notes-save-button ${nameSaved ? 'saved' : ''}`} disabled={nameSaving} onMouseDown={(e) => e.preventDefault()} onClick={() => void saveName()} title="Guardar nombre">
                              {nameSaving ? '...' : <Check size={13} />}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="field"><label>Correo</label><input value={identity.email} disabled title="El correo no se puede cambiar desde aquí" /></div>
                      <div className="field"><label>Rol</label><input value={roleLabels[identity.role] || identity.role} disabled title="El rol lo asigna un administrador desde Equipo y agentes" /></div>
                    </div>
                  </div>

                  <div className="profile-section">
                    <div className="profile-section-title"><Building2 size={14} />Empresa</div>
                    <div className="form-grid plan-form-grid">
                      <div className="field">
                        <label>Nombre de la empresa</label>
                        {isAccountManager ? (
                          <div className="field-with-action">
                            <input value={companyDraft} onChange={(e) => { setCompanyDraft(e.target.value); setCompanySaved(false); }} onKeyDown={(e) => { if (e.key === 'Enter') void saveCompany(); }} />
                            {companyDraft.trim() && companyDraft.trim() !== identity.company && (
                              <button className={`button small notes-save-button ${companySaved ? 'saved' : ''}`} disabled={companySaving} onMouseDown={(e) => e.preventDefault()} onClick={() => void saveCompany()} title="Guardar empresa">
                                {companySaving ? '...' : <Check size={13} />}
                              </button>
                            )}
                          </div>
                        ) : (
                          <input value={identity.company} disabled title="Solo el propietario o un administrador puede cambiar el nombre de la empresa" />
                        )}
                      </div>
                      {isAccountManager && (
                        <div className="field">
                          <label>Teléfono de contacto</label>
                          <div className="field-with-action">
                            <input value={phoneDraft} onChange={(e) => { setPhoneDraft(e.target.value); setPhoneSaved(false); }} onKeyDown={(e) => { if (e.key === 'Enter') void savePhone(); }} placeholder="+51 999 888 777" />
                            {phoneDraft.trim() !== phoneOriginal && (
                              <button className={`button small notes-save-button ${phoneSaved ? 'saved' : ''}`} disabled={phoneSaving} onMouseDown={(e) => e.preventDefault()} onClick={() => void savePhone()} title="Guardar teléfono">
                                {phoneSaving ? '...' : <Check size={13} />}
                              </button>
                            )}
                          </div>
                          {phoneError && <span className="row-sub" style={{ color: 'var(--danger)' }}>{phoneError}</span>}
                        </div>
                      )}
                    </div>
                    {isAccountManager && <span className="row-sub">Así nuestro equipo puede contactarte para coordinar tu plan o soporte.</span>}
                  </div>

                  {isAccountManager && (
                    <div className="profile-section">
                      <div className="profile-section-title"><LayoutGrid size={14} />Módulos</div>
                      <p className="row-sub" style={{ marginTop: -6, marginBottom: 10 }}>Lo que incluye tu plan actual. Lo bloqueado se activa subiendo de plan desde &quot;Mi Plan&quot;.</p>
                      <div className="module-tree" style={{ maxHeight: 'none' }}>
                        {MODULE_TREE.map((node) => {
                          const keys = (node.children ?? [node]).map((child) => child.key);
                          const activeCount = keys.filter((key) => effectiveModules.includes(key)).length;
                          const StatusIcon = activeCount === keys.length ? Check : activeCount === 0 ? Lock : Minus;
                          const statusColor = activeCount === keys.length ? '#16a34a' : activeCount === 0 ? '#94a3b8' : '#d97706';
                          return (
                            <div key={node.key} className="module-group">
                              <div className="module-row">
                                <div className="member-option" style={{ border: 0, padding: '4px 0', cursor: 'default' }}>
                                  <StatusIcon size={14} color={statusColor} />
                                  <div><strong>{node.label}</strong></div>
                                </div>
                              </div>
                              {node.children && (
                                <div className="module-children">
                                  {node.children.map((child) => {
                                    const active = effectiveModules.includes(child.key);
                                    return (
                                      <div className="member-option" key={child.key} style={{ border: 0, padding: '4px 0', cursor: 'default' }}>
                                        {active ? <Check size={13} color="#16a34a" /> : <Lock size={12} color="#94a3b8" />}
                                        <div><strong style={{ opacity: active ? 1 : .55 }}>{child.label}</strong></div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isAccountManager && (
                    <div className="profile-section">
                      <div className="profile-section-title"><KeyRound size={14} />Integración BrainPOS</div>
                      <p className="row-sub" style={{ marginTop: -6, marginBottom: 10 }}>Este AUTH KEY maestro permite que cada instalación de BrainPOS cree su propia instancia y reciba automáticamente su APP KEY.</p>
                      {masterError && <div className="error-box">{masterError}</div>}
                      {masterLoading && !masterCredential ? <div className="row-sub">Preparando credencial maestra...</div> : masterCredential && (
                        <div className="form-grid plan-form-grid">
                          <div className="field"><label>URL del Gateway</label><div className="secret-box">{GATEWAY_BASE_URL}</div></div>
                          <div className="field"><label>AUTH KEY maestro</label><div className="field-with-action"><div className="secret-box" style={{ flex: 1, overflowWrap: 'anywhere' }}>{masterAuthVisible ? masterAuthKey : '••••••••••••••••••••••••'}</div><button className="icon-button" type="button" disabled={masterLoading || !masterCredential.hasAuthKey} onClick={() => void toggleMasterAuthKey()} title={masterAuthVisible ? 'Ocultar AUTH KEY' : 'Ver AUTH KEY'}>{masterAuthVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button><button className="icon-button" type="button" disabled={!masterAuthKey} onClick={() => void copyMasterAuthKey()} title="Copiar AUTH KEY"><Copy size={15} /></button></div></div>
                        </div>
                      )}
                      <div className="warning-box"><KeyRound size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Trátalo como una contraseña: con este token se pueden crear y controlar las instancias vinculadas a tu empresa.</div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="modal-body">
                <div className="profile-section">
                  <div className="profile-section-title"><Lock size={14} />Cambiar contraseña</div>
                  {passwordError && <div className="error-box">{passwordError}</div>}
                  {passwordSuccess && <div className="success-box">Contraseña actualizada correctamente.</div>}
                  <div className="form-grid plan-form-grid">
                    <div className="field field-full">
                      <label>Contraseña actual</label>
                      <div className="password-input">
                        <input type={showCurrentPassword ? 'text' : 'password'} value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} autoComplete="current-password" />
                        <button type="button" className="password-toggle" onClick={() => setShowCurrentPassword((v) => !v)} aria-label={showCurrentPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                      </div>
                    </div>
                    <div className="field">
                      <label>Nueva contraseña</label>
                      <div className="password-input">
                        <input type={showNewPassword ? 'text' : 'password'} value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} placeholder="Mínimo 10 caracteres" autoComplete="new-password" />
                        <button type="button" className="password-toggle" onClick={() => setShowNewPassword((v) => !v)} aria-label={showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                      </div>
                    </div>
                    <div className="field">
                      <label>Confirmar nueva contraseña</label>
                      <div className="password-input">
                        <input type={showConfirmPassword ? 'text' : 'password'} value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} autoComplete="new-password" />
                        <button type="button" className="password-toggle" onClick={() => setShowConfirmPassword((v) => !v)} aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="button" onClick={() => setProfileModal(false)}>Cerrar</button>
              {profileTab === 'seguridad' && (
                <button className="button primary" disabled={passwordSaving || !passwordForm.currentPassword || !passwordForm.newPassword} onClick={() => void changePassword()}>{passwordSaving ? 'Guardando...' : 'Cambiar contraseña'}</button>
              )}
            </div>
          </div>
        </div>
      )}

    </Protected>
  );
}
