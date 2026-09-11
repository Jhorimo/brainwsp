'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type Option = { id: string; label: string; color?: string };

// Menu desplegable con checkboxes, mismo esqueleto visual que .chat-quick-menu /
// .tag-menu (ver globals.css) pero reutilizable para cualquier lista de opciones — se usa
// 4 veces en el panel de filtros de conversaciones (departamento, proyecto, etapa,
// etiquetas). Maneja su propio abrir/cerrar (click afuera + Escape) sin depender del
// enorme efecto compartido que ya tiene esa pagina para otros popovers.
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);
  };

  return (
    <div className="multi-select-filter" ref={ref}>
      <button
        type="button"
        className={`multi-select-trigger ${selected.length ? 'active' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        {label}{selected.length > 0 && ` (${selected.length})`}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="multi-select-menu">
          {selected.length > 0 && (
            <button type="button" className="multi-select-clear" onClick={() => onChange([])}>Limpiar</button>
          )}
          {options.map((option) => {
            const checked = selected.includes(option.id);
            return (
              <button type="button" key={option.id} className={`multi-select-option ${checked ? 'active' : ''}`} onClick={() => toggle(option.id)}>
                <span className="multi-select-checkbox">{checked && <Check size={11} />}</span>
                {option.color && <span className="tag-dot" style={{ background: option.color }} />}
                {option.label}
              </button>
            );
          })}
          {options.length === 0 && <p className="contact-empty-hint">Sin opciones.</p>}
        </div>
      )}
    </div>
  );
}
