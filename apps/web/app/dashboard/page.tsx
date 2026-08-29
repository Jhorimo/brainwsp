'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { Activity, AlertTriangle, Bot, Building2, CircleUserRound, Layers, MessagesSquare, QrCode, Radio, Send, Tag as TagIcon, UserPlus, UserRoundCheck, UserRoundX, UsersRound, Zap } from 'lucide-react';

type Stats = { connectedInstances: number; openConversations: number; unreadConversations: number; inboundInRange: number; outboundInRange: number; agents: number; aiActiveConversations: number; aiMessagesInRange: number };
type RankedUser = { id: string; name: string; email: string; role: string; conversations: number };
type RankedGroup = { id: string; name: string; conversations: number };
type RankedTag = { id: string; name: string; color: string; contacts: number };
type Breakdown = { byUser: RankedUser[]; byDepartment: RankedGroup[]; byProject: RankedGroup[]; unassigned: number; byTag: RankedTag[] };
type PipelineStage = { id: string; name: string; color: string; count: number };
type PipelineDept = { id: string; name: string; stages: PipelineStage[]; noStage: number };
type VolumeDay = { date: string; inbound: number; outbound: number; interactions: number };
type AgentPerf = { id: string; name: string; email: string; role: string; messagesSent: number; conversationsTouched: number };
type ContactsDay = { date: string; count: number };
type PlanUsage = {
  planName: string | null; mode: 'QR' | 'API'; licenseRenewsAt: string | null; daysUntilRenewal: number | null;
  maxMessages: number | null; messagesThisMonth: number; dailyBudget: number | null; messagesToday: number;
};

const roleNames: Record<string, string> = { OWNER: 'Propietario', ADMIN: 'Administrador', SUPERVISOR: 'Supervisor', AGENT: 'Agente' };
type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';
const presetLabels: Record<Preset, string> = { today: 'Hoy', yesterday: 'Ayer', '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', month: 'Este mes', custom: 'Personalizado' };

function toDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
// A day-only string like "2026-08-21" parsed with `new Date(...)` is read as UTC midnight,
// which lands on the wrong calendar day once shifted to the browser's local timezone —
// parse the components directly into a local-time Date instead.
function parseDateInputValue(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function formatShortDate(value: string) {
  return parseDateInputValue(value).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
}

// Picks a "nice" gridline step (1/2/5×10^n) so the y-axis reads 0/10/20/30 instead of an
// arbitrary max like 0/28 — same idea browsers/chart libs use for axis ticks.
function niceStep(roughStep: number) {
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, roughStep))));
  const norm = roughStep / magnitude;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * magnitude;
}

type ChartSeries = { key: string; label: string; color: string; fill?: boolean; points: Array<{ date: string; value: number }> };

// Coordinates are computed as PERCENTAGES up front and used for both the SVG path (fine to
// stretch — a curve stays a curve under any non-uniform scale) and plain HTML dots positioned
// via left/top (kept as fixed-size circles via CSS instead of SVG <circle> radii, which distort
// into ellipses under preserveAspectRatio "none"). Each point sits at the center of its own
// column, same as the div-based bar chart's columns, so dots line up with the date label below.
function seriesPath(points: ChartSeries['points'], chartMax: number) {
  const coords = points.map((p, i) => ({ x: ((i + 0.5) / points.length) * 100, y: 100 - (p.value / chartMax) * 100 }));
  if (coords.length < 2) return { line: '', area: '', coords };
  // Smooth curve: a cubic bezier per segment with control points at the segment's horizontal
  // midpoint — keeps the line monotonic between real values instead of overshooting them,
  // while still reading as a soft curve rather than straight joints.
  let line = `M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)} `;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const c0 = coords[i], c1 = coords[i + 1];
    const midX = (c0.x + c1.x) / 2;
    line += `C ${midX.toFixed(2)} ${c0.y.toFixed(2)}, ${midX.toFixed(2)} ${c1.y.toFixed(2)}, ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} `;
  }
  const area = `${line} L ${coords[coords.length - 1].x.toFixed(2)} 100 L ${coords[0].x.toFixed(2)} 100 Z`;
  return { line, area, coords };
}

