'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { DurationPicker } from './duration-picker';

export function WaitConfigModal({ seconds: initialSeconds, onClose, onSave }: { seconds: number; onClose: () => void; onSave: (seconds: number) => void }) {
  const [seconds, setSeconds] = useState(initialSeconds);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wait-config-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose}><X size={15} /></button>
        <div className="modal-header"><h2>Temporizador — configuración</h2><p>Cuánto tiempo se pausa el flujo antes de continuar.</p></div>
        <div className="modal-body">
          <DurationPicker seconds={seconds} onChange={setSeconds} />
        </div>
        <div className="modal-actions">
          <button className="button" type="button" onClick={onClose}>Cancelar</button>
          <button className="button primary" type="button" onClick={() => onSave(seconds)}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
