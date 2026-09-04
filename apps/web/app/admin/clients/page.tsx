'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronDown, ChevronRight, LayoutGrid, MessagesSquare, Radio, Sparkles, Users } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { useConfirm } from '@/components/confirm-provider';
import { apiFetch, startImpersonation } from '@/lib/api';
import { ALL_MODULE_KEYS, MODULE_TREE, type ModuleNode } from '@/lib/modules';

type Owner = { id: string; name: string; email: string };
type Plan = { id: string; name: string; moduleKeys?: string[] };
type Company = {
  id: string; name: string; active: boolean; phone?: string | null;
  planId?: string | null; plan?: Plan | null; planStartedAt?: string | null; licenseRenewsAt?: string | null; createdAt: string;
  moduleOverrides: string[];
  users: Owner[];
  _count: { instances: number; conversations: number; users: number };
};

// [] en el plan significa "sin restricción" (todos los módulos) — ver AgentAccessService.
function planEffectiveKeys(company: Company): string[] {
  const keys = company.plan?.moduleKeys ?? [];
  return keys.length ? keys : ALL_MODULE_KEYS;
}

function daysUntil(dateIso?: string | null) {
  if (!dateIso) return null;
  return Math.ceil((new Date(dateIso).getTime() - Date.now()) / (24 * 3600 * 1000));
}

