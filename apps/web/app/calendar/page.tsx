'use client';

import { useEffect, useState } from 'react';
import { Link2, Link2Off, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { apiFetch, getStoredUser } from '@/lib/api';

type Contact = { id: string; name?: string | null; pushName?: string | null; phone?: string | null; waId: string };
type Appointment = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  conversation?: { id: string; contact: Contact } | null;
  createdByUser?: { id: string; name: string } | null;
};
type CalendarStatus = { configured: boolean; connected: boolean; googleEmail: string | null };

function contactLabel(contact?: Contact | null) {
  if (!contact) return 'Sin conversación asociada';
  return contact.name || contact.pushName || contact.phone || contact.waId.split('@')[0] || 'Cliente';
}

export default function CalendarPage() {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [role, setRole] = useState('');

  const load = async () => {
    try {
      const [s, list] = await Promise.all([
        apiFetch<CalendarStatus>('/calendar/status'),
        apiFetch<Appointment[]>('/calendar/appointments'),
      ]);
      setStatus(s);
      setAppointments(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el calendario');
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    try { setRole(String(getStoredUser<{ role?: string }>().role || '')); } catch {}
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar_connected')) {
      setNotice('Google Calendar conectado correctamente.');
      window.history.replaceState({}, '', '/calendar');
    }
    if (params.get('calendar_error')) {
      setError('No se pudo conectar Google Calendar. Inténtalo de nuevo.');
      window.history.replaceState({}, '', '/calendar');
    }
  }, []);

  const canManage = role === 'OWNER' || role === 'ADMIN';

  const connect = async () => {
    setConnecting(true);
    setError('');
    try {
      const { url } = await apiFetch<{ url: string }>('/calendar/google/connect');
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la conexión con Google');
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('¿Desconectar Google Calendar? Las citas ya creadas seguirán en Google, pero dejarán de sincronizarse desde aquí.')) return;
    setDisconnecting(true);
    try {
      await apiFetch('/calendar/google/disconnect', { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desconectar');
    } finally {
      setDisconnecting(false);
    }
  };

  const cancelAppointment = async (id: string) => {
    if (!window.confirm('¿Cancelar esta cita? También se eliminará de Google Calendar.')) return;
    const previous = appointments;
    setAppointments((current) => current.filter((item) => item.id !== id));
    try {
      await apiFetch(`/calendar/appointments/${id}`, { method: 'DELETE' });
    } catch (err) {
      setAppointments(previous);
      setError(err instanceof Error ? err.message : 'No se pudo cancelar la cita');
    }
  };

  const now = Date.now();
  const upcoming = appointments.filter((a) => new Date(a.endAt).getTime() >= now);
  const past = appointments.filter((a) => new Date(a.endAt).getTime() < now).slice(0, 30);

  return (
    <AppShell title="Calendario" subtitle="Citas agendadas con clientes desde una conversación, sincronizadas con Google Calendar">
      {error && <div className="error-box">{error}</div>}
      {notice && <div className="success-box">{notice}</div>}

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <div>
            <h2>Conexión con Google</h2>
            <p>{status?.connected ? `Conectado como ${status.googleEmail || 'una cuenta de Google'}` : 'Sin conectar. Las citas no se crean en Google hasta conectar una cuenta.'}</p>
          </div>
          {status?.connected
            ? <span className="status-pill success"><span className="status-dot" />Conectado</span>
            : <span className="status-pill neutral"><span className="status-dot" />No conectado</span>}
        </div>
        <div className="card-body">
          {!status?.configured && (
            <div className="warning-box">Este servidor todavía no tiene configuradas las credenciales de Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). Pide a quien administra el despliegue que las agregue.</div>
          )}
          {canManage ? (
            status?.connected ? (
              <button className="button" disabled={disconnecting} onClick={() => void disconnect()}><Link2Off size={15} />{disconnecting ? 'Desconectando...' : 'Desconectar'}</button>
            ) : (
              <button className="button primary" disabled={!status?.configured || connecting} onClick={() => void connect()}><Link2 size={15} />{connecting ? 'Redirigiendo...' : 'Conectar con Google'}</button>
            )
          ) : (
            <p className="contact-empty-hint">Solo el propietario o un administrador puede conectar o desconectar el calendario.</p>
          )}
        </div>
      </section>

      <section className="table-card">
        <div className="card-header"><div><h2>Próximas citas</h2><p>Se agendan desde el botón &quot;Agendar cita&quot; dentro de una conversación.</p></div></div>
        <table>
          <thead><tr><th>Cliente</th><th>Título</th><th>Fecha</th><th>Lugar</th><th>Agendado por</th><th /></tr></thead>
          <tbody>
            {upcoming.map((a) => (
              <tr key={a.id}>
                <td>{contactLabel(a.conversation?.contact)}</td>
                <td><span className="row-main">{a.title}</span>{a.description && <span className="row-sub">{a.description}</span>}</td>
                <td>{new Date(a.startAt).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>{a.location || '—'}</td>
                <td>{a.createdByUser?.name || '—'}</td>
                <td><button className="icon-button" onClick={() => void cancelAppointment(a.id)} title="Cancelar cita"><Trash2 size={14} /></button></td>
              </tr>
            ))}
            {!upcoming.length && <tr><td colSpan={6}><p className="contact-empty-hint">No hay citas próximas.</p></td></tr>}
          </tbody>
        </table>
      </section>

      {!!past.length && (
        <section className="table-card" style={{ marginTop: 18 }}>
          <div className="card-header"><div><h2>Citas pasadas</h2></div></div>
          <table>
            <thead><tr><th>Cliente</th><th>Título</th><th>Fecha</th></tr></thead>
            <tbody>
              {past.map((a) => (
                <tr key={a.id}>
                  <td>{contactLabel(a.conversation?.contact)}</td>
                  <td>{a.title}</td>
                  <td>{new Date(a.startAt).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </AppShell>
  );
}
