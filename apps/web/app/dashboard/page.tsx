'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { Activity, Bot, Building2, CircleUserRound, Layers, MessagesSquare, Radio, Send, Tag as TagIcon, UserRoundCheck, UserRoundX, UsersRound } from 'lucide-react';

type Stats = { connectedInstances: number; openConversations: number; unreadConversations: number; inboundInRange: number; outboundInRange: number; agents: number; aiActiveConversations: number; aiMessagesInRange: number };
type RankedUser = { id: string; name: string; email: string; role: string; conversations: number };
type RankedGroup = { id: string; name: string; conversations: number };
type RankedTag = { id: string; name: string; color: string; contacts: number };
type Breakdown = { byUser: RankedUser[]; byDepartment: RankedGroup[]; byProject: RankedGroup[]; unassigned: number; byTag: RankedTag[] };
type PipelineStage = { id: string; name: string; color: string; count: number };
type PipelineDept = { id: string; name: string; stages: PipelineStage[]; noStage: number };
type VolumeDay = { date: string; inbound: number; outbound: number };
type AgentPerf = { id: string; name: string; email: string; role: string; messagesSent: number; conversationsTouched: number };

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

  return (
    <AppShell title="Dashboard" subtitle="Vista general de la operación de WhatsApp">
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