function initialsOf(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

export default function AdminClientsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modulesCompany, setModulesCompany] = useState<Company | null>(null);
  const [moduleSelection, setModuleSelection] = useState<string[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [moduleSaving, setModuleSaving] = useState(false);
  const [moduleError, setModuleError] = useState('');

  const load = useCallback(async () => {
    try {
      const [companyList, planList] = await Promise.all([
        apiFetch<Company[]>('/admin/companies'),
        apiFetch<Plan[]>('/admin/plans'),
      ]);
      setCompanies(companyList);
      setPlans(planList);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cargar la lista de clientes'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleActive = async (company: Company) => {
    const active = !company.active;
    setCompanies((current) => current.map((item) => item.id === company.id ? { ...item, active } : item));
    try {
      await apiFetch(`/admin/companies/${company.id}`, { method: 'PATCH', body: JSON.stringify({ active }) });
    } catch (err) {
      setCompanies((current) => current.map((item) => item.id === company.id ? { ...item, active: !active } : item));
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado');
    }
  };

  const changePlan = async (company: Company, planId: string) => {
    const plan = plans.find((item) => item.id === planId) || null;
    setCompanies((current) => current.map((item) => item.id === company.id ? { ...item, planId: planId || null, plan } : item));
    try {
      await apiFetch(`/admin/companies/${company.id}`, { method: 'PATCH', body: JSON.stringify({ planId: planId || null }) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el plan');
      await load();
    }
  };

  const deleteCompany = async (company: Company) => {
    if (!(await confirm(
      `¿Eliminar "${company.name}" definitivamente? Se borran también sus usuarios, instancias de WhatsApp, conversaciones y mensajes. Esta acción no se puede deshacer.`,
      { title: 'Eliminar empresa', confirmText: 'Eliminar' },
    ))) return;
    setBusyId(company.id);
    try {
      await apiFetch(`/admin/companies/${company.id}`, { method: 'DELETE' });
      setCompanies((current) => current.filter((item) => item.id !== company.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la empresa');
    } finally {
      setBusyId(null);
    }
  };

  const viewPanel = async (company: Company) => {
    if (!(await confirm(`Vas a entrar como el panel de "${company.name}". Podrás volver a tu cuenta de administrador con el botón "Volver a admin".`, { title: 'Entrar como cliente', confirmText: 'Entrar', danger: false }))) return;
    setBusyId(company.id);
    try {
      const session = await apiFetch<{ accessToken: string; user: unknown; company: unknown }>(`/admin/companies/${company.id}/impersonate`, { method: 'POST' });
      startImpersonation(session);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar al panel de este cliente');
    } finally {
      setBusyId(null);
    }
  };

  const activeCount = companies.filter((c) => c.active).length;

  const openModules = (company: Company) => {
    setModulesCompany(company);
    setModuleSelection(company.moduleOverrides.length ? company.moduleOverrides : planEffectiveKeys(company));
    setModuleError('');
  };

  const toggleModuleKey = (key: string, checked: boolean) => {
    setModuleSelection((current) => checked ? [...current, key] : current.filter((k) => k !== key));
  };

  const toggleModuleGroup = (node: ModuleNode, checked: boolean) => {
    const keys = (node.children ?? [node]).map((child) => child.key);
    setModuleSelection((current) => checked
      ? Array.from(new Set([...current, ...keys]))
      : current.filter((k) => !keys.includes(k)));
  };

  const saveModules = async () => {
    if (!modulesCompany) return;
    setModuleSaving(true); setModuleError('');
    try {
      const updated = await apiFetch<Company>(`/admin/companies/${modulesCompany.id}`, { method: 'PATCH', body: JSON.stringify({ moduleOverrides: moduleSelection }) });
      setCompanies((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setModulesCompany(null);
    } catch (err) { setModuleError(err instanceof Error ? err.message : 'No se pudo guardar'); }
    finally { setModuleSaving(false); }
  };

  // Borra la excepción del cliente para que vuelva a heredar exactamente lo que diga su plan
  // — no cierra el modal, así se ve de inmediato qué quedó habilitado.
  const resetModulesToPlan = async () => {
    if (!modulesCompany) return;
    setModuleSaving(true); setModuleError('');
    try {
      const updated = await apiFetch<Company>(`/admin/companies/${modulesCompany.id}`, { method: 'PATCH', body: JSON.stringify({ moduleOverrides: [] }) });
      setCompanies((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setModulesCompany(updated);
      setModuleSelection(planEffectiveKeys(updated));
    } catch (err) { setModuleError(err instanceof Error ? err.message : 'No se pudo restablecer'); }
    finally { setModuleSaving(false); }
  };

  return (
    <AdminShell title="Usuarios" subtitle={`Todos los clientes registrados en la plataforma. ${companies.length} en total.`}>
      {error && <div className="error-box">{error}</div>}

      <div className="grid-stats" style={{ marginBottom: 22 }}>
        <div className="stat-card"><div className="stat-icon"><Building2 size={19} /></div><div className="stat-label">Clientes</div><div className="stat-value">{companies.length}</div><div className="stat-meta">Empresas registradas</div></div>
        <div className="stat-card"><div className="stat-icon"><Radio size={19} /></div><div className="stat-label">Activos</div><div className="stat-value">{activeCount}</div><div className="stat-meta">{companies.length - activeCount} suspendido(s)</div></div>
        <div className="stat-card"><div className="stat-icon"><Users size={19} /></div><div className="stat-label">Sin plan</div><div className="stat-value">{companies.filter((c) => !c.planId).length}</div><div className="stat-meta">Clientes sin plan asignado</div></div>
      </div>

      <section className="table-card">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Propietario</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Plan</th>
              <th>Suscrito desde</th>
              <th>Vence</th>
              <th>Días rest.</th>
              <th>Teléfono</th>
              <th>Actividad</th>
              <th>Registro</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => {
              const owner = company.users[0];
              const remaining = daysUntil(company.licenseRenewsAt);
              return (
                <tr key={company.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="chat-avatar" style={{ width: 32, height: 32, fontSize: 11, flexShrink: 0 }}>{initialsOf(company.name)}</div>
                      <span className="row-main">{company.name}</span>
                    </div>
                  </td>
                  <td><span className="row-main">{owner?.name || '—'}</span><span className="row-sub">{owner?.email || '—'}</span></td>
                  <td><span className="status-pill neutral">Cliente</span></td>
                  <td><span className={`status-pill ${company.active ? 'success' : 'neutral'}`}><span className="status-dot" />{company.active ? 'Activo' : 'Suspendido'}</span></td>
                  <td>
                    <select className="status-select" value={company.planId || ''} onChange={(e) => void changePlan(company, e.target.value)}>
                      <option value="">Sin plan</option>
                      {plans.map((plan) => <option value={plan.id} key={plan.id}>{plan.name}</option>)}
                    </select>
                  </td>
                  <td>{company.planStartedAt ? new Date(company.planStartedAt).toLocaleDateString('es-PE') : '—'}</td>
                  <td>{company.licenseRenewsAt ? new Date(company.licenseRenewsAt).toLocaleDateString('es-PE') : '—'}</td>
                  <td>
                    {remaining === null ? <span className="row-sub">Sin vencimiento</span> : (
                      <span className={`status-pill ${remaining < 0 ? 'danger' : remaining <= 3 ? 'neutral' : 'success'}`}>
                        {remaining < 0 ? `Vencido hace ${Math.abs(remaining)}d` : remaining === 0 ? 'Vence hoy' : `${remaining}d`}
                      </span>
                    )}
                  </td>
                  <td>{company.phone || '—'}</td>
                  <td><Radio size={11} style={{ verticalAlign: -1, marginRight: 3, opacity: .5 }} />{company._count.instances} inst. · <MessagesSquare size={11} style={{ verticalAlign: -1, marginRight: 3, opacity: .5 }} />{company._count.conversations} conv.</td>
                  <td>{new Date(company.createdAt).toLocaleDateString('es-PE')}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="button small" onClick={() => openModules(company)}><LayoutGrid size={13} />Módulos{company.moduleOverrides.length > 0 && <Sparkles size={11} color="#d97706" style={{ marginLeft: 4 }} />}</button>{' '}
                    <button className="button small info" disabled={busyId === company.id} onClick={() => void viewPanel(company)}>{busyId === company.id ? '...' : 'Ver panel'}</button>{' '}
                    <button className={`button small ${company.active ? 'danger' : 'primary'}`} onClick={() => void toggleActive(company)}>{company.active ? 'Suspender' : 'Activar'}</button>{' '}
                    <button className="button small danger" disabled={busyId === company.id} onClick={() => void deleteCompany(company)}>Eliminar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!companies.length && <div className="empty-state"><div><strong>Aún no hay clientes registrados</strong></div></div>}
      </section>

      {modulesCompany && (
        <div className="modal-backdrop" onClick={() => setModulesCompany(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Módulos de {modulesCompany.name}</h2>
              <p>
                {modulesCompany.plan
                  ? <>Por defecto hereda del plan <strong>{modulesCompany.plan.name}</strong>. Desmarca o marca para crear una excepción específica para este cliente, sin tocar el plan.</>
                  : 'Este cliente no tiene plan asignado. Lo marcado aquí aplica igual como excepción propia del cliente.'}
              </p>
            </div>
            <div className="modal-body">
              {moduleError && <div className="error-box">{moduleError}</div>}
              <div className="module-tree">
                {MODULE_TREE.map((node) => {
                  const keys = (node.children ?? [node]).map((child) => child.key);
                  const selectedCount = keys.filter((key) => moduleSelection.includes(key)).length;
                  const checked = selectedCount === keys.length;
                  const indeterminate = selectedCount > 0 && selectedCount < keys.length;
                  const collapsed = collapsedGroups[node.key];
                  return (
                    <div key={node.key} className="module-group">
                      <div className="module-row">
                        {node.children && (
                          <button type="button" className="module-toggle" onClick={() => setCollapsedGroups((current) => ({ ...current, [node.key]: !current[node.key] }))}>
                            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                        <label className="member-option" style={{ border: 0, padding: '4px 0' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            ref={(el) => { if (el) el.indeterminate = indeterminate; }}
                            onChange={(e) => toggleModuleGroup(node, e.target.checked)}
                          />
                          <div><strong>{node.label}</strong></div>
                        </label>
                      </div>
                      {node.children && !collapsed && (
                        <div className="module-children">
                          {node.children.map((child) => (
                            <label className="member-option" key={child.key} style={{ border: 0, padding: '4px 0' }}>
                              <input
                                type="checkbox"
                                checked={moduleSelection.includes(child.key)}
                                onChange={(e) => toggleModuleKey(child.key, e.target.checked)}
                              />
                              <div><strong>{child.label}</strong></div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-actions">
              {modulesCompany.moduleOverrides.length > 0 && (
                <button className="button" disabled={moduleSaving} onClick={() => void resetModulesToPlan()} style={{ marginRight: 'auto' }}>Restablecer al plan</button>
              )}
              <button className="button" onClick={() => setModulesCompany(null)}>Cancelar</button>
              <button className="button primary" disabled={moduleSaving} onClick={() => void saveModules()}>{moduleSaving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
