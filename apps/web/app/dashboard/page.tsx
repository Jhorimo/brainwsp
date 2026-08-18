'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { Activity, Bot, Building2, CircleUserRound, Layers, MessagesSquare, Radio, Tag as TagIcon, UserRoundCheck, UserRoundX, UsersRound } from 'lucide-react';

type Stats = { connectedInstances: number; openConversations: number; unreadConversations: number; inboundToday: number; agents: number; aiActiveConversations: number; aiMessagesToday: number };
type RankedUser = { id: string; name: string; email: string; role: string; conversations: number };
type RankedGroup = { id: string; name: string; conversations: number };
type RankedTag = { id: string; name: string; color: string; contacts: number };
type Breakdown = { byUser: RankedUser[]; byDepartment: RankedGroup[]; byProject: RankedGroup[]; unassigned: number; byTag: RankedTag[] };
type PipelineStage = { id: string; name: string; color: string; count: number };
type PipelineDept = { id: string; name: string; stages: PipelineStage[]; noStage: number };

const roleNames: Record<string, string> = { OWNER: 'Propietario', ADMIN: 'Administrador', SUPERVISOR: 'Supervisor', AGENT: 'Agente' };

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
  const [stats, setStats] = useState<Stats>({ connectedInstances: 0, openConversations: 0, unreadConversations: 0, inboundToday: 0, agents: 0, aiActiveConversations: 0, aiMessagesToday: 0 });
  const [breakdown, setBreakdown] = useState<Breakdown>({ byUser: [], byDepartment: [], byProject: [], unassigned: 0, byTag: [] });
  const [pipeline, setPipeline] = useState<PipelineDept[]>([]);

  useEffect(() => { apiFetch<Stats>('/dashboard/stats').then(setStats).catch(() => undefined); }, []);
  useEffect(() => { apiFetch<Breakdown>('/dashboard/breakdown').then(setBreakdown).catch(() => undefined); }, []);
  useEffect(() => { apiFetch<PipelineDept[]>('/dashboard/pipeline').then(setPipeline).catch(() => undefined); }, []);

  const cards = [
    { label: 'WhatsApp conectados', value: stats.connectedInstances, meta: 'Instancias activas', icon: Radio },
    { label: 'Conversaciones abiertas', value: stats.openConversations, meta: 'Open + Pending', icon: MessagesSquare },
    { label: 'Sin leer', value: stats.unreadConversations, meta: 'Requieren atención', icon: Activity },
    { label: 'Mensajes recibidos hoy', value: stats.inboundToday, meta: 'Desde las 00:00', icon: CircleUserRound },
    { label: 'Agentes', value: stats.agents, meta: 'Usuarios activos', icon: UsersRound },
    { label: 'Con IA activa', value: stats.aiActiveConversations, meta: 'Conversaciones en piloto automático', icon: Bot },
    { label: 'Respuestas de IA hoy', value: stats.aiMessagesToday, meta: 'Mensajes que no tocó un humano', icon: Bot },
  ];

  const heights = [28, 44, 38, 62, 55, 78, 71, 88, 65, 82, 93, 76];

  return (
    <AppShell title="Dashboard" subtitle="Vista general de la operación de WhatsApp">
      <div className="grid-stats">
        {cards.map((item) => {
          const Icon = item.icon;
          return <div className="stat-card" key={item.label}><div className="stat-icon"><Icon size={19} /></div><div className="stat-label">{item.label}</div><div className="stat-value">{item.value}</div><div className="stat-meta">{item.meta}</div></div>;
        })}
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <div className="card-header"><div><h2>Actividad de conversaciones</h2><p>Visual del volumen operativo del canal</p></div><span className="status-pill success"><span className="status-dot" />Sistema activo</span></div>
          <div className="card-body"><div className="placeholder-chart">{heights.map((height, index) => <div className="chart-bar" key={index} style={{height: `${height}%`}} />)}</div></div>
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

      <div className="dashboard-grid-3">
        <section className="card">
          <div className="card-header"><div><h2>Atención por agente</h2><p>Clientes asignados a cada usuario</p></div></div>
          <RankList
            icon={UserRoundCheck}
            emptyLabel="Aún no hay agentes activos"
            highlight={{ label: 'Sin asignar', sub: 'Conversaciones que nadie ha tomado todavía', count: breakdown.unassigned }}
            items={breakdown.byUser.map((item) => ({ id: item.id, label: item.name, sub: `${item.email} · ${roleNames[item.role] || item.role}`, count: item.conversations }))}
          />
        </section>
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
      </div>
    </AppShell>
  );
}
