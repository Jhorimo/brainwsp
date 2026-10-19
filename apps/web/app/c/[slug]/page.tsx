'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import dynamic from 'next/dynamic';
import { Ban, Check, CheckCheck, FileText, Mic, MicOff, MessageCircle, MoreVertical, Paperclip, Pencil, Phone, PhoneOff, Send, Smile, Square, Trash2, Upload, Volume2, VolumeX, X } from 'lucide-react';
import type { EmojiClickData } from 'emoji-picker-react';
import type { EmojiData } from 'emoji-picker-react/dist/types/exposedTypes';
import emojiDataEsRaw from 'emoji-picker-react/dist/data/emojis-es.json';
import { ClieneraMark } from '@/components/brand-mark';
import { useConfirm } from '@/components/confirm-provider';
import { playNotificationSound, readSoundPref, writeSoundPref } from '@/lib/notification-sound';
import './chat.css';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });
// El JSON de categorías tipa `category` como `string` plano — EmojiData lo quiere como el
// enum `Categories`. Son los mismos valores en runtime (el propio paquete los genera), así
// que el cast es seguro; sin esto el type-check de producción (`next build`) lo rechaza
// aunque en dev (Turbopack) no se nota.
const emojiDataEs = emojiDataEsRaw as unknown as EmojiData;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
// El `accept` del input de archivo es solo una sugerencia del selector del SO — la
// validación real (acá y en WidgetService.widgetMessageType) es por prefijo para audio/video.
const ACCEPTED_FILE_TYPES = 'image/jpeg,image/png,image/gif,image/webp,application/pdf,video/*,audio/*';
const MAX_FILE_BYTES = 15 * 1024 * 1024;

function isAcceptedFile(file: File) {
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'].includes(file.type)) return true;
  return file.type.startsWith('video/') || file.type.startsWith('audio/');
}

function formatRecordTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

type Bootstrap = {
  widgetPublicKey: string; companyName: string; welcomeMessage: string; color: string; buttonText: string;
  autoOpen: boolean; position: 'left' | 'right'; hasIcon: boolean; iconVersion?: string; allowMinimize: boolean;
  teaserType: 'text' | 'image'; hasTeaserImage: boolean; teaserImageVersion?: string; allowCalls: boolean;
};
type WidgetMessage = {
  id: string; direction: 'INBOUND' | 'OUTBOUND'; type: string; status: string; body?: string | null;
  caption?: string | null; fileName?: string | null; mimeType?: string | null; fileSize?: number | null; createdAt: string;
  deleted?: boolean; metadata?: { edited?: boolean; callStatus?: string; durationSeconds?: number } | null;
};

