'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Eye, LayoutTemplate } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import type { FlowFolder, FlowInstance } from '../types';
import { FLOW_TEMPLATES, type FlowTemplate } from './data';
import { TemplatePreviewModal } from './template-preview-modal';
import { UseTemplateModal } from './use-template-modal';

const CATEGORIES = ['Todas', 'Ventas'] as const;

export default function TemplateGalleryPage() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Todas');
  const [instances, setInstances] = useState<FlowInstance[]>([]);
  const [folders, setFolders] = useState<FlowFolder[]>([]);
  const [previewTemplate, setPreviewTemplate] = useState<FlowTemplate | null>(null);
  const [useTemplate, setUseTemplate] = useState<FlowTemplate | null>(null);

  useEffect(() => {
    apiFetch<FlowInstance[]>('/instances').then(setInstances).catch(() => undefined);
    apiFetch<FlowFolder[]>('/automations/folders').then(setFolders).catch(() => undefined);
  }, []);

  const templates = category === 'Todas' ? FLOW_TEMPLATES : FLOW_TEMPLATES.filter((t) => t.category === category);

  return (
    <AppShell title="Galería de Plantillas" subtitle="Empieza rápido con flujos pre-configurados para tu industria">
      <div className="template-gallery-toolbar">
        <div className="template-gallery-tabs">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={`chat-quick-tab ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
        <Link href="/automations" className="button small info"><ArrowLeft size={14} /> Mis automatizaciones</Link>
      </div>

      <div className="template-grid">
        {templates.map((template) => (
          <div className="template-card" key={template.id}>
            <div className="template-card-head">
              <span className="template-card-icon">{template.icon}</span>
              <div>
                <span className="template-card-category">{template.category.toUpperCase()}</span>
                <span className="template-card-official">Plantilla oficial</span>
              </div>
            </div>
            <strong className="template-card-title">{template.name}</strong>
            <p className="template-card-desc">{template.description}</p>
            <div className="template-card-foot">
              <button type="button" className="button primary small" style={{ flex: 1 }} onClick={() => setUseTemplate(template)}>Usar plantilla</button>
              <button type="button" className="icon-button ghost small" title="Vista previa" onClick={() => setPreviewTemplate(template)}><Eye size={15} /></button>
            </div>
          </div>
        ))}
        {!templates.length && (
          <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
            <div>
              <LayoutTemplate size={28} style={{ color: 'var(--muted)' }} />
              <strong>No hay plantillas en esta categoría todavía</strong>
            </div>
          </div>
        )}
      </div>

      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          onUse={() => { setUseTemplate(previewTemplate); setPreviewTemplate(null); }}
        />
      )}

      {useTemplate && (
        <UseTemplateModal
          template={useTemplate}
          instances={instances}
          folders={folders}
          onFolderCreated={(folder) => setFolders((current) => [...current, folder].sort((a, b) => a.name.localeCompare(b.name)))}
          onClose={() => setUseTemplate(null)}
        />
      )}
    </AppShell>
  );
}
