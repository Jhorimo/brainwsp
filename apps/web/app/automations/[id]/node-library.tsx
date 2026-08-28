'use client';

import { ListTree, Megaphone, MessageSquareText, Sparkles, Timer, Wallet } from 'lucide-react';

type LibraryItem = {
  key: string;
  label: string;
  icon: typeof MessageSquareText;
  color: 'pink' | 'purple' | 'teal' | 'orange' | 'green';
  enabled: boolean;
};

// Solo "Mensaje Chat" (nuestro nodo CONTENIDO) está construido — el resto refleja las fases
// siguientes acordadas (Menú/Espera/Remarketing = fase 3, Validación Pago con IA = fase 4) y
// se muestra deshabilitado en vez de omitirse, para que quede claro qué sigue en el roadmap.
const CATEGORIES: Array<{ label: string; items: LibraryItem[] }> = [
  {
    label: 'BÁSICOS',
    items: [
      { key: 'content', label: 'Mensaje Chat', icon: MessageSquareText, color: 'pink', enabled: true },
      { key: 'menu', label: 'Menú', icon: ListTree, color: 'purple', enabled: false },
      { key: 'wait', label: 'Espera', icon: Timer, color: 'teal', enabled: false },
    ],
  },
  {
    label: 'AUTOMATIZACIÓN',
    items: [
      { key: 'remarketing', label: 'Remarketing', icon: Megaphone, color: 'orange', enabled: false },
      { key: 'payment', label: 'Validación Pago', icon: Wallet, color: 'green', enabled: false },
    ],
  },
];

export function NodeLibrary({ onSelectContent, onClose }: { onSelectContent: () => void; onClose: () => void }) {
  const handlePick = (item: LibraryItem) => {
    if (!item.enabled) return;
    if (item.key === 'content') onSelectContent();
    onClose();
  };

  return (
    <>
      <div className="node-library-backdrop" onClick={onClose} />
      <div className="node-library">
        <div className="node-library-head">
          <div className="node-library-head-icon"><Sparkles size={15} /></div>
          <div>
            <strong>Librería de nodos</strong>
            <span>Añade módulos a tu flujo</span>
          </div>
        </div>
        {CATEGORIES.map((category) => (
          <div className="node-library-section" key={category.label}>
            <div className="node-library-caption">{category.label}</div>
            <div className="node-library-grid">
              {category.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`node-library-tile ${item.enabled ? '' : 'disabled'}`}
                    disabled={!item.enabled}
                    title={item.enabled ? undefined : 'Próximamente'}
                    onClick={() => handlePick(item)}
                  >
                    <span className={`node-library-tile-icon ${item.color}`}><Icon size={19} /></span>
                    <span>{item.label}</span>
                    {!item.enabled && <span className="node-library-soon">Próximamente</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
