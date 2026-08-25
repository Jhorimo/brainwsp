'use client';

import { useState } from 'react';
import { StickyNote } from 'lucide-react';

// Botón que abre la nota en una ventana emergente — un popover posicionado quedaba
// cortado dentro de contenedores angostos con scroll propio (ej. las columnas del
// Kanban de Pipelines), así que se muestra en el mismo modal centrado que usa el resto
// de la app en vez de intentar posicionarlo pegado al ícono.
export function NoteButton({ notes }: { notes: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="row-note-icon"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Ver nota"
      >
        <StickyNote size={12} />
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)} onPointerDown={(e) => e.stopPropagation()}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Nota</h2></div>
            <div className="modal-body"><p style={{ whiteSpace: 'pre-wrap' }}>{notes}</p></div>
            <div className="modal-actions"><button className="button primary" onClick={() => setOpen(false)}>Cerrar</button></div>
          </div>
        </div>
      )}
    </>
  );
}
