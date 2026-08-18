'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, MessagesSquare, Radio, Users } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api';

type Owner = { id: string; name: string; email: string };
type Plan = { id: string; name: string };
type Company = {
  id: string; name: string; active: boolean; phone?: string | null;
  planId?: string | null; plan?: Plan | null; licenseRenewsAt?: string | null; createdAt: string;
  users: Owner[];
  _count: { instances: number; conversations: number; users: number };
};

export default function AdminClientsPage() {
  const router = useRouter();
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
    if (!window.confirm(`Vas a entrar como el panel de "${company.name}". Para volver a tu cuenta de administrador, cierra sesión e ingresa de nuevo.`)) return;
    setBusyId(company.id);
    try {
      const session = await apiFetch<{ accessToken: string; user: unknown; company: unknown }>(`/admin/companies/${company.id}/impersonate`, { method: 'POST' });
      localStorage.setItem('brainwsp_token', session.accessToken);
      localStorage.setItem('brainwsp_user', JSON.stringify(session.user));
      localStorage.setItem('brainwsp_company', JSON.stringify(session.company));
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
              <th>Correo electrónico</th>
              <th>Estado</th>
              <th>Plan</th>
              <th>Teléfono</th>
              <th>Actividad</th>
              <th>Registro</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => {
              const owner = company.users[0];
              return (
                <tr key={company.id}>
                  <td><span className="row-main">{company.name}</span><span className="row-sub">Cliente</span></td>
                  <td>{owner?.email || '—'}</td>
                  <td><span className={`status-pill ${company.active ? 'success' : 'neutral'}`}><span className="status-dot" />{company.active ? 'Activo' : 'Suspendido'}</span></td>
                  <td>
                    <select className="status-select" value={company.planId || ''} onChange={(e) => void changePlan(company, e.target.value)}>
                      <option value="">Sin plan</option>
                      {plans.map((plan) => <option value={plan.id} key={plan.id}>{plan.name}</option>)}
                    </select>
                  </td>
                  <td>{company.phone || '—'}</td>
                  <td><Radio size={11} style={{ verticalAlign: -1, marginRight: 3, opacity: .5 }} />{company._count.instances} inst. · <MessagesSquare size={11} style={{ verticalAlign: -1, marginRight: 3, opacity: .5 }} />{company._count.conversations} conv.</td>
                  <td>{new Date(company.createdAt).toLocaleDateString('es-PE')}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="button small" disabled={busyId === company.id} onClick={() => void viewPanel(company)}>{busyId === company.id ? '...' : 'Ver panel'}</button>{' '}
                    <button className={`button small ${company.active ? '' : 'primary'}`} onClick={() => void toggleActive(company)}>{company.active ? 'Suspender' : 'Activar'}</button>
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
