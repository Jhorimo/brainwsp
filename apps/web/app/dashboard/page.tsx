'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { Activity, CircleUserRound, MessagesSquare, Radio, UsersRound } from 'lucide-react';

type Stats = { connectedInstances: number; openConversations: number; unreadConversations: number; inboundToday: number; agents: number };

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ connectedInstances: 0, openConversations: 0, unreadConversations: 0, inboundToday: 0, agents: 0 });

  useEffect(() => { apiFetch<Stats>('/dashboard/stats').then(setStats).catch(() => undefined); }, []);

  const cards = [
    { label: 'WhatsApp conectados', value: stats.connectedInstances, meta: 'Instancias activas', icon: Radio },
    { label: 'Conversaciones abiertas', value: stats.openConversations, meta: 'Open + Pending', icon: MessagesSquare },
    { label: 'Sin leer', value: stats.unreadConversations, meta: 'Requieren atención', icon: Activity },
    { label: 'Mensajes recibidos hoy', value: stats.inboundToday, meta: 'Desde las 00:00', icon: CircleUserRound },
    { label: 'Agentes', value: stats.agents, meta: 'Usuarios activos', icon: UsersRound },
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
    </AppShell>
  );
}
