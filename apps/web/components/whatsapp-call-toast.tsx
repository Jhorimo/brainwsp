'use client';

import { MessageCircle, Phone, PhoneMissed, PhoneOff, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { apiFetch, getToken, SOCKET_URL } from '@/lib/api';
import { readSoundPref } from '@/lib/notification-sound';
import { useRingtone } from './incoming-call-provider';

// Misma clave que el interruptor de sonido de Conversaciones: si el agente silenció los
// avisos, la llamada tampoco suena (el aviso flotante sí aparece).
const SOUND_KEY = 'brainwsp_conversations_sound';
const CLOSE_AFTER_END_MS = 4000;

type CallPhase = 'ringing' | 'answered_elsewhere' | 'missed' | 'declined';
export type WhatsAppCallEvent = {
  callId: string;
  instanceId: string;
  lineName: string;
  phase: CallPhase;
  isVideo: boolean;
  contactName: string | null;
  phoneMasked: string;
  conversationId: string | null;
  startedAt: string;
  rejectedByName: string | null;
  simulated?: boolean;
};

function elapsed(startedAt: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function endLabel(call: WhatsAppCallEvent) {
  if (call.phase === 'answered_elsewhere') return 'Contestada en otro dispositivo';
  if (call.phase === 'declined') return call.rejectedByName ? `Rechazada por ${call.rejectedByName}` : 'Rechazada';
  if (call.phase === 'missed') return 'Llamada perdida';
  return '';
}

// Aviso flotante de llamadas de WhatsApp entrantes (evento `whatsapp.call` del worker).
// Contestar solo se puede desde el celular o WhatsApp Desktop; aquí se avisa, se abre el
// chat o se rechaza.
export function WhatsAppCallToast() {
  const [calls, setCalls] = useState<WhatsAppCallEvent[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [error, setError] = useState<{ callId: string; text: string } | null>(null);
  const { start: startRing, stop: stopRing } = useRingtone();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!getToken()) return;
    const socket = io(SOCKET_URL, { auth: { token: getToken() } });
    socket.on('whatsapp.call', (event: WhatsAppCallEvent) => {
      setCalls((list) => {
        const rest = list.filter((c) => c.callId !== event.callId);
        if (event.phase !== 'ringing' && !list.some((c) => c.callId === event.callId)) return list;
        return [...rest, event];
      });
      if (event.phase === 'ringing') {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.([300, 200, 300]);
      } else {
        const old = timers.current.get(event.callId);
        if (old) clearTimeout(old);
        timers.current.set(event.callId, setTimeout(() => {
          timers.current.delete(event.callId);
          setCalls((list) => list.filter((c) => c.callId !== event.callId));
        }, CLOSE_AFTER_END_MS));
      }
    });
    const pending = timers.current;
    return () => {
      socket.disconnect();
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
    };
  }, []);

  const anyRinging = calls.some((c) => c.phase === 'ringing');
  useEffect(() => {
    if (anyRinging && readSoundPref(SOUND_KEY, true)) startRing();
    else stopRing();
    return () => stopRing();
  }, [anyRinging, startRing, stopRing]);

  useEffect(() => {
    if (!anyRinging) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyRinging]);

  const reject = async (call: WhatsAppCallEvent) => {
    setRejecting(call.callId);
    setError(null);
    try {
      await apiFetch(`/instances/${call.instanceId}/calls/${encodeURIComponent(call.callId)}/reject`, { method: 'POST' });
    } catch (err) {
      setError({ callId: call.callId, text: err instanceof Error ? err.message : 'No se pudo rechazar' });
    } finally {
      setRejecting(null);
    }
  };

  const dismiss = (callId: string) => setCalls((list) => list.filter((c) => c.callId !== callId));

  if (!calls.length) return null;
  return (
    <div className="wa-call-stack" aria-live="assertive">
      {calls.map((call) => {
        const ringing = call.phase === 'ringing';
        const kind = call.isVideo ? 'Videollamada' : 'Llamada';
        return (
          <div key={call.callId} className={`wa-call-toast${ringing ? ' ringing' : ' ended'}`} role="alertdialog" aria-label={`${kind} de WhatsApp entrante`}>
            <div className="wa-call-head">
              <span className={`wa-call-icon${ringing ? ' pulse' : ''}`}>
                {ringing ? (call.isVideo ? <Video size={18} /> : <Phone size={18} />) : <PhoneMissed size={18} />}
              </span>
              <span className="wa-call-title">{ringing ? `${kind} de WhatsApp entrante` : endLabel(call)}</span>
              {call.simulated && <span className="wa-call-sim">simulada</span>}
              {!ringing && <button type="button" className="wa-call-close" onClick={() => dismiss(call.callId)} aria-label="Cerrar">×</button>}
            </div>
            <div className="wa-call-body">
              <div className="wa-call-avatar">{(call.contactName || '#').trim().charAt(0).toUpperCase()}</div>
              <div className="wa-call-who">
                <strong>{call.contactName || 'Número desconocido'}</strong>
                <span>{call.phoneMasked}</span>
                <span className="wa-call-line">Línea: {call.lineName} · {call.isVideo ? 'Video' : 'Voz'}</span>
              </div>
            </div>
            {ringing && (
              <>
                <div className="wa-call-actions">
                  {call.conversationId ? (
                    <a className="button" href={`/conversations?id=${call.conversationId}`}><MessageCircle size={15} /> Abrir chat</a>
                  ) : (
                    <span className="wa-call-nochat">Sin chat previo</span>
                  )}
                  <button type="button" className="button danger" disabled={rejecting === call.callId} onClick={() => void reject(call)}>
                    <PhoneOff size={15} /> {rejecting === call.callId ? 'Rechazando…' : 'Rechazar'}
                  </button>
                </div>
                {error?.callId === call.callId && <div className="wa-call-error">{error.text}</div>}
                <div className="wa-call-foot">Contesta desde tu celular o WhatsApp Desktop · sonando {elapsed(call.startedAt, now)}</div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
