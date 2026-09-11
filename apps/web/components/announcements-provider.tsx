'use client';

import { Megaphone, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, getStoredUser, getToken } from '@/lib/api';

type Announcement = {
  id: string;
  text: string;
  createdAt: string;
  createdByUser: { id: string; name: string } | null;
  read: boolean;
};

export function AnnouncementsProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Announcement[]>([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);

  // Se revisa al montar (recarga real o primera entrada) y cuando cambia la sesion activa
  // (login, o SUPERADMIN entrando/saliendo del panel de un usuario por impersonacion — ver
  // notifySessionChanged en lib/api.ts). A proposito NO se revisa en cada navegacion del
  // menu: el sidebar usa <Link> de Next.js (sin recarga real), y mostrar el anuncio en
  // cada clic entre paginas seria molesto, no lo que se pidio.
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (!getToken()) return;
      // El popup obligatorio es para usuarios de una empresa, no para quien administra
      // la plataforma — el superadmin publica anuncios, no los recibe (puede previsualizar
      // el suyo desde el boton "Ver" en /admin/announcements, sin el candado de "Leido").
      const { role } = getStoredUser<{ role?: string }>();
      if (role === 'SUPERADMIN') return;
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
    };
    check();
    window.addEventListener('brainwsp:session-changed', check);
    return () => {
      cancelled = true;
      window.removeEventListener('brainwsp:session-changed', check);
    };
  }, []);

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
            {/* Cierra sin marcar leido: reaparece en la proxima navegacion/recarga. No es
                un "no volver a mostrar" — solo da un respiro si el usuario esta ocupado. */}
            <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Cerrar por ahora">
              <X size={15} />
            </button>
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
