'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Link2, Link2Off, MapPin, Trash2, X } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { apiFetch, getStoredUser } from '@/lib/api';

type Contact = { id: string; name?: string | null; pushName?: string | null; phone?: string | null; waId: string };
type TeamUser = { id: string; name: string; email: string; active: boolean };
type Appointment = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  conversation?: { id: string; contact: Contact } | null;
  createdByUser?: { id: string; name: string } | null;
  creatorEmail?: string | null;
  source: 'brainwsp' | 'google';
  cancellable: boolean;
};
type RawAppointment = Omit<Appointment, 'source' | 'cancellable' | 'creatorEmail'>;
type CalendarStatus = { configured: boolean; connected: boolean; googleEmail: string | null };
type Identity = { key: string; label: string; color: string };

// Validated categorical palette (dataviz skill, light-surface set) — fixed order, never
// cycled; identities past the 8th slot fold into the muted "otros" gray below.
const AGENT_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const FALLBACK_COLOR = '#748097';
const colorForIndex = (i: number) => (i < AGENT_PALETTE.length ? AGENT_PALETTE[i] : FALLBACK_COLOR);

const ROW_HEIGHT = 52; // px per hour
const DAY_LABELS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const MINI_DOW_LABELS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SÁ', 'DO'];

function contactLabel(contact?: Contact | null) {
  if (!contact) return 'Sin conversación asociada';
  return contact.name || contact.pushName || contact.phone || contact.waId.split('@')[0] || 'Cliente';
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatTimeRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  return `${new Date(start).toLocaleTimeString('es-PE', opts)} – ${new Date(end).toLocaleTimeString('es-PE', opts)}`;
}

// Which agent/organizer "owns" an event, for color + the legend toggle. BrainWSP
// appointments are keyed by their creator; external Google events are keyed by the
// organizer's email — unless that email happens to belong to a registered team member.
function identityKeyOf(ev: Appointment, emailToUserId: Map<string, string>) {
  if (ev.source === 'brainwsp') return ev.createdByUser ? `user:${ev.createdByUser.id}` : 'unknown';
  const email = ev.creatorEmail?.toLowerCase();
  if (email && emailToUserId.has(email)) return `user:${emailToUserId.get(email)}`;
  return email ? `email:${email}` : 'unknown';
}

// Greedy lane packing so overlapping appointments render side by side instead of on top
// of each other — not a perfect interval-graph coloring, close enough for a day's agenda.
function layoutDayEvents(events: Appointment[]) {
  const sorted = [...events].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const laneEndMs: number[] = [];
  const placed = sorted.map((ev) => {
    const startMs = new Date(ev.startAt).getTime();
    const endMs = new Date(ev.endAt).getTime();
    let lane = laneEndMs.findIndex((end) => end <= startMs);
    if (lane === -1) { lane = laneEndMs.length; laneEndMs.push(endMs); } else { laneEndMs[lane] = endMs; }
    return { ev, lane };
  });
  const laneCount = laneEndMs.length || 1;
  return placed.map((p) => ({ ...p, laneCount }));
}

