'use client';

import { useEffect, useState } from 'react';
import { Eye, Megaphone, X } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api';

type Announcement = {
  id: string;
  text: string;
  createdAt: string;
  createdByUser: { id: string; name: string } | null;
};

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // Solo vista previa: a diferencia del popup real (AnnouncementsProvider), esto no
  // fuerza nada — el superadmin no recibe anuncios, solo puede ver como se verian.
  const [previewing, setPreviewing] = useState<Announcement | null>(null);

  const load = () => {
    apiFetch<(Announcement & { read: boolean })[]>('/announcements')
      .then((data) => setItems(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los anuncios'));
  };

  useEffect(() => { load(); }, []);

  const publish = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setError('');
    try {
      await apiFetch('/announcements', { method: 'POST', body: JSON.stringify({ text: trimmed }) });
      setText('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar el anuncio');
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminShell title="Anuncios" subtitle="Se muestran a todos los usuarios del sistema al ingresar o recargar la app, hasta que los marcan como leídos">
      {error && <div className="error-box">{error}</div>}
      <section className="table-card" style={{ padding: 20 }}>
        <div className="field">
          <label>Nuevo anuncio</label>
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe el mensaje que verán todos los usuarios..."
          />
        </div>
        <div className="modal-actions" style={{ padding: '12px 0 0', border: 0, justifyContent: 'flex-start' }}>
          <button type="button" className="button primary" disabled={sending || !text.trim()} onClick={publish}>
            {sending ? 'Publicando...' : 'Publicar anuncio'}
          </button>
        </div>
      </section>

      <section className="table-card">
        <table>
          <thead>
            <tr>
              <th>Mensaje</th>
              <th>Publicado por</th>
              <th>Fecha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={{ whiteSpace: 'pre-wrap', maxWidth: 480 }}>{item.text}</td>
                <td>{item.createdByUser?.name || '—'}</td>
                <td>{new Date(item.createdAt).toLocaleString('es-PE')}</td>
                <td>
                  <button type="button" className="icon-button" onClick={() => setPreviewing(item)} aria-label="Ver anuncio" title="Ver cómo lo ven los usuarios">
                    <Eye size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4}>Todavía no se ha publicado ningún anuncio.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {previewing && (
        <div className="modal-backdrop" onClick={() => setPreviewing(null)}>
          <div className="modal announcement-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setPreviewing(null)} aria-label="Cerrar">
              <X size={15} />
            </button>
            <div className="announcement-modal-icon"><Megaphone size={18} /></div>
            <div className="modal-header">
              <h2>Anuncio</h2>
            </div>
            <div className="modal-body">
              <div className="announcement-text">{previewing.text}</div>
              <div className="announcement-meta">
                {previewing.createdByUser?.name || 'Brain Tech'} · {new Date(previewing.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
