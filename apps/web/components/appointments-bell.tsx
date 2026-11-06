'use client';

import { Bell, Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

type TodayAppointment = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  attendedAt: string | null;
  conversation: { id: string; contact: { name: string | null; pushName: string | null; phone: string | null } | null } | null;
};

const REFRESH_MS = 60_000;
const TICK_MS = 15_000;

function contactName(a: TodayAppointment) {
  const c = a.conversation?.contact;
  return c?.name || c?.pushName || c?.phone || '';
}

function statusOf(a: TodayAppointment, now: number) {
  if (a.attendedAt) return { label: 'Asistió', late: false };
  const diffMin = Math.round((new Date(a.startAt).getTime() - now) / 60_000);
  if (diffMin > 0) return { label: `en ${diffMin} min`, late: false };
  if (diffMin === 0) return { label: 'ahora', late: true };
  return { label: `atrasada ${-diffMin} min`, late: true };
}

// Campana del topbar: citas de hoy que agendó el usuario. El número son las pendientes
// (sin check); parpadea fuerte si alguna ya empezó y nadie marcó que asistió.
export function AppointmentsBell() {
  const [items, setItems] = useState<TodayAppointment[]>([]);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    apiFetch<TodayAppointment[]>('/calendar/appointments/today').then(setItems).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const refresh = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => { clearInterval(refresh); clearInterval(tick); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, load]);

  const toggleAttended = async (a: TodayAppointment) => {
    const attended = !a.attendedAt;
    const previous = items;
    setItems((list) => list.map((x) => (x.id === a.id ? { ...x, attendedAt: attended ? new Date().toISOString() : null } : x)));
    try {
      await apiFetch(`/calendar/appointments/${a.id}/attended`, { method: 'PATCH', body: JSON.stringify({ attended }) });
    } catch {
      setItems(previous);
    }
  };

  const pending = items.filter((a) => !a.attendedAt);
  const anyLate = pending.some((a) => new Date(a.startAt).getTime() <= now);
  const sorted = [...pending, ...items.filter((a) => a.attendedAt)];

  return (
    <div className="appt-bell-wrap" ref={wrapRef}>
      <button
        className={`icon-button appt-bell${anyLate ? ' appt-bell-late' : ''}`}
        type="button"
        aria-label={`Citas de hoy: ${pending.length} pendientes`}
        title={anyLate ? 'Tienes una cita que ya empezó sin marcar' : 'Citas de hoy'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={19} />
        {pending.length > 0 && <span className="appt-bell-badge">{pending.length}</span>}
      </button>
      {open && (
        <div className="appt-bell-panel" role="dialog" aria-label="Citas de hoy">
          <div className="appt-bell-head">Citas de hoy</div>
          {sorted.length === 0 ? (
            <div className="appt-bell-empty">No tienes citas hoy</div>
          ) : (
            <ul className="appt-bell-list">
              {sorted.map((a) => {
                const st = statusOf(a, now);
                const time = new Date(a.startAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
                const who = contactName(a);
                return (
                  <li key={a.id} className={`appt-bell-item${a.attendedAt ? ' done' : ''}${st.late ? ' late' : ''}`}>
                    <button
                      type="button"
                      className={`appt-bell-check${a.attendedAt ? ' on' : ''}`}
                      aria-label={a.attendedAt ? 'Quitar check de asistió' : 'Marcar que asistió'}
                      title={a.attendedAt ? 'Quitar check' : 'Marcar que asistió'}
                      onClick={() => toggleAttended(a)}
                    >
                      {a.attendedAt && <Check size={14} />}
                    </button>
                    <a
                      className="appt-bell-info"
                      href={a.conversation ? `/conversations?id=${a.conversation.id}` : undefined}
                      onClick={() => setOpen(false)}
                    >
                      <span className="appt-bell-time">{time}</span>
                      <span className="appt-bell-title">{a.title}</span>
                      {who && <span className="appt-bell-who">{who}</span>}
                    </a>
                    <span className="appt-bell-status">{st.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
