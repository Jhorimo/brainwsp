'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, MessagesSquare, Radio, Users } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { useConfirm } from '@/components/confirm-provider';
import { apiFetch, startImpersonation } from '@/lib/api';

type Owner = { id: string; name: string; email: string };
type Plan = { id: string; name: string };
type Company = {
  id: string; name: string; active: boolean; phone?: string | null;
  planId?: string | null; plan?: Plan | null; planStartedAt?: string | null; licenseRenewsAt?: string | null; createdAt: string;
  users: Owner[];
  _count: { instances: number; conversations: number; users: number };
};

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
                    <button className="button small info" disabled={busyId === company.id} onClick={() => void viewPanel(company)}>{busyId === company.id ? '...' : 'Ver panel'}</button>{' '}
                    <button className={`button small ${company.active ? 'danger' : 'primary'}`} onClick={() => void toggleActive(company)}>{company.active ? 'Suspender' : 'Activar'}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!companies.length && <div className="empty-state"><div><strong>Aún no hay clientes registrados</strong></div></div>}
      </section>
    </AdminShell>
  );
}