// Página pública del canal Clienera Chat — "clienera.com/<slug>" del punto 11 del brief.
// Sin login: la identidad del visitante vive en localStorage (token de VisitorSession),
// con alcance por widgetPublicKey ya que el mismo navegador puede visitar varias empresas.
// `?embed=1` la marca como cargada dentro del iframe del widget.js: sin marco propio (lo
// pone el iframe) y hablando con la página anfitriona por postMessage (cerrar, avisar que
// ya está lista con el branding para pintar el botón flotante y la burbuja de saludo).
function storageKey(widgetPublicKey: string, suffix: string) {
  return `clienera_chat_${widgetPublicKey}_${suffix}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Segundo tono para el degradé del header — mismo matiz, un poco más oscuro, sin
// depender de una librería de color solo para esto.
function shade(hex: string, amount: number) {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;
  const num = parseInt(value, 16);
  const clamp = (c: number) => Math.max(0, Math.min(255, c));
  const r = clamp(((num >> 16) & 255) + amount);
  const g = clamp(((num >> 8) & 255) + amount);
  const b = clamp((num & 255) + amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCallDuration(seconds?: number) {
  const total = seconds || 0;
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Mismo texto en ambos lados (panel de agentes y este widget) — ver conversations/page.tsx.
function callLabel(metadata?: { callStatus?: string; durationSeconds?: number } | null) {
  switch (metadata?.callStatus) {
    case 'answered': return `Llamada de voz · ${formatCallDuration(metadata?.durationSeconds)}`;
    case 'missed': return 'Llamada perdida';
    case 'declined': return 'Llamada rechazada';
    case 'cancelled': return 'Llamada cancelada';
    case 'failed': return 'Llamada fallida';
    default: return 'Llamada de voz';
  }
}

// Ticks de los propios mensajes del visitante, estilo WhatsApp Web — ver RealtimeGateway
// 'message:delivered'/'message:read' y ConversationsService.markRead (lado agente).
// RECEIVED = llegó al servidor (✓), DELIVERED = un agente lo recibió en vivo (✓✓ gris),
// READ = un agente abrió la conversación (✓✓ azul).
function ticksIcon(status: string) {
  if (status === 'READ') return <CheckCheck size={12} className="cc-status-read" />;
  if (status === 'DELIVERED') return <CheckCheck size={12} />;
  return <Check size={12} />;
}

export default function PublicChatPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const embedded = searchParams.get('embed') === '1';

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [callState, setCallState] = useState<'idle' | 'calling' | 'active'>('idle');
  const [callMuted, setCallMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  // Sonido al llegar un mensaje del agente — activado por defecto, el visitante lo puede
  // silenciar desde el botón del header. Por canal (storageKey), igual que el token/conversación.
  const [soundEnabled, setSoundEnabled] = useState(true);
  // "Agente escribiendo..." estilo WhatsApp Web — ver RealtimeGateway 'typing'/'agent:typing'.
  const [agentTyping, setAgentTyping] = useState(false);
  const confirm = useConfirm();
  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiBoxRef = useRef<HTMLDivElement>(null);
  const msgMenuRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Llamada de voz WebRTC (ver RealtimeGateway call:* y CallsService) — reusa el mismo
  // socket ya abierto para el chat (socketRef), nunca una segunda conexión.
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const callIdRef = useRef<string | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }]);
  // Candidatos ICE que llegan por 'call:signal' antes de que la respuesta del agente haya
  // terminado de aplicarse con setRemoteDescription — ver el mismo comentario, más largo, en
  // incoming-call-provider.tsx. Sin este buffer, un candidato que llega "demasiado rápido"
  // (típico en LAN/localhost, donde los candidatos "host" salen casi al instante) se perdía
  // en silencio y la llamada quedaba sin audio aunque el cronómetro siguiera corriendo.
  const remoteDescSetRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  // Espejo en ref de `soundEnabled` — el listener de socket se registra una sola vez por
  // conversación (ver efecto 2) y de otro modo leería el valor de cuando se abrió el socket.
  const soundEnabledRef = useRef(true);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  // "Escribiendo..." propio (ver notifyTyping/stopTyping) — debounced para no mandar un
  // evento por cada tecla, igual que en conversations/page.tsx del panel.
  const typingActiveRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Resuelve el canal por el slug de la empresa y arranca/recupera la sesión del visitante.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetch(`${API_URL}/widget/by-slug/${params.slug}`).then((r) => {
          if (!r.ok) throw new Error('not found');
          return r.json() as Promise<Bootstrap>;
        });
        if (cancelled) return;
        setBootstrap(data);
        setSoundEnabled(readSoundPref(storageKey(data.widgetPublicKey, 'sound'), true));
        fetch(`${API_URL}/widget/ice-servers`)
          .then((r) => r.json() as Promise<{ iceServers: RTCIceServer[] }>)
          .then((ice) => { if (!cancelled && ice.iceServers?.length) iceServersRef.current = ice.iceServers; })
          .catch(() => {});
        if (embedded) {
          const iconUrl = data.hasIcon ? `${API_URL}/widget/${data.widgetPublicKey}/icon?v=${encodeURIComponent(data.iconVersion || '')}` : null;
          const teaserImageUrl = data.hasTeaserImage ? `${API_URL}/widget/${data.widgetPublicKey}/teaser-image?v=${encodeURIComponent(data.teaserImageVersion || '')}` : null;
          window.parent.postMessage({ type: 'clienera:ready', ...data, iconUrl, teaserImageUrl }, '*');
        }

        const storedToken = localStorage.getItem(storageKey(data.widgetPublicKey, 'token'));
        // pageUrl lo agrega widget.js al src del iframe (origen+ruta de la página del
        // cliente donde está embebido) — se la pasamos al backend para guardarla en el
        // contacto (ver Contact.sourceUrl) y que soporte sepa de qué cliente es sin preguntar.
        const pageUrl = searchParams.get('pageUrl') || undefined;
        const session = await fetch(`${API_URL}/widget/${data.widgetPublicKey}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: storedToken || undefined, pageUrl }),
        }).then((r) => r.json() as Promise<{ token: string; conversationId: string | null }>);
        if (cancelled) return;

        localStorage.setItem(storageKey(data.widgetPublicKey, 'token'), session.token);
        setToken(session.token);
        setConversationId(session.conversationId);

        if (session.conversationId) {
          const history = await fetch(`${API_URL}/widget/${data.widgetPublicKey}/messages?token=${encodeURIComponent(session.token)}`)
            .then((r) => r.json() as Promise<{ messages: WidgetMessage[] }>);
          if (!cancelled) setMessages(history.messages);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug]);

  // El servidor retransmite TODO mensaje de esta conversación por socket a la sala
  // `conversation:{id}` — incluido el que el propio visitante acaba de enviar (para que, si
  // abre el chat en dos pestañas, ambas lo vean). Eso corre en paralelo a la respuesta HTTP
  // del propio POST, y Redis Pub/Sub suele ganarle en velocidad al round-trip HTTP: sin
  // deduplicar por id en AMBOS caminos, el mismo mensaje se agregaba dos veces cuando el eco
  // llegaba primero. `addMessage` es el único punto de entrada a `messages` para que esto no
  // pueda volver a pasar.
  const addMessage = useCallback((message: WidgetMessage) => {
    setMessages((current) => (current.some((m) => m.id === message.id) ? current : [...current, message]));
  }, []);

  // "Escribiendo..." propio del visitante, hacia el/los agente(s) — debounced: un solo
  // 'typing:true' al empezar, y 'typing:false' recién tras una pausa (o al vaciar/enviar el
  // input), nunca uno por tecla.
  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      socketRef.current?.emit('typing', { typing: false });
    }
  }, []);
  const notifyTyping = useCallback(() => {
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      socketRef.current?.emit('typing', { typing: true });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTyping, 2500);
  }, [stopTyping]);

  // Acuses de entrega/lectura (✓✓ gris / ✓✓ azul) de los propios mensajes del visitante —
  // ver RealtimeGateway 'message:delivered'/'message:read'. Se emiten sin payload: el
  // servidor ya sabe de qué conversación es este socket.
  const ackDelivered = useCallback(() => { socketRef.current?.emit('message:delivered'); }, []);
  const ackRead = useCallback(() => {
    if (document.visibilityState === 'visible') socketRef.current?.emit('message:read');
  }, []);

  // Corta la llamada de voz en curso del lado del navegador (peer connection + micrófono +
  // timer) sin avisar al servidor — lo usan tanto "colgar" (que sí avisa, ver hangUp) como
  // cualquier evento que llegue del servidor diciendo que ya terminó por su cuenta
  // (call:end, call:error, ring timeout, etc.).
  const cleanupCall = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    callStreamRef.current?.getTracks().forEach((track) => track.stop());
    callStreamRef.current = null;
    if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }
    callIdRef.current = null;
    remoteDescSetRef.current = false;
    pendingCandidatesRef.current = [];
    setCallState('idle');
    setCallSeconds(0);
    setCallMuted(false);
  }, []);

  // 2. En cuanto se conoce la conversación, abre el socket para recibir respuestas del
  // agente (y el eco del propio mensaje) en vivo — el mismo socket se reusa para la
  // señalización de la llamada de voz (call:*), nunca una segunda conexión.
  useEffect(() => {
    if (!token || !conversationId) return;
    const socket = io(SOCKET_URL, { auth: { visitorToken: token, conversationId } });
    socketRef.current = socket;
    // Al conectar (primera vez, o reconexión tras un corte) confirma de una vez lo que ya
    // vino en el historial por HTTP — no solo lo que llegue de acá en adelante por socket.
    socket.on('connect', () => { ackDelivered(); ackRead(); });
    socket.on('message.created', (data: { message: WidgetMessage }) => {
      addMessage(data.message);
      // OUTBOUND = de la empresa al visitante (ver WidgetMessage) — nunca el eco del propio
      // mensaje que el visitante acaba de mandar.
      if (data.message.direction === 'OUTBOUND') {
        if (soundEnabledRef.current) playNotificationSound();
        ackDelivered();
        ackRead();
      }
    });
    socket.on('message.updated', (updated: WidgetMessage) => {
      setMessages((current) => current.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
    });
    socket.on('message.status', (data: { ids: string[]; status: string }) => {
      setMessages((current) => current.map((m) => (data.ids.includes(m.id) ? { ...m, status: data.status } : m)));
    });
    socket.on('agent:typing', (data: { typing: boolean }) => setAgentTyping(data.typing));
    socket.on('call:ringing', (data: { callId: string }) => { callIdRef.current = data.callId; });
    socket.on('call:accepted', (data: { callId: string }) => {
      const pc = pcRef.current;
      if (!pc || data.callId !== callIdRef.current) return;
      (async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call:signal', { callId: data.callId, type: 'offer', data: offer });
        setCallState('active');
        callTimerRef.current = setInterval(() => setCallSeconds((s) => s + 1), 1000);
      })();
    });
    socket.on('call:signal', (data: { callId: string; type: string; data: unknown }) => {
      const pc = pcRef.current;
      if (!pc || data.callId !== callIdRef.current) return;
      if (data.type === 'answer') {
        void (async () => {
          await pc.setRemoteDescription(data.data as RTCSessionDescriptionInit);
          remoteDescSetRef.current = true;
          const pending = pendingCandidatesRef.current;
          pendingCandidatesRef.current = [];
          for (const candidate of pending) await pc.addIceCandidate(candidate).catch(() => {});
        })();
      } else if (data.type === 'ice-candidate') {
        const candidate = data.data as RTCIceCandidateInit;
        if (remoteDescSetRef.current) void pc.addIceCandidate(candidate).catch(() => {});
        else pendingCandidatesRef.current.push(candidate);
      }
    });
    socket.on('call:end', (data: { callId: string }) => { if (data.callId === callIdRef.current) cleanupCall(); });
    socket.on('call:error', () => { setUploadError('No se pudo iniciar la llamada'); cleanupCall(); });
    return () => { socket.disconnect(); };
  }, [token, conversationId, addMessage, cleanupCall, ackDelivered, ackRead]);

  // Si el agente respondió mientras la pestaña estaba en segundo plano, ackRead() de arriba
  // ya se salteó el "leído" (solo confirma entrega) — esto lo completa apenas el visitante
  // vuelve a esta pestaña.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') ackRead(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [ackRead]);

  // Espera a que socketRef.current exista Y esté conectado — hace falta porque si todavía no
  // había conversación (visitante que quiere llamar sin haber escrito antes), recién se crea
  // dentro de startCall y el socket se abre después, en el otro efecto, cuando conversationId
  // cambie (un ciclo de render más tarde) — no sirve asumir que ya está listo acá mismo.
  const waitForSocketConnected = useCallback((timeoutMs = 8000): Promise<boolean> => {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (socketRef.current?.connected) return resolve(true);
        if (Date.now() - start > timeoutMs) return resolve(false);
        setTimeout(tick, 100);
      };
      tick();
    });
  }, []);

  // Llamada de voz saliente. Si el visitante todavía no escribió nada no hay conversación
  // (se crea recién al mandar un mensaje/media) — sin ella el socket no tiene a qué sala
  // unirse, así que primero se crea vía /calls (sin contar como mensaje no leído) y recién
  // ahí se abre el socket. Pide el micrófono antes que nada: si lo niega, no se llega a crear
  // ni conversación ni nada.
  const startCall = useCallback(async () => {
    if (!bootstrap?.allowCalls || !token || callState !== 'idle') return;
    setUploadError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      callStreamRef.current = stream;

      let convId = conversationId;
      if (!convId) {
        const result = await fetch(`${API_URL}/widget/${bootstrap.widgetPublicKey}/calls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        }).then((r) => {
          if (!r.ok) throw new Error('no se pudo iniciar la conversación');
          return r.json() as Promise<{ conversationId: string }>;
        });
        convId = result.conversationId;
        localStorage.setItem(storageKey(bootstrap.widgetPublicKey, 'conversation'), convId);
        setConversationId(convId);
      }

      const ready = socketRef.current?.connected || (await waitForSocketConnected());
      if (!ready || !socketRef.current) throw new Error('socket no conectado');

      remoteDescSetRef.current = false;
      pendingCandidatesRef.current = [];
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.onicecandidate = (e) => {
        if (e.candidate && callIdRef.current) socketRef.current?.emit('call:signal', { callId: callIdRef.current, type: 'ice-candidate', data: e.candidate });
      };
      pc.ontrack = (e) => { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0]; };
      setCallState('calling');
      socketRef.current.emit('call:invite');
    } catch {
      setUploadError('No se pudo iniciar la llamada');
      cleanupCall();
    }
  }, [bootstrap, token, conversationId, callState, cleanupCall, waitForSocketConnected]);

  const hangUp = useCallback(() => {
    if (callIdRef.current) socketRef.current?.emit('call:end', { callId: callIdRef.current });
    cleanupCall();
  }, [cleanupCall]);

  const toggleSound = useCallback(() => {
    if (!bootstrap) return;
    setSoundEnabled((prev) => {
      const next = !prev;
      writeSoundPref(storageKey(bootstrap.widgetPublicKey, 'sound'), next);
      return next;
    });
  }, [bootstrap]);

  const toggleCallMute = useCallback(() => {
    const stream = callStreamRef.current;
    if (!stream) return;
    const next = !callMuted;
    stream.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setCallMuted(next);
  }, [callMuted]);

  // Si el visitante cierra/navega fuera a mitad de una llamada, libera el micrófono y avisa
  // al servidor en vez de dejarla "colgada" hasta que el socket se desconecte solo.
  useEffect(() => () => {
    if (callIdRef.current) socketRef.current?.emit('call:end', { callId: callIdRef.current });
    pcRef.current?.close();
    callStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (callTimerRef.current) clearInterval(callTimerRef.current);
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  // Libera el micrófono y el timer si el visitante cierra/navega fuera con una grabación
  // a medias — si no, el navegador deja el ícono de "micrófono en uso" activo.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // Cierra el popover de emojis al tocar fuera de él.
  useEffect(() => {
    if (!showEmoji) return;
    const onClick = (e: MouseEvent) => { if (emojiBoxRef.current && !emojiBoxRef.current.contains(e.target as Node)) setShowEmoji(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showEmoji]);

  // Cierra el menú de "Editar/Eliminar" de un mensaje propio al tocar fuera de él.
  useEffect(() => {
    if (!menuMessageId) return;
    const onClick = (e: MouseEvent) => { if (msgMenuRef.current && !msgMenuRef.current.contains(e.target as Node)) setMenuMessageId(null); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuMessageId]);

  // Edición propia del visitante (solo mensajes de texto, como WhatsApp) — reemplaza la
  // burbuja por un formulario inline en vez de reusar el composer, para no perder lo que el
  // visitante esté escribiendo como mensaje nuevo.
  const startEdit = useCallback((message: WidgetMessage) => {
    setMenuMessageId(null);
    setEditingId(message.id);
    setEditingText(message.body || '');
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingText('');
  }, []);

  const saveEdit = useCallback(async () => {
    const text = editingText.trim();
    if (!text || !bootstrap || !token || !editingId || savingEdit) return;
    setSavingEdit(true);
    try {
      const updated = await fetch(`${API_URL}/widget/${bootstrap.widgetPublicKey}/messages/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, text }),
      }).then((r) => {
        if (!r.ok) throw new Error('edit failed');
        return r.json() as Promise<WidgetMessage>;
      });
      setMessages((current) => current.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
      setEditingId(null);
      setEditingText('');
    } catch {
      setUploadError('No se pudo editar el mensaje');
    } finally {
      setSavingEdit(false);
    }
  }, [editingText, bootstrap, token, editingId, savingEdit]);

  // "Eliminar" (delete for everyone), igual que WhatsApp: solo el propio mensaje del
  // visitante, borrado lógico reflejado también en vivo para el agente que lo esté viendo.
  const removeMessage = useCallback(async (message: WidgetMessage) => {
    setMenuMessageId(null);
    if (!bootstrap || !token) return;
    if (!(await confirm('¿Eliminar este mensaje? Esta acción no se puede deshacer.', { confirmText: 'Eliminar' }))) return;
    setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, deleted: true } : m)));
    try {
      const result = await fetch(`${API_URL}/widget/${bootstrap.widgetPublicKey}/messages/${message.id}?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
      if (!result.ok) throw new Error('delete failed');
    } catch {
      setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, deleted: false } : m)));
      setUploadError('No se pudo eliminar el mensaje');
    }
  }, [bootstrap, token, confirm]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !bootstrap || !token || sending) return;
    stopTyping();
    setSending(true);
    setDraft('');
    try {
      const result = await fetch(`${API_URL}/widget/${bootstrap.widgetPublicKey}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, text }),
      }).then((r) => {
        if (!r.ok) throw new Error('send failed');
        return r.json() as Promise<{ conversationId: string; message: WidgetMessage }>;
      });
      setConversationId(result.conversationId);
      addMessage(result.message);
      localStorage.setItem(storageKey(bootstrap.widgetPublicKey, 'conversation'), result.conversationId);
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  }, [draft, bootstrap, token, sending, addMessage, stopTyping]);

  const sendFile = useCallback(async (file: File) => {
    if (!bootstrap || !token) return;
    setUploadError('');
    if (file.size > MAX_FILE_BYTES) {
      setUploadError('El archivo supera 15 MB.');
      return;
    }
    if (!isAcceptedFile(file)) {
      setUploadError('Solo se aceptan imágenes, PDF, audio o video.');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('token', token);
      form.append('file', file);
      const result = await fetch(`${API_URL}/widget/${bootstrap.widgetPublicKey}/media`, { method: 'POST', body: form }).then((r) => {
        if (!r.ok) return r.json().then((body) => { throw new Error(body?.message || 'No se pudo enviar el archivo'); });
        return r.json() as Promise<{ conversationId: string; message: WidgetMessage }>;
      });
      setConversationId(result.conversationId);
      addMessage(result.message);
      localStorage.setItem(storageKey(bootstrap.widgetPublicKey, 'conversation'), result.conversationId);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'No se pudo enviar el archivo');
    } finally {
      setUploading(false);
    }
  }, [bootstrap, token, addMessage]);

  // Arrastrar y soltar un archivo sobre el panel — mismo patrón que la bandeja de agentes
  // (ver conversations/page.tsx onChatDragEnter/Drop): dragCounterRef cuenta la profundidad
  // de enter/leave porque esos eventos también disparan por cada elemento hijo cruzado, no
  // solo por el contenedor exterior.
  const onPanelDragEnter = useCallback((e: DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setDragActive(true);
  }, []);
  const onPanelDragOver = useCallback((e: DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
  }, []);
  const onPanelDragLeave = useCallback((e: DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragActive(false);
  }, []);
  const onPanelDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) void sendFile(file);
  }, [sendFile]);

  // Pegar una captura de pantalla (Ctrl+V) directo en el input, igual que en la bandeja de
  // agentes (ver conversations/page.tsx onComposerPaste).
  const onInputPaste = useCallback((e: ClipboardEvent) => {
    const item = Array.from(e.clipboardData?.items || []).find((entry) => entry.kind === 'file' && entry.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    void sendFile(new File([file], file.name || `captura-${Date.now()}.png`, { type: file.type }));
  }, [sendFile]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : 'audio/webm;codecs=opus';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      setUploadError('No se pudo acceder al micrófono');
    }
  }, []);

  const stopRecording = useCallback((confirmSend: boolean) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    const mimeType = recorder.mimeType;
    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (confirmSend && chunksRef.current.length) {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
        void sendFile(new File([blob], `nota-de-voz.${extension}`, { type: mimeType }));
      }
      chunksRef.current = [];
    };
    recorder.stop();
    mediaRecorderRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
  }, [sendFile]);

  const mediaSrc = useCallback((messageId: string) => {
    if (!bootstrap || !token) return '';
    return `${API_URL}/widget/${bootstrap.widgetPublicKey}/media/${messageId}?token=${encodeURIComponent(token)}`;
  }, [bootstrap, token]);

  const onEmojiClick = (data: EmojiClickData) => setDraft((current) => current + data.emoji);

  const gradient = useMemo(() => bootstrap ? `linear-gradient(135deg, ${bootstrap.color}, ${shade(bootstrap.color, -28)})` : undefined, [bootstrap]);

  if (notFound) {
    return <div className="cc-center">Este enlace de chat no está disponible.</div>;
  }
  if (!bootstrap) {
    return <div className="cc-center">Cargando…</div>;
  }

  const panel = (
    <div className="cc-panel" onDragEnter={onPanelDragEnter} onDragOver={onPanelDragOver} onDragLeave={onPanelDragLeave} onDrop={onPanelDrop}>
      {dragActive && (
        <div className="cc-drop-overlay">
          <div className="cc-drop-box"><Upload size={22} />Suelta el archivo para enviarlo</div>
        </div>
      )}
      <header className="cc-header" style={{ background: gradient }}>
        <div className="cc-header-row">
          <div className="cc-avatar">{initials(bootstrap.companyName)}</div>
          <div className="cc-header-info">
            <span className="cc-header-name">{bootstrap.companyName}</span>
            <span className="cc-header-status">
              {callState === 'calling' ? 'Llamando…'
                : callState === 'active' ? `En llamada · ${formatCallDuration(callSeconds)}`
                : agentTyping ? 'Escribiendo…'
                : 'Normalmente responde en minutos'}
            </span>
          </div>
          {bootstrap.allowCalls && token && (
            callState === 'idle' ? (
              <button className="cc-call-btn" aria-label="Llamar" title="Llamar" onClick={() => void startCall()}><Phone size={16} /></button>
            ) : (
              <>
                <button className="cc-call-btn" aria-label={callMuted ? 'Activar micrófono' : 'Silenciar'} onClick={toggleCallMute}>{callMuted ? <MicOff size={16} /> : <Mic size={16} />}</button>
                <button className="cc-call-btn cc-call-btn-end" aria-label="Colgar" onClick={hangUp}><PhoneOff size={16} /></button>
              </>
            )
          )}
          <button className="cc-call-btn" aria-label={soundEnabled ? 'Silenciar notificaciones' : 'Activar sonido'} title={soundEnabled ? 'Silenciar notificaciones' : 'Activar sonido'} onClick={toggleSound}>
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
        {embedded && (
          <button className="cc-close" aria-label="Cerrar chat" onClick={() => window.parent.postMessage({ type: 'clienera:close' }, '*')}>
            <X size={15} />
          </button>
        )}
      </header>
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />

      <div className="cc-body" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="cc-welcome">
            <div className="cc-welcome-icon" style={{ background: gradient }}><MessageCircle size={24} /></div>
            <div className="cc-welcome-title">{bootstrap.companyName}</div>
            <div className="cc-welcome-text">{bootstrap.welcomeMessage}</div>
          </div>
        )}
        {messages.map((message) => {
          const isVisitor = message.direction === 'INBOUND';
          const bubbleStyle = !isVisitor ? undefined : { background: gradient };
          const canManage = isVisitor && !message.deleted && editingId !== message.id;
          return (
            <div key={message.id} className={`cc-row ${isVisitor ? 'cc-row-visitor' : 'cc-row-agent'}`}>
              {!isVisitor && <div className="cc-bubble-avatar" style={{ background: bootstrap.color }}>{initials(bootstrap.companyName)}</div>}
              <div className="cc-msg-col">
                <div className="cc-msg-row">
                  {message.deleted ? (
                    <div className="cc-bubble cc-bubble-deleted"><Ban size={13} />Se eliminó este mensaje</div>
                  ) : editingId === message.id ? (
                    <div className="cc-bubble cc-bubble-edit" style={bubbleStyle}>
                      <textarea
                        className="cc-edit-input"
                        value={editingText}
                        autoFocus
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveEdit(); } else if (e.key === 'Escape') cancelEdit(); }}
                      />
                      <div className="cc-edit-actions">
                        <button className="cc-icon-btn" aria-label="Cancelar edición" onClick={cancelEdit}><X size={14} /></button>
                        <button className="cc-icon-btn" aria-label="Guardar edición" disabled={savingEdit || !editingText.trim()} onClick={() => void saveEdit()}><Check size={14} /></button>
                      </div>
                    </div>
                  ) : message.type === 'IMAGE' ? (
                    <div className={`cc-bubble cc-bubble-media ${message.status === 'QUEUED' ? 'cc-status-pending' : ''}`} style={bubbleStyle}>
                      <img className="cc-image" src={mediaSrc(message.id)} alt={message.caption || 'Imagen'} loading="lazy" />
                      {message.caption && <div className="cc-caption">{message.caption}</div>}
                    </div>
                  ) : message.type === 'VIDEO' ? (
                    <div className={`cc-bubble cc-bubble-media ${message.status === 'QUEUED' ? 'cc-status-pending' : ''}`} style={bubbleStyle}>
                      <video className="cc-video" controls src={mediaSrc(message.id)} />
                      {message.caption && <div className="cc-caption">{message.caption}</div>}
                    </div>
                  ) : message.type === 'AUDIO' ? (
                    <div className={`cc-bubble cc-bubble-media ${message.status === 'QUEUED' ? 'cc-status-pending' : ''}`} style={bubbleStyle}>
                      <audio className="cc-audio" controls src={mediaSrc(message.id)} />
                    </div>
                  ) : message.type === 'DOCUMENT' ? (
                    <a className={`cc-bubble cc-file ${message.status === 'QUEUED' ? 'cc-status-pending' : ''}`} style={bubbleStyle} href={mediaSrc(message.id)} target="_blank" rel="noreferrer">
                      <FileText size={22} />
                      <div className="cc-file-info">
                        <span className="cc-file-name">{message.fileName || 'Documento'}</span>
                        <span className="cc-file-size">{formatSize(message.fileSize)}</span>
                      </div>
                    </a>
                  ) : message.type === 'CALL' ? (
                    <div className="cc-bubble cc-call-bubble" style={bubbleStyle}>
                      <Phone size={14} />
                      {callLabel(message.metadata)}
                    </div>
                  ) : (
                    <div className={`cc-bubble ${message.status === 'QUEUED' ? 'cc-status-pending' : ''}`} style={bubbleStyle}>
                      {message.body}
                      {message.metadata?.edited && <span className="cc-edited-tag">editado</span>}
                    </div>
                  )}
                  {canManage && (
                    <div className="cc-msg-actions" ref={menuMessageId === message.id ? msgMenuRef : undefined}>
                      <button className="cc-icon-btn cc-msg-actions-trigger" aria-label="Opciones del mensaje" onClick={() => setMenuMessageId((current) => (current === message.id ? null : message.id))}>
                        <MoreVertical size={14} />
                      </button>
                      {menuMessageId === message.id && (
                        <div className="cc-msg-menu">
                          {message.type === 'TEXT' && <button onClick={() => startEdit(message)}><Pencil size={13} />Editar</button>}
                          <button className="danger" onClick={() => void removeMessage(message)}><Trash2 size={13} />Eliminar</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="cc-time">
                  {formatTime(message.createdAt)}
                  {isVisitor && !message.deleted && <span className="cc-ticks">{ticksIcon(message.status)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {uploadError && <div className="cc-error">{uploadError}</div>}

      <div className="cc-composer">
        {showEmoji && !recording && (
          <div className="cc-emoji-box" ref={emojiBoxRef}>
            <EmojiPicker onEmojiClick={onEmojiClick} width={290} height={340} searchDisabled lazyLoadEmojis emojiData={emojiDataEs} />
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          style={{ display: 'none' }}
          onChange={(e) => { const file = e.target.files?.[0]; if (file) void sendFile(file); e.target.value = ''; }}
        />
        {recording ? (
          <div className="cc-recording">
            <span className="cc-recording-dot" />
            <span>Grabando · {formatRecordTime(recordSeconds)}</span>
            <button className="cc-icon-btn" aria-label="Cancelar grabación" onClick={() => stopRecording(false)}><Trash2 size={17} /></button>
          </div>
        ) : (
          <>
            <button className="cc-icon-btn" aria-label="Emojis" onClick={() => setShowEmoji((v) => !v)}><Smile size={19} /></button>
            <button className="cc-icon-btn" aria-label="Adjuntar archivo" disabled={uploading} onClick={() => fileInputRef.current?.click()}><Paperclip size={19} /></button>
            <input
              className="cc-input"
              style={{ ['--cc-color' as string]: bootstrap.color }}
              placeholder="Escribe un mensaje..."
              value={draft}
              onChange={(e) => { const value = e.target.value; setDraft(value); if (value.trim()) notifyTyping(); else stopTyping(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
              onPaste={onInputPaste}
            />
          </>
        )}
        {recording ? (
          <button className="cc-send" style={{ background: bootstrap.color }} onClick={() => stopRecording(true)} title="Enviar nota de voz"><Square size={14} /></button>
        ) : draft.trim() ? (
          <button className="cc-send" style={{ background: bootstrap.color }} disabled={sending} onClick={() => void send()}><Send size={16} /></button>
        ) : (
          <button className="cc-send" style={{ background: bootstrap.color }} onClick={() => void startRecording()} title="Grabar nota de voz"><Mic size={16} /></button>
        )}
      </div>
      <div className="cc-footer">Impulsado por <span className="cc-footer-mark"><ClieneraMark size={13} /><strong>Clienera</strong></span></div>
    </div>
  );

  if (embedded) return <div className="cc-root">{panel}</div>;
  return <div className="cc-root cc-standalone">{panel}</div>;
}
