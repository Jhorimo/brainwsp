'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api';

type Company = {
  id: string; name: string; active: boolean;
  plan?: { id: string; name: string } | null;
  licenseRenewsAt?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function licenseState(renewsAt?: string | null): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  if (!renewsAt) return { label: 'Sin vencimiento', tone: 'neutral' };
  const daysLeft = Math.ceil((new Date(renewsAt).getTime() - Date.now()) / DAY_MS);
  if (daysLeft < 0) return { label: 'Vencida', tone: 'danger' };
  if (daysLeft <= 7) return { label: `Vence en ${daysLeft} día(s)`, tone: 'warning' };
  return { label: 'Vigente', tone: 'success' };
}

export default function AdminLicensesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try { setCompanies(await apiFetch<Company[]>('/admin/companies')); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron cargar las licencias'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveDate = async (company: Company) => {
    const raw = drafts[company.id];
    if (raw === undefined) return;
    const licenseRenewsAt = raw ? new Date(raw).toISOString() : null;
    setCompanies((current) => current.map((item) => item.id === company.id ? { ...item, licenseRenewsAt } : item));
    try {
      await apiFetch(`/admin/companies/${company.id}`, { method: 'PATCH', body: JSON.stringify({ licenseRenewsAt }) });
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar la fecha de vencimiento'); await load(); }
  };

  const expiringSoon = companies.filter((c) => {
    if (!c.licenseRenewsAt) return false;
    const daysLeft = Math.ceil((new Date(c.licenseRenewsAt).getTime() - Date.now()) / DAY_MS);
    return daysLeft <= 7;
  });

  return (
    <AdminShell title="Licencias" subtitle="Vencimiento de la suscripción de cada cliente">
      {error && <div className="error-box">{error}</div>}

      {expiringSoon.length > 0 && (
        <div className="warning-box" style={{ marginBottom: 18 }}>
          <strong>{expiringSoon.length} cliente(s)</strong>&nbsp;con la licencia vencida o por vencer en los próximos 7 días: {expiringSoon.map((c) => c.name).join(', ')}.
        </div>
      )}

      <section className="table-card">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Plan</th>
              <th>Estado de la licencia</th>
              <th>Vence</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => {
              const state = licenseState(company.licenseRenewsAt);
              const draft = drafts[company.id] ?? (company.licenseRenewsAt ? company.licenseRenewsAt.slice(0, 10) : '');
              return (
                <tr key={company.id}>
                  <td><span className="row-main">{company.name}</span></td>
                  <td>{company.plan?.name || 'Sin plan'}</td>
                  <td><span className={`status-pill ${state.tone === 'danger' ? 'warning' : state.tone}`}><span className="status-dot" />{state.label}</span></td>
                  <td><input type="date" value={draft} onChange={(e) => setDrafts((current) => ({ ...current, [company.id]: e.target.value }))} /></td>
                  <td style={{ textAlign: 'right' }}><button className="button small" onClick={() => void saveDate(company)}>Guardar</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!companies.length && <div className="empty-state"><div><strong>Aún no hay clientes</strong></div></div>}
      </section>
    </AdminShell>
  );
}