export default function CalendarPage() {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [weekEvents, setWeekEvents] = useState<Appointment[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [role, setRole] = useState('');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [miniAnchor, setMiniAnchor] = useState(() => startOfWeek(new Date()));
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const loadShell = async () => {
    try {
      const [s, users] = await Promise.all([
        apiFetch<CalendarStatus>('/calendar/status'),
        apiFetch<TeamUser[]>('/team/users'),
      ]);
      setStatus(s);
      setTeamUsers(users.filter((u) => u.active));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el calendario');
    }
  };

  useEffect(() => { void loadShell(); }, []);

  // Refetches whenever the visible week changes, or once the connection status resolves —
  // connected companies get the full shared Google Calendar; otherwise just what's in our
  // own DB (appointments created before a disconnect, if any).
  useEffect(() => {
    if (!status) return;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const request = status.connected
      ? apiFetch<Appointment[]>(`/calendar/events?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`)
      : apiFetch<RawAppointment[]>('/calendar/appointments').then((list) => list
          .filter((a) => { const s = new Date(a.startAt); return s >= weekStart && s < weekEnd; })
          .map((a) => ({ ...a, creatorEmail: null, source: 'brainwsp' as const, cancellable: true })));
    request.then(setWeekEvents).catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar las citas de la semana'));
  }, [weekStart, status]);

  // The mini calendar follows the main grid's week when navigated from the toolbar, but its
  // own prev/next arrows can browse months independently without moving the selected week.
  useEffect(() => { setMiniAnchor(weekStart); }, [weekStart]);

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
      await loadShell();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desconectar');
    } finally {
      setDisconnecting(false);
    }
  };

  const cancelAppointment = async (id: string) => {
    if (!window.confirm('¿Cancelar esta cita? También se eliminará de Google Calendar.')) return;
    setCancelling(true);
    const previous = weekEvents;
    setWeekEvents((current) => current.filter((item) => item.id !== id));
    try {
      await apiFetch(`/calendar/appointments/${id}`, { method: 'DELETE' });
      setDetail(null);
    } catch (err) {
      setWeekEvents(previous);
      setError(err instanceof Error ? err.message : 'No se pudo cancelar la cita');
    } finally {
      setCancelling(false);
    }
  };

  const emailToUserId = useMemo(() => new Map(teamUsers.map((u) => [u.email.toLowerCase(), u.id])), [teamUsers]);

  // Identity roster for this week: registered agents keep a stable slot (fixed roster
  // order); external Google organizers not tied to a team member get their own slot,
  // discovered dynamically — this is what lets "otros vendedores" show up with their own
  // color, same as the reference calendar tools.
  const identities = useMemo(() => {
    const list: Identity[] = teamUsers.map((u, i) => ({ key: `user:${u.id}`, label: u.name, color: colorForIndex(i) }));
    const known = new Set(teamUsers.map((u) => u.email.toLowerCase()));
    const externalEmails = Array.from(new Set(
      weekEvents
        .filter((e) => e.source === 'google' && e.creatorEmail && !known.has(e.creatorEmail.toLowerCase()))
        .map((e) => e.creatorEmail!.toLowerCase())
    )).sort();
    externalEmails.forEach((email, i) => list.push({ key: `email:${email}`, label: email, color: colorForIndex(teamUsers.length + i) }));
    return list;
  }, [teamUsers, weekEvents]);

  const colorMap = useMemo(() => new Map(identities.map((i) => [i.key, i.color])), [identities]);
  const colorFor = (key: string) => colorMap.get(key) || FALLBACK_COLOR;

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  }), [weekStart]);

  const visibleEvents = useMemo(() =>
    weekEvents.filter((ev) => !hiddenKeys.has(identityKeyOf(ev, emailToUserId))),
  [weekEvents, hiddenKeys, emailToUserId]);

  const { rangeStartHour, rangeEndHour } = useMemo(() => {
    const startHours = visibleEvents.map((a) => new Date(a.startAt).getHours());
    const endHours = visibleEvents.map((a) => { const d = new Date(a.endAt); return d.getHours() + (d.getMinutes() > 0 ? 1 : 0); });
    return {
      rangeStartHour: Math.min(7, ...(startHours.length ? startHours : [7])),
      rangeEndHour: Math.max(21, ...(endHours.length ? endHours : [21])),
    };
  }, [visibleEvents]);

  const hours = useMemo(() => Array.from({ length: rangeEndHour - rangeStartHour }, (_, i) => rangeStartHour + i), [rangeStartHour, rangeEndHour]);
  const gridHeight = hours.length * ROW_HEIGHT;
  const pxPerMin = ROW_HEIGHT / 60;
  const rangeStartMin = rangeStartHour * 60;
  const rangeEndMin = rangeEndHour * 60;

  const eventsByDay = useMemo(() => weekDays.map((day) =>
    layoutDayEvents(visibleEvents.filter((a) => sameDay(new Date(a.startAt), day)))
  ), [weekDays, visibleEvents]);

  const monthLabel = useMemo(() => {
    const mid = new Date(weekStart);
    mid.setDate(mid.getDate() + 3);
    const label = mid.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [weekStart]);

  const shiftWeek = (deltaDays: number) => setWeekStart((current) => { const d = new Date(current); d.setDate(d.getDate() + deltaDays); return d; });
  const goToday = () => setWeekStart(startOfWeek(new Date()));
  const toggleIdentity = (key: string) => setHiddenKeys((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const shiftMiniMonth = (deltaMonths: number) => setMiniAnchor((current) => { const d = new Date(current); d.setMonth(d.getMonth() + deltaMonths); return d; });
  const pickDay = (day: Date) => setWeekStart(startOfWeek(day));

  const miniMonthLabel = useMemo(() => {
    const label = miniAnchor.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [miniAnchor]);

  const miniDays = useMemo(() => {
    const gridStart = startOfWeek(new Date(miniAnchor.getFullYear(), miniAnchor.getMonth(), 1));
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(d.getDate() + i); return d; });
  }, [miniAnchor]);

  const weekEnd = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); return d; }, [weekStart]);

  const today = now;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const teamIdentities = identities.filter((i) => i.key.startsWith('user:'));
  const externalIdentities = identities.filter((i) => i.key.startsWith('email:'));

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

      <section className="calendar-layout">
        <aside className="calendar-sidebar">
          <p className="calendar-sidebar-hint">Las citas se agendan desde el botón de calendario dentro de una conversación.</p>

          <div className="calendar-mini-month">
            <div className="calendar-mini-month-header">
              <strong>{miniMonthLabel}</strong>
              <div>
                <button className="icon-button" onClick={() => shiftMiniMonth(-1)} title="Mes anterior"><ChevronLeft size={14} /></button>
                <button className="icon-button" onClick={() => shiftMiniMonth(1)} title="Mes siguiente"><ChevronRight size={14} /></button>
              </div>
            </div>
            <div className="calendar-mini-grid">
              {MINI_DOW_LABELS.map((d) => <span className="calendar-mini-dow" key={d}>{d}</span>)}
              {miniDays.map((day) => (
                <button
                  key={day.toISOString()}
                  className={[
                    'calendar-mini-day',
                    sameDay(day, today) ? 'today' : '',
                    day >= weekStart && day < weekEnd ? 'in-week' : '',
                    day.getDay() === 1 ? 'week-edge-start' : '',
                    day.getDay() === 0 ? 'week-edge-end' : '',
                    day.getMonth() !== miniAnchor.getMonth() ? 'outside' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => pickDay(day)}
                >
                  {day.getDate()}
                </button>
              ))}
            </div>
          </div>

          {teamIdentities.length > 0 && (
            <div className="calendar-sidebar-section">
              <div className="calendar-sidebar-title">Equipo BrainWSP</div>
              {teamIdentities.map((identity) => (
                <label className="calendar-legend-row" key={identity.key} style={{ '--chip-color': identity.color } as React.CSSProperties}>
                  <input type="checkbox" checked={!hiddenKeys.has(identity.key)} onChange={() => toggleIdentity(identity.key)} />
                  <span className="calendar-legend-check" />
                  {identity.label}
                </label>
              ))}
            </div>
          )}

          {externalIdentities.length > 0 && (
            <div className="calendar-sidebar-section">
              <div className="calendar-sidebar-title" title="Agendados directo en Google Calendar, fuera de BrainWSP">Otros organizadores</div>
              {externalIdentities.map((identity) => (
                <label className="calendar-legend-row" key={identity.key} style={{ '--chip-color': identity.color } as React.CSSProperties}>
                  <input type="checkbox" checked={!hiddenKeys.has(identity.key)} onChange={() => toggleIdentity(identity.key)} />
                  <span className="calendar-legend-check" />
                  {identity.label}
                </label>
              ))}
            </div>
          )}
        </aside>

        <div className="calendar-main">
          <div className="calendar-toolbar">
            <div className="calendar-toolbar-nav">
              <button className="button small" onClick={goToday}>Hoy</button>
              <button className="icon-button" onClick={() => shiftWeek(-7)} title="Semana anterior"><ChevronLeft size={16} /></button>
              <button className="icon-button" onClick={() => shiftWeek(7)} title="Semana siguiente"><ChevronRight size={16} /></button>
              <strong className="calendar-toolbar-label">{monthLabel}</strong>
            </div>
          </div>

          <div className="calendar-week">
            <div className="calendar-week-header">
              <div className="calendar-time-col-header" />
              {weekDays.map((day) => (
                <div className={`calendar-day-header ${sameDay(day, today) ? 'today' : ''}`} key={day.toISOString()}>
                  <span>{DAY_LABELS[(day.getDay() + 6) % 7]}</span>
                  <strong>{day.getDate()}</strong>
                </div>
              ))}
            </div>
            <div className="calendar-week-body">
              <div className="calendar-time-col" style={{ height: gridHeight }}>
                {hours.map((h) => <div className="calendar-hour-label" style={{ height: ROW_HEIGHT }} key={h}>{formatHour(h)}</div>)}
              </div>
              {weekDays.map((day, dayIndex) => (
                <div className="calendar-day-col" style={{ height: gridHeight }} key={day.toISOString()}>
                  {hours.map((h) => <div className="calendar-hour-row" style={{ height: ROW_HEIGHT }} key={h} />)}
                  {sameDay(day, now) && nowMin >= rangeStartMin && nowMin <= rangeEndMin && (
                    <div className="calendar-now-line" style={{ top: (nowMin - rangeStartMin) * pxPerMin }}>
                      <span className="calendar-now-dot" />
                    </div>
                  )}
                  {eventsByDay[dayIndex].map(({ ev, lane, laneCount }) => {
                    const startMin = Math.min(Math.max((new Date(ev.startAt).getTime() - day.getTime()) / 60000, rangeStartMin), rangeEndMin);
                    const endMin = Math.min(Math.max((new Date(ev.endAt).getTime() - day.getTime()) / 60000, startMin + 15), rangeEndMin);
                    const color = colorFor(identityKeyOf(ev, emailToUserId));
                    return (
                      <button
                        className="calendar-event-chip"
                        key={ev.id}
                        onClick={() => setDetail(ev)}
                        title={`${ev.title} · ${formatTimeRange(ev.startAt, ev.endAt)}`}
                        style={{
                          top: (startMin - rangeStartMin) * pxPerMin,
                          height: Math.max((endMin - startMin) * pxPerMin, 40),
                          left: `calc(${(lane / laneCount) * 100}% + 2px)`,
                          width: `calc(${100 / laneCount}% - 4px)`,
                          background: `${color}1a`,
                          borderColor: `${color}55`,
                          color,
                        }}
                      >
                        <strong>{ev.title}</strong>
                        <span>{formatTimeRange(ev.startAt, ev.endAt)}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setDetail(null)}><X size={16} /></button>
            <div className="modal-header">
              <h2>{detail.title}</h2>
              <p>{formatTimeRange(detail.startAt, detail.endAt)}</p>
            </div>
            <div className="modal-body">
              {detail.source === 'brainwsp' ? (
                <>
                  <div className="contact-line"><span>Cliente</span><strong>{contactLabel(detail.conversation?.contact)}</strong></div>
                  <div className="contact-line"><span>Agendado por</span><strong>{detail.createdByUser?.name || '—'}</strong></div>
                </>
              ) : (
                <div className="contact-line"><span>Organizador</span><strong>{detail.creatorEmail || 'Desconocido'}</strong></div>
              )}
              {detail.location && <div className="contact-line"><span><MapPin size={12} style={{ verticalAlign: -2 }} /> Lugar</span><strong>{detail.location}</strong></div>}
              {detail.description && <p className="contact-empty-hint" style={{ marginTop: 10 }}>{detail.description}</p>}
              {!detail.cancellable && <p className="contact-empty-hint" style={{ marginTop: 10 }}>Este evento se creó directamente en Google Calendar y no se puede modificar desde BrainWSP.</p>}
            </div>
            {detail.cancellable && (
              <div className="modal-actions">
                <button className="button" disabled={cancelling} onClick={() => void cancelAppointment(detail.id)}><Trash2 size={14} />{cancelling ? 'Cancelando...' : 'Cancelar cita'}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
