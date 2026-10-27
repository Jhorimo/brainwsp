'use client';

import { Check, ChevronDown, Layers, MessageCircle, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type LinePickerLine = { id: string; name: string; status: string; provider: string; phoneNumber?: string | null; unreadChats: number };

// Número de la línea legible: los peruanos (51 + 9 dígitos) agrupados de a tres, como en WhatsApp.
function formatLinePhone(phone?: string | null) {
  const digits = phone?.replace(/\D/g, '') || '';
  if (!digits) return '';
  if (/^51\d{9}$/.test(digits)) return `+51 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  return `+${digits}`;
}

const statusLabels: Record<string, string> = { CONNECTED: 'Conectada', CONNECTING: 'Conectando', RECONNECTING: 'Reconectando', QR_PENDING: 'Esperando QR', DISCONNECTED: 'Desconectada', LOGGED_OUT: 'Sin vincular', ERROR: 'Con error' };

function statusTone(line: LinePickerLine) {
  if (line.provider === 'CLIENERA_CHAT') return 'web';
  if (line.status === 'CONNECTED') return 'ok';
  if (line.status === 'CONNECTING' || line.status === 'RECONNECTING' || line.status === 'QR_PENDING') return 'warn';
  return 'off';
}

// Selector de línea de la bandeja. Reemplaza al <select> nativo: el botón ocupa solo el nombre
// de la línea (sirve de título de la bandeja) y el menú muestra el estado de cada línea y sus
// chats sin leer, que en un <select> solo cabían como texto pegado al nombre.
export function LinePicker({ lines, value, onChange }: { lines: LinePickerLine[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);
  useEffect(() => { if (!open) setQuery(''); }, [open]);

  const current = lines.find((line) => line.id === value);
  const totalUnread = lines.reduce((sum, line) => sum + line.unreadChats, 0);
  const shownUnread = current ? current.unreadChats : totalUnread;
  const filtered = query.trim() ? lines.filter((line) => line.name.toLowerCase().includes(query.trim().toLowerCase())) : lines;
  const pick = (id: string) => { onChange(id); setOpen(false); };

  return (
    <div className="line-picker" ref={ref}>
      <button type="button" className={`line-picker-trigger ${open ? 'open' : ''}`} onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} title={current && formatLinePhone(current.phoneNumber) ? `${current.name} · ${formatLinePhone(current.phoneNumber)}` : 'Elige qué línea ver'}>
        {current ? <span className={`line-dot ${statusTone(current)}`} aria-hidden="true" /> : <Layers size={15} className="line-picker-all-icon" aria-hidden="true" />}
        <span className="line-picker-name">{current ? current.name : 'Todas las líneas'}</span>
        {shownUnread > 0 && <span className="line-picker-badge">{shownUnread}</span>}
        <ChevronDown size={15} className="line-picker-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="line-picker-menu" role="listbox" aria-label="Líneas">
          {lines.length > 6 && (
            <label className="line-picker-search">
              <Search size={14} aria-hidden="true" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar línea..." aria-label="Buscar línea" />
            </label>
          )}
          {!query.trim() && (
            <button type="button" role="option" aria-selected={!current} className={`line-picker-option ${!current ? 'selected' : ''}`} onClick={() => pick('')}>
              <Layers size={15} className="line-picker-all-icon" aria-hidden="true" />
              <span className="line-picker-option-copy"><strong>Todas las líneas</strong></span>
              {totalUnread > 0 && <span className="line-picker-badge">{totalUnread}</span>}
              {!current && <Check size={15} className="line-picker-check" aria-hidden="true" />}
            </button>
          )}
          {filtered.map((line) => {
            const tone = statusTone(line);
            return (
              <button type="button" role="option" aria-selected={line.id === value} key={line.id} className={`line-picker-option ${line.id === value ? 'selected' : ''}`} onClick={() => pick(line.id)}>
                {tone === 'web' ? <MessageCircle size={15} className="line-picker-web-icon" aria-hidden="true" /> : <span className={`line-dot ${tone}`} aria-hidden="true" />}
                <span className="line-picker-option-copy">
                  <strong>{line.name}</strong>
                  <small>{tone === 'web' ? 'Chat de la web' : statusLabels[line.status] || line.status}{tone !== 'web' && formatLinePhone(line.phoneNumber) ? ` · ${formatLinePhone(line.phoneNumber)}` : ''}</small>
                </span>
                {line.unreadChats > 0 && <span className="line-picker-badge">{line.unreadChats}</span>}
                {line.id === value && <Check size={15} className="line-picker-check" aria-hidden="true" />}
              </button>
            );
          })}
          {filtered.length === 0 && <div className="line-picker-empty">Ninguna línea coincide</div>}
        </div>
      )}
    </div>
  );
}
