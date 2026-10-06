'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import dynamic from 'next/dynamic';
import { FileText, MessageCircle, Paperclip, Send, Smile, X } from 'lucide-react';
import type { EmojiClickData } from 'emoji-picker-react';
import { ClieneraMark } from '@/components/brand-mark';
import './chat.css';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
const ACCEPTED_FILE_TYPES = 'image/jpeg,image/png,image/gif,image/webp,application/pdf';
const MAX_FILE_BYTES = 15 * 1024 * 1024;

type Bootstrap = { widgetPublicKey: string; companyName: string; welcomeMessage: string; color: string; buttonText: string; autoOpen: boolean };
type WidgetMessage = {
  id: string; direction: 'INBOUND' | 'OUTBOUND'; type: string; status: string; body?: string | null;
  caption?: string | null; fileName?: string | null; mimeType?: string | null; fileSize?: number | null; createdAt: string;
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
  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiBoxRef = useRef<HTMLDivElement>(null);

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
        if (embedded) {
          window.parent.postMessage({ type: 'clienera:ready', ...data }, '*');
        }

        const storedToken = localStorage.getItem(storageKey(data.widgetPublicKey, 'token'));
        const session = await fetch(`${API_URL}/widget/${data.widgetPublicKey}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: storedToken || undefined }),
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

  // 2. En cuanto se conoce la conversación, abre el socket para recibir respuestas del
  // agente (y el eco del propio mensaje) en vivo.
  useEffect(() => {
    if (!token || !conversationId) return;
    const socket = io(SOCKET_URL, { auth: { visitorToken: token, conversationId } });
    socketRef.current = socket;
    socket.on('message.created', (data: { message: WidgetMessage }) => addMessage(data.message));
    socket.on('message.updated', (updated: WidgetMessage) => {
      setMessages((current) => current.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
    });
    return () => { socket.disconnect(); };
  }, [token, conversationId, addMessage]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  // Cierra el popover de emojis al tocar fuera de él.
  useEffect(() => {
    if (!showEmoji) return;
    const onClick = (e: MouseEvent) => { if (emojiBoxRef.current && !emojiBoxRef.current.contains(e.target as Node)) setShowEmoji(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showEmoji]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !bootstrap || !token || sending) return;
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
  }, [draft, bootstrap, token, sending, addMessage]);

  const sendFile = useCallback(async (file: File) => {
    if (!bootstrap || !token) return;
    setUploadError('');
    if (file.size > MAX_FILE_BYTES) {
      setUploadError('El archivo supera 15 MB.');
      return;
    }
    if (!ACCEPTED_FILE_TYPES.split(',').includes(file.type)) {
      setUploadError('Solo se aceptan imágenes (JPG, PNG, GIF, WEBP) o PDF.');
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
    <div className="cc-panel">
      <header className="cc-header" style={{ background: gradient }}>
        <div className="cc-header-row">
          <div className="cc-avatar">{initials(bootstrap.companyName)}</div>
          <div className="cc-header-info">
            <span className="cc-header-name">{bootstrap.companyName}</span>
            <span className="cc-header-status">Normalmente responde en minutos</span>
          </div>
        </div>
        {embedded && (
          <button className="cc-close" aria-label="Cerrar chat" onClick={() => window.parent.postMessage({ type: 'clienera:close' }, '*')}>
            <X size={15} />
          </button>
        )}
      </header>

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
          return (
            <div key={message.id} className={`cc-row ${isVisitor ? 'cc-row-visitor' : 'cc-row-agent'}`}>
              {!isVisitor && <div className="cc-bubble-avatar" style={{ background: bootstrap.color }}>{initials(bootstrap.companyName)}</div>}
              <div>
                {message.type === 'IMAGE' ? (
                  <div className={`cc-bubble cc-bubble-media ${message.status === 'QUEUED' ? 'cc-status-pending' : ''}`} style={bubbleStyle}>
                    <img className="cc-image" src={mediaSrc(message.id)} alt={message.caption || 'Imagen'} loading="lazy" />
                    {message.caption && <div className="cc-caption">{message.caption}</div>}
                  </div>
                ) : message.type === 'DOCUMENT' ? (
                  <a className={`cc-bubble cc-file ${message.status === 'QUEUED' ? 'cc-status-pending' : ''}`} style={bubbleStyle} href={mediaSrc(message.id)} target="_blank" rel="noreferrer">
                    <FileText size={22} />
                    <div className="cc-file-info">
                      <span className="cc-file-name">{message.fileName || 'Documento'}</span>
                      <span className="cc-file-size">{formatSize(message.fileSize)}</span>
                    </div>
                  </a>
                ) : (
                  <div className={`cc-bubble ${message.status === 'QUEUED' ? 'cc-status-pending' : ''}`} style={bubbleStyle}>
                    {message.body}
                  </div>
                )}
                <div className="cc-time">{formatTime(message.createdAt)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {uploadError && <div className="cc-error">{uploadError}</div>}

      <div className="cc-composer">
        {showEmoji && (
          <div className="cc-emoji-box" ref={emojiBoxRef}>
            <EmojiPicker onEmojiClick={onEmojiClick} width={290} height={340} searchDisabled lazyLoadEmojis />
          </div>
        )}
        <button className="cc-icon-btn" aria-label="Emojis" onClick={() => setShowEmoji((v) => !v)}><Smile size={19} /></button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          style={{ display: 'none' }}
          onChange={(e) => { const file = e.target.files?.[0]; if (file) void sendFile(file); e.target.value = ''; }}
        />
        <button className="cc-icon-btn" aria-label="Adjuntar archivo" disabled={uploading} onClick={() => fileInputRef.current?.click()}><Paperclip size={19} /></button>
        <input
          className="cc-input"
          style={{ ['--cc-color' as string]: bootstrap.color }}
          placeholder="Escribe un mensaje..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
        />
        <button className="cc-send" style={{ background: bootstrap.color }} disabled={sending || !draft.trim()} onClick={() => void send()}>
          <Send size={16} />
        </button>
      </div>
      <div className="cc-footer">Impulsado por <span className="cc-footer-mark"><ClieneraMark size={13} /><strong>Clienera</strong></span></div>
    </div>
  );

  if (embedded) return <div className="cc-root">{panel}</div>;
  return <div className="cc-root cc-standalone">{panel}</div>;
}
