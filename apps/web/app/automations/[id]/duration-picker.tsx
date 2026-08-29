'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';

type Unit = 'sec' | 'min' | 'hour' | 'day';
const UNIT_SECONDS: Record<Unit, number> = { sec: 1, min: 60, hour: 3600, day: 86400 };
const UNIT_LABELS: Record<Unit, string> = { sec: 'Sec', min: 'Min', hour: 'Hou', day: 'Day' };
// Tope de cordura para una espera dentro de un flujo — no hay límite técnico (el worker la
// reprograma como job diferido de BullMQ), pero nada realista necesita esperar más de 30 días.
const MAX_SECONDS = 30 * 24 * 3600;

// Picks the largest unit that divides `seconds` evenly, so 120 shows as "2 Min" instead of
// "120 Sec" — falls back to Sec when it doesn't divide cleanly into anything bigger.
function deriveUnit(seconds: number): Unit {
  if (seconds > 0 && seconds % 86400 === 0) return 'day';
  if (seconds > 0 && seconds % 3600 === 0) return 'hour';
  if (seconds > 0 && seconds % 60 === 0) return 'min';
  return 'sec';
}

export function DurationPicker({ seconds, onChange }: { seconds: number; onChange: (seconds: number) => void }) {
  const [unit, setUnit] = useState<Unit>(() => deriveUnit(seconds));
  const value = Math.max(1, Math.round(seconds / UNIT_SECONDS[unit]));

  const commit = (nextValue: number, nextUnit: Unit) => {
    onChange(Math.min(MAX_SECONDS, Math.max(1, nextValue) * UNIT_SECONDS[nextUnit]));
  };

  return (
    <div className="duration-picker">
      <div className="duration-picker-stepper">
        <button type="button" className="duration-picker-btn" onClick={() => commit(value - 1, unit)} disabled={value <= 1}><Minus size={15} /></button>
        <div className="duration-picker-value">
          <strong>{value}</strong>
          <span>{UNIT_LABELS[unit].toUpperCase()}</span>
        </div>
        <button type="button" className="duration-picker-btn" onClick={() => commit(value + 1, unit)}><Plus size={15} /></button>
      </div>
      <div className="duration-picker-units">
        {(Object.keys(UNIT_LABELS) as Unit[]).map((candidate) => (
          <button key={candidate} type="button" className={`duration-picker-unit ${unit === candidate ? 'active' : ''}`} onClick={() => {
            setUnit(candidate);
            // Convierte la duración real (seconds) a la nueva unidad — reusar el `value` que
            // se mostraba en la unidad anterior lo reinterpretaría como si fuera un número
            // distinto (ej. "90 Sec" -> clic en "Min" guardaría 90 minutos, no 90 segundos).
            commit(Math.max(1, Math.round(seconds / UNIT_SECONDS[candidate])), candidate);
          }}>
            {UNIT_LABELS[candidate]}
          </button>
        ))}
      </div>
    </div>
  );
}
