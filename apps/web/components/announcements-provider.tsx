'use client';

import { Megaphone, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, getToken } from '@/lib/api';

type Announcement = {
  id: string;
  text: string;
  createdAt: string;
  createdByUser: { id: string; name: string } | null;
  read: boolean;
};

export function AnnouncementsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [list, setList] = useState<Announcement[]>([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);

  // Se revisa en cada cambio de ruta, no solo al montar: entrar/recargar ya dispara un
  // mount, pero "ver panel de un usuario" (impersonar, ver admin/clients/page.tsx) cambia
  // de sesion via router.push, sin remount del layout raiz — sin esto, un anuncio sin leer
  // no aparecia al entrar al panel de ese usuario por impersonacion.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    apiFetch<Announcement[]>('/announcements')
      .then((data) => {
        if (cancelled) return;
        setList(data);
        const firstUnread = data.findIndex((a) => !a.read);
        if (firstUnread !== -1) {
          setIndex(firstUnread);
          setOpen(true);
        } else {
          setOpen(false);
        }
      })
      .catch(() => {
        // Silencioso a proposito: un anuncio que no carga no debe romper el login/panel.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const current = list[index];

  const markRead = useCallback(async () => {
    if (!current || current.read) return;
    const updated = list.map((a) => (a.id === current.id ? { ...a, read: true } : a));
    setList(updated);
    apiFetch(`/announcements/${current.id}/read`, { method: 'POST' }).catch(() => {
      // Si falla la marca en el servidor, la proxima carga lo volvera a mostrar — no es
      // grave perder este intento puntual.
    });

    const nextUnread = updated.findIndex((a) => !a.read);
    if (nextUnread !== -1) setIndex(nextUnread);
    else setOpen(false);
  }, [current, list]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex((i) => Math.min(list.length - 1, i + 1)), [list.length]);

  return (
    <>
      {children}
      {open && current && (
        <div className="modal-backdrop">
          <div className="modal announcement-modal">
            <div className="announcement-modal-icon"><Megaphone size={18} /></div>
            <div className="modal-header">
              <h2>Anuncio</h2>
            </div>
            <div className="modal-body">
              <div className="announcement-text">{current.text}</div>
              <div className="announcement-meta">
                {current.createdByUser?.name || 'Brain Tech'} · {new Date(current.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
            <div className="announcement-nav">
              <button
                type="button"
                className="icon-button"
                onClick={goPrev}
                disabled={index === 0}
                aria-label="Anuncio más reciente"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="announcement-nav-count">{index + 1} / {list.length}</span>
              <button
                type="button"
                className="icon-button"
                onClick={goNext}
                disabled={index === list.length - 1}
                aria-label="Anuncio anterior"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="modal-actions">
              <button type="button" className="button primary" onClick={markRead}>Leído</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