function MultiLineChart({ series, formatLabel, hidden, onToggle }: {
  series: ChartSeries[];
  formatLabel: (date: string) => string;
  hidden: Set<string>;
  onToggle: (key: string) => void;
}) {
  const visible = series.filter((s) => !hidden.has(s.key));
  const axisPoints = series[0]?.points ?? [];
  const rawMax = Math.max(1, ...visible.flatMap((s) => s.points.map((p) => p.value)));
  const step = niceStep(rawMax / 3);
  const chartMax = Math.max(step, step * Math.ceil(rawMax / step));
  const gridLines = [0, step, step * 2, step * 3].filter((v) => v <= chartMax + 0.0001);
  const showEveryLabel = axisPoints.length <= 8;

  return (
    <div className="dashboard-linechart">
      <div className="dashboard-linechart-yaxis">{[...gridLines].reverse().map((v) => <span key={v}>{Math.round(v)}</span>)}</div>
      <div className="dashboard-linechart-body">
        <div className="dashboard-linechart-plot">
          <div className="dashboard-linechart-grid">
            {gridLines.map((v) => <div key={v} className="dashboard-linechart-gridline" style={{ bottom: `${(v / chartMax) * 100}%` }} />)}
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="dashboard-linechart-svg">
            {visible.map((s) => {
              const { line, area } = seriesPath(s.points, chartMax);
              return (
                <g key={s.key}>
                  {s.fill && <path d={area} fill={s.color} opacity={0.14} />}
                  <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
          </svg>
          {visible.map((s) => seriesPath(s.points, chartMax).coords.map((c, i) => (
            <div
              key={`${s.key}-${s.points[i].date}`}
              className="dashboard-linechart-dot"
              style={{ left: `${c.x}%`, top: `${c.y}%`, background: s.color }}
              title={`${s.label} · ${formatLabel(s.points[i].date)}: ${s.points[i].value}`}
            />
          )))}
        </div>
        <div className="dashboard-linechart-labels">
          {axisPoints.map((p, index) => (
            <span key={p.date}>{(showEveryLabel || index % Math.ceil(axisPoints.length / 8) === 0) ? formatLabel(p.date) : ''}</span>
          ))}
        </div>
      </div>
      <div className="dashboard-linechart-legend">
        {series.map((s) => (
          <button key={s.key} type="button" className={`dashboard-linechart-legend-item ${hidden.has(s.key) ? 'muted' : ''}`} onClick={() => onToggle(s.key)}>
            <span className="dashboard-linechart-legend-dot" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RankList({ icon: Icon, items, emptyLabel, subtitle, highlight }: { icon: typeof Building2; items: Array<{ id: string; label: string; sub?: string; count: number }>; emptyLabel: string; subtitle?: string; highlight?: { label: string; sub: string; count: number } }) {
  const max = Math.max(1, highlight?.count || 0, ...items.map((item) => item.count));
  return (
    <div className="card-body activity-list">
      {highlight && highlight.count > 0 && (
        <div className="activity-row rank-row unassigned-row">
          <div className="activity-icon warning"><UserRoundX size={16} /></div>
          <div className="activity-copy">
            <strong>{highlight.label}</strong>
            <span>{highlight.sub}</span>
            <div className="rank-bar"><div className="rank-bar-fill warning" style={{ width: `${(highlight.count / max) * 100}%` }} /></div>
          </div>
          <span className="rank-count warning">{highlight.count}</span>
        </div>
      )}
      {items.map((item) => (
        <div className="activity-row rank-row" key={item.id}>
          <div className="activity-icon"><Icon size={16} /></div>
          <div className="activity-copy">
            <strong>{item.label}</strong>
            <span>{item.sub || subtitle}</span>
            <div className="rank-bar"><div className="rank-bar-fill" style={{ width: `${(item.count / max) * 100}%` }} /></div>
          </div>
          <span className="rank-count">{item.count}</span>
        </div>
      ))}
      {!items.length && !highlight?.count && <div className="empty-state"><div><strong>{emptyLabel}</strong></div></div>}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ connectedInstances: 0, openConversations: 0, unreadConversations: 0, inboundInRange: 0, outboundInRange: 0, agents: 0, aiActiveConversations: 0, aiMessagesInRange: 0 });
  const [breakdown, setBreakdown] = useState<Breakdown>({ byUser: [], byDepartment: [], byProject: [], unassigned: 0, byTag: [] });
  const [pipeline, setPipeline] = useState<PipelineDept[]>([]);
  const [volume, setVolume] = useState<VolumeDay[]>([]);
  const [agentPerf, setAgentPerf] = useState<AgentPerf[]>([]);
  const [contactsNew, setContactsNew] = useState<ContactsDay[]>([]);
  const [hourly, setHourly] = useState<Array<{ hour: number; count: number }>>([]);
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const toggleSeries = (key: string) => setHiddenSeries((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const todayValue = useMemo(() => toDateInputValue(new Date()), []);
  const [fromDate, setFromDate] = useState(todayValue);
  const [toDate, setToDate] = useState(todayValue);
  const [preset, setPreset] = useState<Preset>('today');

  const applyPreset = (next: Preset) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    const end = new Date(today);
    if (next === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
    else if (next === '7d') { start.setDate(start.getDate() - 6); }
    else if (next === '30d') { start.setDate(start.getDate() - 29); }
    else if (next === 'month') { start.setDate(1); }
    setFromDate(toDateInputValue(start));
    setToDate(toDateInputValue(end));
    setPreset(next);
  };

  // `to` is sent as an EXCLUSIVE upper bound (start of the day after the picked "hasta"
  // date) so a single-day range still covers that whole day instead of matching nothing.
  const rangeParams = useMemo(() => {
    const start = parseDateInputValue(fromDate);
    const end = parseDateInputValue(toDate);
    end.setDate(end.getDate() + 1);
    return new URLSearchParams({
      from: start.toISOString(),
      to: end.toISOString(),
      tzOffsetMinutes: String(new Date().getTimezoneOffset()),
    });
  }, [fromDate, toDate]);

  useEffect(() => { apiFetch<Stats>(`/dashboard/stats?${rangeParams}`).then(setStats).catch(() => undefined); }, [rangeParams]);
  useEffect(() => { apiFetch<VolumeDay[]>(`/dashboard/message-volume?${rangeParams}`).then(setVolume).catch(() => undefined); }, [rangeParams]);
  useEffect(() => { apiFetch<AgentPerf[]>(`/dashboard/agent-performance?${rangeParams}`).then(setAgentPerf).catch(() => undefined); }, [rangeParams]);
  useEffect(() => { apiFetch<Breakdown>('/dashboard/breakdown').then(setBreakdown).catch(() => undefined); }, []);
  useEffect(() => { apiFetch<PipelineDept[]>('/dashboard/pipeline').then(setPipeline).catch(() => undefined); }, []);
  useEffect(() => { apiFetch<ContactsDay[]>(`/dashboard/contacts-new?${rangeParams}`).then(setContactsNew).catch(() => undefined); }, [rangeParams]);
  useEffect(() => { apiFetch<Array<{ hour: number; count: number }>>(`/dashboard/hourly-distribution?${rangeParams}`).then(setHourly).catch(() => undefined); }, [rangeParams]);
  useEffect(() => { apiFetch<PlanUsage>('/dashboard/plan-usage').then(setPlanUsage).catch(() => undefined); }, []);

  const rangeLabel = preset === 'custom'
    ? (fromDate === toDate ? formatShortDate(fromDate) : `${formatShortDate(fromDate)} – ${formatShortDate(toDate)}`)
    : presetLabels[preset];

  const cards = [
    { label: 'WhatsApp conectados', value: stats.connectedInstances, meta: 'Instancias activas', icon: Radio },
    { label: 'Conversaciones abiertas', value: stats.openConversations, meta: 'Open + Pending', icon: MessagesSquare },
    { label: 'Sin leer', value: stats.unreadConversations, meta: 'Requieren atención', icon: Activity },
    { label: 'Mensajes recibidos', value: stats.inboundInRange, meta: rangeLabel, icon: CircleUserRound },
    { label: 'Mensajes enviados', value: stats.outboundInRange, meta: rangeLabel, icon: Send },
    { label: 'Agentes', value: stats.agents, meta: 'Usuarios activos', icon: UsersRound },
    { label: 'Con IA activa', value: stats.aiActiveConversations, meta: 'Conversaciones en piloto automático', icon: Bot },
    { label: 'Respuestas de IA', value: stats.aiMessagesInRange, meta: rangeLabel, icon: Bot },
  ];

  const maxVolume = Math.max(1, ...volume.map((day) => Math.max(day.inbound, day.outbound)));
  const showEveryLabel = volume.length <= 10;

  // "Volumen" queda como la serie rellena (fill) — es casi siempre la más grande de las tres
  // (varios mensajes por conversación), igual que la referencia rellena su métrica "Total".
  const activityChartSeries: ChartSeries[] = [
    { key: 'volume', label: 'Volumen de Mensajes', color: '#2563eb', fill: true, points: volume.map((day) => ({ date: day.date, value: day.inbound + day.outbound })) },
    { key: 'interactions', label: 'Interacciones Totales', color: '#d97706', points: volume.map((day) => ({ date: day.date, value: day.interactions })) },
    { key: 'contacts', label: 'Nuevos Contactos', color: '#168a55', points: contactsNew.map((day) => ({ date: day.date, value: day.count })) },
  ];
  const totalContacts = contactsNew.reduce((sum, day) => sum + day.count, 0);
  const totalInteractions = volume.reduce((sum, day) => sum + day.inbound + day.outbound, 0);
  const avgDaily = volume.length ? Math.round((totalInteractions / volume.length) * 10) / 10 : 0;

  const maxHourly = Math.max(1, ...hourly.map((h) => h.count));
  const planUrgent = planUsage?.daysUntilRenewal !== null && planUsage?.daysUntilRenewal !== undefined && planUsage.daysUntilRenewal <= 7;

  return (
    <AppShell
      title="Dashboard"
      subtitle="Vista general de la operación de WhatsApp"
      actions={<Link href="/instances" className="button primary small"><QrCode size={15} />Gestionar QR</Link>}
    >
      {planUsage && planUrgent && (
        <div className="plan-alert-banner">
          <div className="plan-alert-icon"><AlertTriangle size={18} /></div>
          <div className="plan-alert-copy">
            <strong>Tu plan vence pronto</strong>
            <span>{planUsage.daysUntilRenewal === 0 ? 'Tu plan vence hoy' : planUsage.daysUntilRenewal === 1 ? 'Tu plan vence mañana' : `Tu plan vence en ${planUsage.daysUntilRenewal} días`}</span>
          </div>
          <a className="button danger small" href={`mailto:braintech.2022@gmail.com?subject=${encodeURIComponent('Renovación de plan')}`}>Renovar</a>
        </div>
      )}

      {planUsage && (
        <section className="card plan-usage-card">
          <div className="card-header">
            <div>
              <span className="plan-usage-badge">Uso del plan {planUsage.planName || 'sin asignar'}</span>
              <p>Modo {planUsage.mode === 'QR' ? '📱 QR' : '🔌 API'} {planUsage.licenseRenewsAt && <> · Expira {new Date(planUsage.licenseRenewsAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}</>}</p>
            </div>
            <span className="status-pill success"><span className="status-dot" />Live</span>
          </div>
          <div className="plan-usage-bars">
            <div className="plan-usage-bar-block">
              <div className="plan-usage-bar-head"><span>Mensajes mensuales</span><span>{planUsage.maxMessages ? Math.min(100, Math.round((planUsage.messagesThisMonth / planUsage.maxMessages) * 100)) : 0}%</span></div>
              <div className="plan-usage-bar-track"><div className="plan-usage-bar-fill" style={{ width: `${planUsage.maxMessages ? Math.min(100, (planUsage.messagesThisMonth / planUsage.maxMessages) * 100) : 0}%` }} /></div>
              <div className="plan-usage-bar-foot"><strong>{planUsage.messagesThisMonth.toLocaleString('es-PE')}</strong> / {planUsage.maxMessages ? planUsage.maxMessages.toLocaleString('es-PE') : '∞'}<span>{planUsage.maxMessages ? `${Math.max(0, planUsage.maxMessages - planUsage.messagesThisMonth).toLocaleString('es-PE')} rest.` : 'sin límite'}</span></div>
            </div>
            <div className="plan-usage-bar-block">
              <div className="plan-usage-bar-head"><span>Actividad de hoy</span><span>{planUsage.dailyBudget ? Math.min(100, Math.round((planUsage.messagesToday / planUsage.dailyBudget) * 100)) : 0}%</span></div>
              <div className="plan-usage-bar-track"><div className="plan-usage-bar-fill accent" style={{ width: `${planUsage.dailyBudget ? Math.min(100, (planUsage.messagesToday / planUsage.dailyBudget) * 100) : 0}%` }} /></div>
              <div className="plan-usage-bar-foot"><strong>{planUsage.messagesToday.toLocaleString('es-PE')}</strong> / {planUsage.dailyBudget ? planUsage.dailyBudget.toLocaleString('es-PE') : '∞'}<span>{planUsage.dailyBudget ? `${Math.max(0, planUsage.dailyBudget - planUsage.messagesToday).toLocaleString('es-PE')} rest.` : 'sin límite'}</span></div>
            </div>
          </div>
        </section>
      )}

      <div className="dashboard-range-bar">
        <div className="dashboard-range-presets">
          {(['today', 'yesterday', '7d', '30d', 'month'] as Preset[]).map((item) => (
            <button key={item} className={`chat-quick-tab ${preset === item ? 'active' : ''}`} onClick={() => applyPreset(item)}>{presetLabels[item]}</button>
          ))}
        </div>
        <div className="dashboard-range-custom">
          <input type="date" value={fromDate} max={toDate} onChange={(e) => { setFromDate(e.target.value); setPreset('custom'); }} />
          <span>–</span>
          <input type="date" value={toDate} min={fromDate} max={todayValue} onChange={(e) => { setToDate(e.target.value); setPreset('custom'); }} />
        </div>
      </div>

      <div className="grid-stats">
        {cards.map((item) => {
          const Icon = item.icon;
          return <div className="stat-card" key={item.label}><div className="stat-icon"><Icon size={19} /></div><div className="stat-label">{item.label}</div><div className="stat-value">{item.value}</div><div className="stat-meta">{item.meta}</div></div>;
        })}
      </div>

      <section className="card dashboard-stats-card">
        <div className="card-header"><div><h2>Estadísticas</h2><p>Por día — {rangeLabel.toLowerCase()}</p></div></div>
        <div className="dashboard-stats-body">
          <div className="dashboard-stats-chart">
            {activityChartSeries.some((s) => s.points.some((point) => point.value > 0)) ? (
              <MultiLineChart series={activityChartSeries} formatLabel={formatShortDate} hidden={hiddenSeries} onToggle={toggleSeries} />
            ) : <div className="empty-state"><div><strong>Sin datos en este periodo</strong></div></div>}
          </div>
          <div className="dashboard-stats-summary">
            <span className="dashboard-stats-summary-title">Resumen del período</span>
            <div className="dashboard-stats-summary-card">
              <div className="dashboard-stats-summary-icon contacts"><UserPlus size={16} /></div>
              <span>Contactos</span>
              <strong>{totalContacts}</strong>
            </div>
            <div className="dashboard-stats-summary-card">
              <div className="dashboard-stats-summary-icon interactions"><Zap size={16} /></div>
              <span>Interacciones</span>
              <strong>{totalInteractions}</strong>
            </div>
            <div className="dashboard-stats-summary-card">
              <div className="dashboard-stats-summary-icon average"><Activity size={16} /></div>
              <span>Promedio Diario</span>
              <strong>{avgDaily}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header"><div><h2>Distribución Horaria</h2><p>Actividad por hora del día — {rangeLabel.toLowerCase()}</p></div></div>
        <div className="card-body">
          {hourly.some((h) => h.count > 0) ? (
            <div className="dashboard-hourly-chart">
              {hourly.map((h) => (
                <div className="dashboard-hourly-col" key={h.hour}>
                  <div className="chart-bar-wrap">
                    <div className="chart-tooltip">{String(h.hour).padStart(2, '0')}:00<strong>{h.count}</strong></div>
                    <div className="dashboard-hourly-bar" style={{ height: `${(h.count / maxHourly) * 100}%` }} />
                  </div>
                  {h.hour % 2 === 0 && <span className="activity-chart-label">{String(h.hour).padStart(2, '0')}:00</span>}
                </div>
              ))}
            </div>
          ) : <div className="empty-state"><div><strong>Sin mensajes en este periodo</strong></div></div>}
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="card">
          <div className="card-header"><div><h2>Actividad de mensajes</h2><p>Recibidos vs. enviados por día — {rangeLabel.toLowerCase()}</p></div><span className="status-pill success"><span className="status-dot" />Sistema activo</span></div>
          <div className="card-body">
            {volume.length > 0 ? (
              <>
                <div className="activity-chart">
                  {volume.map((day, index) => (
                    <div className="activity-chart-col" key={day.date}>
                      <div className="activity-chart-bars">
                        <div className="chart-bar-wrap">
                          <div className="chart-tooltip">Recibidos · {formatShortDate(day.date)}<strong>{day.inbound}</strong></div>
                          <div className="activity-chart-bar inbound" style={{ height: `${(day.inbound / maxVolume) * 100}%` }} />
                        </div>
                        <div className="chart-bar-wrap">
                          <div className="chart-tooltip">Enviados · {formatShortDate(day.date)}<strong>{day.outbound}</strong></div>
                          <div className="activity-chart-bar outbound" style={{ height: `${(day.outbound / maxVolume) * 100}%` }} />
                        </div>
                      </div>
                      {(showEveryLabel || index % Math.ceil(volume.length / 8) === 0) && (
                        <span className="activity-chart-label">{formatShortDate(day.date)}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="activity-chart-legend">
                  <span className="activity-chart-legend-item"><span className="activity-chart-legend-dot inbound" />Recibidos</span>
                  <span className="activity-chart-legend-item"><span className="activity-chart-legend-dot outbound" />Enviados</span>
                </div>
              </>
            ) : <div className="empty-state"><div><strong>Sin mensajes en este periodo</strong></div></div>}
          </div>
        </section>
        <section className="card">
          <div className="card-header"><div><h2>Arquitectura activa</h2><p>Servicios principales del MVP</p></div></div>
          <div className="card-body activity-list">
            {[
              ['API Gateway', 'NestJS · APP KEY / AUTH KEY'],
              ['WhatsApp Worker', 'Baileys · Session Manager'],
              ['Message Queue', 'BullMQ · Redis'],
              ['Realtime', 'Socket.IO · Redis Pub/Sub'],
              ['Persistencia', 'PostgreSQL · Prisma'],
            ].map(([name, detail]) => <div className="activity-row" key={name}><div className="activity-icon"><Activity size={16} /></div><div className="activity-copy"><strong>{name}</strong><span>{detail}</span></div><span className="activity-time">Ready</span></div>)}
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <div className="card-header"><div><h2>Pipeline por departamento</h2><p>Dónde se está atascando cada área — solo conversaciones abiertas</p></div></div>
          <div className="card-body">
            {pipeline.map((department) => {
              const total = department.stages.reduce((sum, stage) => sum + stage.count, 0) + department.noStage;
              return (
                <div className="pipeline-dept" key={department.id}>
                  <div className="pipeline-dept-head"><strong>{department.name}</strong><span>{total} conversación(es) abierta(s)</span></div>
                  {total > 0 ? (
                    <>
                      <div className="pipeline-bar">
                        {department.stages.filter((stage) => stage.count > 0).map((stage) => (
                          <div key={stage.id} className="pipeline-bar-seg" style={{ width: `${(stage.count / total) * 100}%`, background: stage.color }} title={`${stage.name}: ${stage.count}`} />
                        ))}
                        {department.noStage > 0 && <div className="pipeline-bar-seg" style={{ width: `${(department.noStage / total) * 100}%`, background: '#dde1ea' }} title={`Sin etapa: ${department.noStage}`} />}
                      </div>
                      <div className="pipeline-legend">
                        {department.stages.filter((stage) => stage.count > 0).map((stage) => (
                          <span className="pipeline-legend-item" key={stage.id}><span className="pipeline-legend-dot" style={{ background: stage.color }} />{stage.name} · {stage.count}</span>
                        ))}
                        {department.noStage > 0 && <span className="pipeline-legend-item muted"><span className="pipeline-legend-dot" style={{ background: '#dde1ea' }} />Sin etapa · {department.noStage}</span>}
                      </div>
                    </>
                  ) : <p className="contact-empty-hint">Sin conversaciones abiertas en este departamento.</p>}
                </div>
              );
            })}
            {!pipeline.length && <div className="empty-state"><div><strong>Aún no hay pipelines configurados</strong>Crea etapas por departamento desde Equipo y agentes.</div></div>}
          </div>
        </section>
        <section className="card">
          <div className="card-header"><div><h2>Etiquetas</h2><p>Contactos marcados con cada etiqueta</p></div></div>
          <RankList
            icon={TagIcon}
            emptyLabel="Aún no hay etiquetas en uso"
            subtitle="Etiqueta"
            items={breakdown.byTag.map((tag) => ({ id: tag.id, label: tag.name, count: tag.contacts }))}
          />
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <div className="card-header"><div><h2>Mensajes por agente</h2><p>Control de personal — quién está atendiendo, {rangeLabel.toLowerCase()}</p></div></div>
          <RankList
            icon={UserRoundCheck}
            emptyLabel="Nadie envió mensajes en este periodo"
            items={agentPerf.filter((item) => item.messagesSent > 0).map((item) => ({ id: item.id, label: item.name, sub: `${item.conversationsTouched} conversación(es) · ${roleNames[item.role] || item.role}`, count: item.messagesSent }))}
          />
        </section>
        <section className="card">
          <div className="card-header"><div><h2>Atención por agente</h2><p>Clientes asignados a cada usuario (total histórico)</p></div></div>
          <RankList
            icon={UserRoundCheck}
            emptyLabel="Aún no hay agentes activos"
            highlight={{ label: 'Sin asignar', sub: 'Conversaciones que nadie ha tomado todavía', count: breakdown.unassigned }}
            items={breakdown.byUser.map((item) => ({ id: item.id, label: item.name, sub: `${item.email} · ${roleNames[item.role] || item.role}`, count: item.conversations }))}
          />
        </section>
      </div>

      <div className="dashboard-grid-3">
        <section className="card">
          <div className="card-header"><div><h2>Por departamento</h2><p>Conversaciones transferidas a cada área</p></div></div>
          <RankList
            icon={Building2}
            emptyLabel="Aún no hay departamentos"
            subtitle="Departamento"
            items={breakdown.byDepartment.map((item) => ({ id: item.id, label: item.name, count: item.conversations }))}
          />
        </section>
        <section className="card">
          <div className="card-header"><div><h2>Por proyecto</h2><p>De qué producto hablan los clientes</p></div></div>
          <RankList
            icon={Layers}
            emptyLabel="Aún no hay proyectos"
            subtitle="Proyecto"
            items={breakdown.byProject.map((item) => ({ id: item.id, label: item.name, count: item.conversations }))}
          />
        </section>
        <section className="card">
          <div className="card-header"><div><h2>Resumen del periodo</h2><p>{rangeLabel}</p></div></div>
          <div className="card-body activity-list">
            <div className="activity-row"><div className="activity-icon"><CircleUserRound size={16} /></div><div className="activity-copy"><strong>Mensajes recibidos</strong><span>Volumen entrante — clave para medir campañas de ads</span></div><span className="activity-time">{stats.inboundInRange}</span></div>
            <div className="activity-row"><div className="activity-icon"><Send size={16} /></div><div className="activity-copy"><strong>Mensajes enviados</strong><span>Total saliente — humanos + IA + API</span></div><span className="activity-time">{stats.outboundInRange}</span></div>
            <div className="activity-row"><div className="activity-icon"><Bot size={16} /></div><div className="activity-copy"><strong>Respondidos por IA</strong><span>Mensajes que no tocó un humano</span></div><span className="activity-time">{stats.aiMessagesInRange}</span></div>
            <div className="activity-row"><div className="activity-icon"><UserRoundCheck size={16} /></div><div className="activity-copy"><strong>Agentes con actividad</strong><span>Enviaron al menos un mensaje</span></div><span className="activity-time">{agentPerf.filter((item) => item.messagesSent > 0).length}</span></div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
