'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, Megaphone, MoreVertical, Pencil, Trash2, X } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { useConfirm } from '@/components/confirm-provider';
import { apiFetch } from '@/lib/api';

type Announcement = {
  id: string;
  text: string;
  createdAt: string;
  createdByUser: { id: string; name: string } | null;
};

const MENU_WIDTH = 200;
const MENU_HEIGHT = 140;

export default function AdminAnnouncementsPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<Announcement[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // Solo vista previa: a diferencia del popup real (AnnouncementsProvider), esto no
  // fuerza nada — el superadmin no recibe anuncios, solo puede ver como se verian.
  const [previewing, setPreviewing] = useState<Announcement | null>(null);
  // Menú de acciones (⋮) por fila. Es flotante (position: fixed) y no un desplegable dentro de
  // la tabla porque .table-card recorta lo que se sale de ella y taparía las últimas filas.
  const [menu, setMenu] = useState<{ item: Announcement; top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const load = () => {
    apiFetch<(Announcement & { read: boolean })[]>('/announcements')
      .then((data) => setItems(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los anuncios'));
  };

  useEffect(() => { load(); }, []);

  // El menú se cierra con un clic fuera, Escape, scroll o al cambiar el tamaño de la ventana
  // (cualquiera de esos lo dejaría desalineado respecto a su botón).
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onMouseDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const openMenu = (item: Announcement, button: HTMLElement) => {
    const rect = button.getBoundingClientRect();
    const fitsBelow = rect.bottom + 4 + MENU_HEIGHT <= window.innerHeight;
    setMenu({
      item,
      top: fitsBelow ? rect.bottom + 4 : Math.max(rect.top - 4 - MENU_HEIGHT, 8),
      left: Math.max(Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8), 8),
    });
  };

  const openEdit = (item: Announcement) => {
    setMenu(null);
    setEditing(item);
    setEditText(item.text);
    setEditError('');
  };

  const saveEdit = async () => {
    const trimmed = editText.trim();
    if (!editing || !trimmed) return;
    setSavingEdit(true);
    setEditError('');
    try {
      await apiFetch(`/announcements/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ text: trimmed }) });
      setEditing(null);
      load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'No se pudo guardar el anuncio');
    } finally {
      setSavingEdit(false);
    }
  };

  const removeAnnouncement = async (item: Announcement) => {
    setMenu(null);
    const ok = await confirm('Dejará de mostrarse a todos los usuarios. Esta acción no se puede deshacer.', {
      title: 'Eliminar anuncio',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    setError('');
    try {
      await apiFetch(`/announcements/${item.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el anuncio');
    }
  };

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
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={{ whiteSpace: 'pre-wrap', maxWidth: 480 }}>{item.text}</td>
                <td>{item.createdByUser?.name || '—'}</td>
                <td>{new Date(item.createdAt).toLocaleString('es-PE')}</td>
                <td>
                  <button type="button" className="icon-button" onClick={(e) => openMenu(item, e.currentTarget)} aria-label="Acciones del anuncio" aria-haspopup="menu" aria-expanded={menu?.item.id === item.id} title="Acciones">
                    <MoreVertical size={16} />
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

      {menu && (
        <div ref={menuRef} className="row-actions-menu" role="menu" style={{ top: menu.top, left: menu.left }}>
          <button type="button" role="menuitem" onClick={() => { setPreviewing(menu.item); setMenu(null); }}><Eye size={14} />Ver</button>
          <button type="button" role="menuitem" onClick={() => openEdit(menu.item)}><Pencil size={14} />Editar</button>
          <button type="button" role="menuitem" className="danger" onClick={() => void removeAnnouncement(menu.item)}><Trash2 size={14} />Eliminar</button>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Editar anuncio</h2>
              <p>Quien ya lo leyó no volverá a verlo como pendiente: corregir el texto no reabre el aviso.</p>
            </div>
            <div className="modal-body form-grid">
              {editError && <div className="error-box">{editError}</div>}
              <div className="field">
                <label>Mensaje</label>
                <textarea rows={6} value={editText} maxLength={4000} onChange={(e) => setEditText(e.target.value)} />
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="button" className="button primary" disabled={savingEdit || !editText.trim()} onClick={() => void saveEdit()}>{savingEdit ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

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
