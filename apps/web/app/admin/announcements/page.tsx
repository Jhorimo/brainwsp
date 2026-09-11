'use client';

import { useEffect, useState } from 'react';
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
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={{ whiteSpace: 'pre-wrap', maxWidth: 480 }}>{item.text}</td>
                <td>{item.createdByUser?.name || '—'}</td>
                <td>{new Date(item.createdAt).toLocaleString('es-PE')}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={3}>Todavía no se ha publicado ningún anuncio.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
