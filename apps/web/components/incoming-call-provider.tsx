'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import { API_URL, getToken, SOCKET_URL } from '@/lib/api';

type IncomingCall = { callId: string; conversationId: string; contact: { name: string } };

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Timbre sintetizado con Web Audio API (un tono repetido) en vez de un archivo de audio —
// evita depender de un asset con licencia solo para esto.
function useRingtone() {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    if (intervalRef.current) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    ctxRef.current = ctx;
    const beep = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    };
    beep();
    intervalRef.current = setInterval(beep, 1000);
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);
  return { start, stop };
}

// Llamadas de voz entrantes desde el widget Clienera Chat — montado una sola vez en
// AppShell (ver comentario ahí) para que suene sin importar en qué página del panel esté el
// agente, igual que WhatsAppStatusToast pero con su propia conexión: ese otro socket se
// desconecta al desmontar conversations/page.tsx, y esta función necesita estar viva toda
// la sesión. Reusa la misma conexión para toda la señalización WebRTC (call:*) — nunca abre
// una segunda.
export function IncomingCallProvider() {
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [callPhase, setCallPhase] = useState<'idle' | 'ringing' | 'active'>('idle');
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }]);
  // Espejo en ref del `incoming` en estado — los listeners del socket se registran una sola
  // vez (efecto sin deps reactivas) así que no pueden leer el `incoming` de React sin
  // quedarse con el valor viejo; esta ref siempre tiene el último.
  const incomingRef = useRef<IncomingCall | null>(null);
  const ringtone = useRingtone();

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    ringtone.stop();
    incomingRef.current = null;
    setIncoming(null);
    setCallPhase('idle');
    setMuted(false);
    setSeconds(0);
  }, [ringtone]);

  useEffect(() => {
    if (!getToken()) return;
    fetch(`${API_URL}/widget/ice-servers`)
      .then((r) => r.json() as Promise<{ iceServers: RTCIceServer[] }>)
      .then((data) => { if (data.iceServers?.length) iceServersRef.current = data.iceServers; })
      .catch(() => {});

    const socket = io(SOCKET_URL, { auth: { token: getToken() } });
    socketRef.current = socket;

    socket.on('call:invite', (data: IncomingCall) => {
      incomingRef.current = data;
      setIncoming(data);
      setCallPhase('ringing');
      ringtone.start();
    });
    socket.on('call:taken', (data: { callId: string }) => {
      if (incomingRef.current?.callId !== data.callId) return;
      incomingRef.current = null;
      setIncoming(null);
      setCallPhase('idle');
      ringtone.stop();
    });
    socket.on('call:signal', (data: { callId: string; type: string; data: unknown }) => {
      const pc = pcRef.current;
      if (!pc || incomingRef.current?.callId !== data.callId) return;
      if (data.type === 'offer') {
        void (async () => {
          await pc.setRemoteDescription(data.data as RTCSessionDescriptionInit);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('call:signal', { callId: data.callId, type: 'answer', data: answer });
        })();
      } else if (data.type === 'ice-candidate') {
        void pc.addIceCandidate(data.data as RTCIceCandidateInit).catch(() => {});
      }
    });
    socket.on('call:end', (data: { callId: string }) => {
      if (incomingRef.current?.callId === data.callId) cleanup();
    });

    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dentro del propio click de "Aceptar" a propósito: getUserMedia y el autoplay del audio
  // remoto necesitan un gesto de usuario para que el navegador no los bloquee.
  const acceptCall = useCallback(async () => {
    const call = incomingRef.current;
    if (!call || !socketRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.onicecandidate = (e) => {
        if (e.candidate) socketRef.current?.emit('call:signal', { callId: call.callId, type: 'ice-candidate', data: e.candidate });
      };
      pc.ontrack = (e) => { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0]; };
      ringtone.stop();
      socketRef.current.emit('call:accept', { callId: call.callId });
      setCallPhase('active');
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      // Sin permiso de micrófono no se puede contestar — se deja sonando para que otro
      // agente la tome, o termine marcada como perdida.
    }
  }, [ringtone]);

  const declineCall = useCallback(() => {
    if (incomingRef.current) socketRef.current?.emit('call:decline', { callId: incomingRef.current.callId });
    cleanup();
  }, [cleanup]);

  const hangUp = useCallback(() => {
    if (incomingRef.current) socketRef.current?.emit('call:end', { callId: incomingRef.current.callId });
    cleanup();
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }, [muted]);

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
      {incoming && callPhase !== 'idle' && (
        <div className="incoming-call-card" role="alert">
          <div className="incoming-call-info">
            <Phone size={18} />
            <div>
              <strong>{callPhase === 'ringing' ? 'Llamada entrante' : 'En llamada'}</strong>
              <span>{incoming.contact.name}{callPhase === 'active' ? ` · ${formatDuration(seconds)}` : ''}</span>
            </div>
          </div>
          <div className="incoming-call-actions">
            {callPhase === 'ringing' ? (
              <>
                <button className="incoming-call-btn decline" aria-label="Rechazar" onClick={declineCall}><PhoneOff size={16} /></button>
                <button className="incoming-call-btn accept" aria-label="Aceptar" onClick={() => void acceptCall()}><Phone size={16} /></button>
              </>
            ) : (
              <>
                <button className="incoming-call-btn" aria-label={muted ? 'Activar micrófono' : 'Silenciar'} onClick={toggleMute}>{muted ? <MicOff size={16} /> : <Mic size={16} />}</button>
                <button className="incoming-call-btn decline" aria-label="Colgar" onClick={hangUp}><PhoneOff size={16} /></button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
