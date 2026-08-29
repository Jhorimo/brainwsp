'use client';

import { useState } from 'react';
import { Lightbulb, ListTree, Plus, Trash2, X } from 'lucide-react';
import { newOptionId, type MenuOption } from '../types';

type Props = {
  label: string;
  prompt: string;
  options: MenuOption[];
  onClose: () => void;
  onSave: (label: string, prompt: string, options: MenuOption[]) => void;
};

export function MenuConfigModal({ label: initialLabel, prompt: initialPrompt, options: initialOptions, onClose, onSave }: Props) {
  const [label, setLabel] = useState(initialLabel);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [options, setOptions] = useState<MenuOption[]>(initialOptions.length ? initialOptions : [{ id: newOptionId(), text: '' }, { id: newOptionId(), text: '' }]);

  const updateOption = (id: string, text: string) => setOptions((current) => current.map((option) => (option.id === id ? { ...option, text } : option)));
  const removeOption = (id: string) => setOptions((current) => current.filter((option) => option.id !== id));
  const addOption = () => setOptions((current) => [...current, { id: newOptionId(), text: '' }]);

  const canSave = prompt.trim().length > 0 && options.some((option) => option.text.trim().length > 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal node-config-modal menu-config-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose}><X size={15} /></button>
        <div className="modal-header"><h2>Menú — configuración</h2></div>
        <div className="modal-body" style={{ maxHeight: '68vh' }}>
          <div className="menu-config-intro">
            <ListTree size={15} />
            <div>
              <strong>Menú de opciones</strong>
              <p>Envía un menú con opciones seleccionables. Cada opción genera una salida independiente — conéctala al nodo que quieras ejecutar cuando el cliente la elija.</p>
            </div>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>Nombre del nodo (interno)</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej: Selección de método de pago" />
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Texto del menú</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="¿Cómo deseas continuar? Elige una opción:" />
            <span className="row-sub">Este texto se envía junto con las opciones del menú.</span>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>Opciones del menú</label>
            <div className="menu-option-list">
              {options.map((option, index) => (
                <div className="menu-option-row" key={option.id}>
                  <span className="menu-option-index">{index + 1}</span>
                  <input value={option.text} onChange={(e) => updateOption(option.id, e.target.value)} placeholder={`Opción ${index + 1}`} />
                  <button type="button" className="icon-button ghost small" onClick={() => removeOption(option.id)} disabled={options.length <= 1} title="Quitar opción"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <button type="button" className="menu-add-option-btn" onClick={addOption}><Plus size={14} /> Añadir opción</button>
          </div>

          <div className="menu-config-hint">
            <Lightbulb size={14} />
            <span>Conecta cada opción arrastrando desde el punto verde junto a cada botón en el canvas, hacia el nodo destino correspondiente.</span>
          </div>
        </div>
        <div className="modal-actions">
          <button className="button" type="button" onClick={onClose}>Cancelar</button>
          <button className="button primary" type="button" disabled={!canSave} onClick={() => onSave(label.trim() || 'Menú', prompt.trim(), options.filter((option) => option.text.trim()))}>Guardar nodo</button>
        </div>
      </div>
    </div>
  );
}
