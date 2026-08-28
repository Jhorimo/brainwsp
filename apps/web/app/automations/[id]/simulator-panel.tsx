'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { blockMediaSrc, type SimulateResult } from '../types';

type ChatItem =
  | { from: 'system'; text: string }
  | { from: 'user'; text: string }
  | { from: 'bot'; kind: 'text' | 'image' | 'video' | 'audio' | 'file'; text?: string; mediaUrl?: string; mimeType?: string; caption?: string; fileName?: string; delayMs: number };

// Real delays (remarketing/temporizador, futuras fases) se comprimen así de rápido en vez de
// hacer esperar minutos reales al probar — el motor no cambia, solo cuánto se espera aquí.
const MAX_REPLAY_DELAY_MS = 1800;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function SimulatorPanel({ flowId, onClose }: { flowId: string; onClose: () => void }) {
  const [items, setItems] = useState<ChatItem[]>([{ from: 'system', text: 'Simulador listo. Envía un mensaje o palabra clave para iniciar el flujo.' }]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [items]);

  const send = async () => {
    const message = input.trim();
    if (!message || running) return;
    setInput('');
    setItems((current) => [...current, { from: 'user', text: message }]);
    setRunning(true);
    try {
      const result = await apiFetch<SimulateResult>(`/automations/flows/${flowId}/simulate`, { method: 'POST', body: JSON.stringify({ message }) });
      if (!result.triggered) {
        setItems((current) => [...current, { from: 'system', text: 'Ese mensaje no coincide con ninguna palabra clave de este flujo.' }]);
        return;
      }
      for (const effect of result.effects) {
        await sleep(Math.min(effect.delayMs, MAX_REPLAY_DELAY_MS));
        setItems((current) => [...current, { from: 'bot', kind: effect.kind, text: effect.text, mediaUrl: effect.mediaUrl, mimeType: effect.mimeType, caption: effect.caption, fileName: effect.fileName, delayMs: effect.delayMs }]);
      }
      if (result.status === 'COMPLETED') {
        setItems((current) => [...current, { from: 'system', text: 'Flujo completado.' }]);
      } else {
        setItems((current) => [...current, { from: 'system', text: 'El flujo llegó a un nodo que todavía no se puede simular (próxima fase).' }]);
      }
    } catch (err) {
      setItems((current) => [...current, { from: 'system', text: err instanceof Error ? err.message : 'Error al simular el flujo' }]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="simulator-panel">
      <div className="simulator-header">
        <div className="simulator-header-icon"><Sparkles size={15} /></div>
        <div className="simulator-header-copy">
          <strong>Simulador de flujos</strong>
          <span><span className="flow-node-dot" /> Modo de prueba activo</span>
        </div>
        <button type="button" className="icon-button ghost small" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="simulator-body" ref={scrollRef}>
        {items.map((item, index) => {
          if (item.from === 'system') return <div className="simulator-system-msg" key={index}>{item.text}</div>;
          if (item.from === 'user') return <div className="message-bubble out simulator-bubble" key={index}>{item.text}</div>;
          return (
            <div className="message-bubble simulator-bubble" key={index}>
              <div className="simulator-sender">BrainWSP</div>
              {item.kind === 'text' && item.text}
              {item.kind === 'image' && item.mediaUrl && (
                <>
                  <img src={blockMediaSrc(item.mediaUrl, item.mimeType, item.fileName)} alt={item.caption || 'imagen'} style={{ maxWidth: 220, borderRadius: 8, display: 'block' }} />
                  {item.caption && <div style={{ marginTop: 6 }}>{item.caption}</div>}
                </>
              )}
              {item.kind === 'video' && item.mediaUrl && (
                <>
                  <video src={blockMediaSrc(item.mediaUrl, item.mimeType, item.fileName)} controls style={{ maxWidth: 220, borderRadius: 8, display: 'block' }} />
                  {item.caption && <div style={{ marginTop: 6 }}>{item.caption}</div>}
                </>
              )}
              {item.kind === 'audio' && item.mediaUrl && <audio src={blockMediaSrc(item.mediaUrl, item.mimeType, item.fileName)} controls style={{ width: 220 }} />}
              {item.kind === 'file' && item.mediaUrl && <a href={blockMediaSrc(item.mediaUrl, item.mimeType, item.fileName)} target="_blank" rel="noreferrer" className="message-link">{item.fileName || 'Descargar archivo'}</a>}
            </div>
          );
        })}
        {running && <div className="simulator-system-msg">escribiendo...</div>}
      </div>
      <div className="simulator-footer">
        <div className="simulator-context-row">Variables de contexto <span className="status-pill neutral">0</span></div>
        <div className="simulator-input-row">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} placeholder="Escribe un mensaje de prueba..." disabled={running} />
          <button type="button" className="send-button" disabled={running || !input.trim()} onClick={() => void send()}><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}
