'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { AlertCircle, AlertTriangle, Check, CheckCheck, ChevronDown, Clock, Copy, Forward, Lightbulb, MessageCircle, Mic, MoreHorizontal, Paperclip, Phone, Pin, Search, Send, Smile, Square, StickyNote, Star, Trash2, Users, UserRoundCheck, X, ZoomIn } from 'lucide-react';
import { io } from 'socket.io-client';
import type { EmojiClickData } from 'emoji-picker-react';
import { AppShell } from '@/components/app-shell';
import { apiFetch, getToken, mediaUrl, SOCKET_URL } from '@/lib/api';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

type Contact = { id: string; name?: string | null; pushName?: string | null; phone?: string | null; waId: string; notes?: string | null };
type Author = { id: string; name?: string | null; pushName?: string | null };
type Conversation = {
  id: string;
  status: string;
  pinned: boolean;
  unreadCount: number;
  lastMessageAt: string;
  contact: Contact;
  assignedUser?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  instance: { id: string; name: string; slug: string; status: string };
  messages: Array<{ id: string; body?: string | null; caption?: string | null; type: string; direction: string; status: string; createdAt: string; author?: Author | null }>;
};
type Message = { id: string; body?: string | null; caption?: string | null; type: string; direction: string; status: string; createdAt: string; fileName?: string | null; mimeType?: string | null; author?: Author | null; pinned: boolean; starred: boolean };
type TeamUser = { id: string; name: string; email: string; role: string; active: boolean };
type Department = { id: string; name: string; active: boolean; users?: Array<{ user: { id: string } }> };
type Project = { id: string; name: string; active: boolean };
type IncidentType = 'SUGGESTION' | 'BUG' | 'OTHER';
type IncidentStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';
type Incident = {
  id: string;
  type: IncidentType;
  status: IncidentStatus;
  subject: string;
  message: string;
  createdAt: string;
  conversation: { id: string };
  department: { id: string; name: string };
  createdByUser: { id: string; name: string };
};

const INCIDENT_TYPES: Array<{ id: IncidentType; label: string; icon: typeof Lightbulb }> = [
  { id: 'BUG', label: 'Error', icon: AlertTriangle },
  { id: 'SUGGESTION', label: 'Sugerencia', icon: Lightbulb },
  { id: 'OTHER', label: 'Otro', icon: MessageCircle },
];
const incidentStatusLabels: Record<IncidentStatus, string> = { PENDING: 'Pendiente', IN_PROGRESS: 'En proceso', RESOLVED: 'Solucionado' };

function sortConversations(list: Conversation[]) {
  return [...list].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()));
}
function isGroupContact(contact: Contact) {
  return contact.waId.endsWith('@g.us');
}
function displayName(contact: Contact) {
  return contact.name || contact.pushName || contact.phone || contact.waId.split('@')[0] || 'Cliente';
}
function authorName(author?: Author | null) {
  return author ? author.name || author.pushName || null : null;
}
function initials(contact: Contact) {
  const name = displayName(contact);
  return name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}
function avatarContent(contact: Contact, iconSize = 16) {
  return isGroupContact(contact) ? <Users size={iconSize} /> : initials(contact);
}
function lastText(conversation: Conversation) {
  const message = conversation.messages[0];
  if (!message) return 'Sin mensajes';
  const prefix = authorName(message.author) ? `${authorName(message.author)}: ` : '';
  if (message.body || message.caption) return prefix + (message.body || message.caption);
  switch (message.type) {
    case 'IMAGE': return prefix + '📷 Foto';
    case 'VIDEO': return prefix + '🎥 Video';
    case 'AUDIO': return prefix + '🎤 Audio';
    case 'DOCUMENT': return prefix + '📄 Documento';
    case 'STICKER': return prefix + '😀 Sticker';
    default: return prefix + message.type;
  }
}
function statusIcon(status: string) {
  const labels: Record<string, string> = {
    READ: 'Leído', DELIVERED: 'Entregado', SENT: 'Enviado',
    FAILED: 'No se pudo enviar', QUEUED: 'Enviando...', PROCESSING: 'Enviando...',
  };
  const icon = status === 'READ' ? <CheckCheck size={12} className="status-read" />
    : status === 'DELIVERED' ? <CheckCheck size={12} />
    : status === 'SENT' ? <Check size={12} />
    : status === 'FAILED' ? <AlertCircle size={11} className="status-failed" />
    : <Clock size={10} />;
  return <span title={labels[status] || status}>{icon}</span>;
}
function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
// WhatsApp's own lightweight markup: *bold*, _italic_, ~strikethrough~, ```monospace```, plus bare URLs.
const FORMAT_PATTERN = /(https?:\/\/[^\s]+)|\*([^\n*]+)\*|_([^\n_]+)_|~([^\n~]+)~|```([^`]+)```/g;
function formatMessageText(text: string) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  FORMAT_PATTERN.lastIndex = 0;
  while ((match = FORMAT_PATTERN.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const [full, url, bold, italic, strike, mono] = match;
    if (url) nodes.push(<a key={key++} href={url} target="_blank" rel="noreferrer" className="message-link">{url}</a>);
    else if (bold !== undefined) nodes.push(<strong key={key++}>{bold}</strong>);
    else if (italic !== undefined) nodes.push(<em key={key++}>{italic}</em>);
    else if (strike !== undefined) nodes.push(<s key={key++}>{strike}</s>);
    else if (mono !== undefined) nodes.push(<code key={key++}>{mono}</code>);
    lastIndex = match.index + full.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
function isImageFile(file: File) { return file.type.startsWith('image/'); }
function isVideoFile(file: File) { return file.type.startsWith('video/'); }

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [identity, setIdentity] = useState({ id: '', role: '' });

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiPos, setEmojiPos] = useState<{ top: number; left: number } | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPopoverRef = useRef<HTMLDivElement>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const [openMessageMenuId, setOpenMessageMenuId] = useState<string | null>(null);
  const [messageMenuPos, setMessageMenuPos] = useState<{ top: number; left: number } | null>(null);
  const messageMenuButtonRef = useRef<HTMLElement | null>(null);
  const messageMenuRef = useRef<HTMLDivElement>(null);
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);
  const [forwardSearch, setForwardSearch] = useState('');
  const [notesDraft, setNotesDraft] = useState('');

  const [incidentModal, setIncidentModal] = useState(false);
  const [incidentType, setIncidentType] = useState<IncidentType>('BUG');
  const [incidentDepartmentId, setIncidentDepartmentId] = useState('');
  const [incidentSubject, setIncidentSubject] = useState('');
  const [incidentMessage, setIncidentMessage] = useState('');
  const [incidentSaving, setIncidentSaving] = useState(false);
  const [incidentError, setIncidentError] = useState('');
  const [incidentSent, setIncidentSent] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageStreamRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const data = await apiFetch<Conversation[]>('/conversations');
      setConversations(sortConversations(data));
      setSelectedId((current) => current || data[0]?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las conversaciones');
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      setMessages(await apiFetch<Message[]>(`/conversations/${conversationId}/messages`));
      setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, unreadCount: 0 } : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron cargar los mensajes'); }
  }, []);

  useEffect(() => {
    void loadConversations();
    void Promise.all([apiFetch<TeamUser[]>('/team/users'), apiFetch<Department[]>('/team/departments'), apiFetch<Project[]>('/team/projects'), apiFetch<Incident[]>('/incidents')])
      .then(([users, deps, projs, incs]) => { setTeamUsers(users.filter((user) => user.active)); setDepartments(deps.filter((dep) => dep.active)); setProjects(projs.filter((p) => p.active)); setIncidents(incs); })
      .catch(() => undefined);
  }, [loadConversations]);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('brainwsp_user') || '{}');
      setIdentity({ id: String(user.id || ''), role: String(user.role || '') });
    } catch {}
  }, []);
  useEffect(() => { if (selectedId) void loadMessages(selectedId); }, [selectedId, loadMessages]);

  // Land ready to type the moment an agent opens/switches a conversation, same as WhatsApp Web.
  useEffect(() => {
    if (!selectedId) return;
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [selectedId]);

  // Keep a single socket alive for the component's lifetime. Recreating it on every
  // conversation switch (previously a `[selectedId]` dependency) meant a full
  // disconnect/reconnect on each click, and any event arriving during that gap was lost.
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { token: getToken() } });
    socket.on('message.created', (event: { message: Message; conversation: Conversation }) => {
      setConversations((current) => {
        const found = current.find((item) => item.id === event.conversation.id);
        const unread = selectedIdRef.current === event.conversation.id
          ? 0
          : (found?.unreadCount || 0) + (event.message.direction === 'INBOUND' ? 1 : 0);
        const next: Conversation = found
          ? { ...found, unreadCount: unread, lastMessageAt: event.message.createdAt, messages: [event.message] }
          : { ...event.conversation, unreadCount: unread, messages: [event.message] };
        return sortConversations([next, ...current.filter((item) => item.id !== next.id)]);
      });
      if (selectedIdRef.current === event.conversation.id) {
        setMessages((current) => current.some((item) => item.id === event.message.id) ? current : [...current, event.message]);
      }
    });
    socket.on('conversation.updated', (updated: Conversation) => {
      setConversations((current) => sortConversations(current.map((item) => item.id === updated.id ? { ...item, ...updated } : item)));
    });
    socket.on('message.updated', () => {
      if (selectedIdRef.current) void loadMessages(selectedIdRef.current);
    });
    return () => { socket.disconnect(); };
  }, [loadMessages]);

  // Keep the thread pinned to the latest message — on conversation switch and on every new message.
  useEffect(() => {
    const el = messageStreamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // The emoji picker is teleported to a portal on <body> with `position: fixed`,
  // positioned from the toggle button's own coordinates — `.chat-layout` clips
  // overflow (needed for the message scroll fix), so an absolutely-positioned
  // popover nested inside it gets its emoji grid cut off and unclickable.
  useEffect(() => {
    if (!showEmoji) { setEmojiPos(null); return; }
    const button = emojiButtonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      setEmojiPos({ top: rect.top, left: rect.left });
    }
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (emojiPopoverRef.current?.contains(target) || emojiButtonRef.current?.contains(target)) return;
      setShowEmoji(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showEmoji]);

  // Same portal + fixed-position approach as the emoji picker above, for the same reason:
  // `.chat-layout` clips overflow, so a per-message dropdown positioned inside it would
  // get its options cut off and unclickable, exactly like the emoji grid did.
  useEffect(() => {
    if (!openMessageMenuId) { setMessageMenuPos(null); return; }
    const button = messageMenuButtonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      setMessageMenuPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 220) });
    }
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (messageMenuRef.current?.contains(target) || messageMenuButtonRef.current?.contains(target)) return;
      setOpenMessageMenuId(null);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [openMessageMenuId]);

  // Esc closes whichever popover/overlay is currently on top — emoji picker, message
  // actions menu, forward dialog, image lightbox — same as WhatsApp Web.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openMessageMenuId) { setOpenMessageMenuId(null); return; }
      if (showEmoji) { setShowEmoji(false); return; }
      if (forwardMessageId) { setForwardMessageId(null); return; }
      if (lightboxUrl) { setLightboxUrl(null); return; }
      if (incidentModal) { setIncidentModal(false); return; }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openMessageMenuId, showEmoji, forwardMessageId, lightboxUrl, incidentModal]);

  // Revoke the local object URL used for the attach preview once it's no longer shown.
  useEffect(() => () => { if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl); }, [pendingPreviewUrl]);
  useEffect(() => () => { streamRef.current?.getTracks().forEach((track) => track.stop()); if (timerRef.current) clearInterval(timerRef.current); }, []);

  const selected = conversations.find((item) => item.id === selectedId) || null;
  const filtered = useMemo(() => conversations.filter((item) =>
    `${displayName(item.contact)} ${item.contact.phone || ''} ${lastText(item)}`.toLowerCase().includes(search.toLowerCase())
    && (!filterAgent || (filterAgent === 'unassigned' ? !item.assignedUser : item.assignedUser?.id === filterAgent))
    && (!filterDept || item.department?.id === filterDept)
    && (!filterProject || item.project?.id === filterProject)
  ), [conversations, search, filterAgent, filterDept, filterProject]);
  const hasActiveFilters = !!(filterAgent || filterDept || filterProject);

  const isAdmin = identity.role === 'OWNER' || identity.role === 'ADMIN';
  const myDepartmentIds = useMemo(() => new Set(
    departments.filter((department) => department.users?.some((item) => item.user.id === identity.id)).map((department) => department.id),
  ), [departments, identity.id]);
  const canManageIncident = useCallback((incident: Incident) => isAdmin || myDepartmentIds.has(incident.department.id), [isAdmin, myDepartmentIds]);
  const conversationIncidents = useMemo(() => incidents.filter((incident) => incident.conversation.id === selectedId), [incidents, selectedId]);

  useEffect(() => { setNotesDraft(selected?.contact.notes || ''); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickFile = () => fileInputRef.current?.click();

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) attachFile(file);
  };

  const removePendingFile = () => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingFile(null);
    setPendingPreviewUrl(null);
  };

  const attachFile = (file: File) => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingFile(file);
    setPendingPreviewUrl(isImageFile(file) || isVideoFile(file) ? URL.createObjectURL(file) : null);
  };

  // Lets agents paste a screenshot (Ctrl+V) straight into the composer, same as WhatsApp Web.
  const onComposerPaste = (e: ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((entry) => entry.kind === 'file' && entry.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    attachFile(new File([file], file.name || `captura-${Date.now()}.png`, { type: file.type }));
  };

  const insertEmoji = (data: EmojiClickData) => {
    const textarea = textareaRef.current;
    if (!textarea) { setText((current) => current + data.emoji); return; }
    const start = textarea.selectionStart ?? text.length;
    const end = textarea.selectionEnd ?? text.length;
    const next = text.slice(0, start) + data.emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const caret = start + data.emoji.length;
      textarea.setSelectionRange(caret, caret);
    });
  };

  const sendMediaFile = async (file: File, opts: { caption?: string; ptt?: boolean } = {}) => {
    if (!selectedId || sending) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (opts.caption) formData.append('caption', opts.caption);
      formData.append('ptt', opts.ptt ? 'true' : 'false');
      const created = await apiFetch<Message>(`/conversations/${selectedId}/messages/media`, { method: 'POST', body: formData });
      setMessages((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
      void loadConversations();
      removePendingFile();
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el archivo');
    } finally { setSending(false); }
  };

  const send = async () => {
    if (!selectedId || sending) return;
    if (pendingFile) { await sendMediaFile(pendingFile, { caption: text.trim() || undefined }); return; }
    if (!text.trim()) return;
    const body = text.trim();
    setText('');
    setSending(true);
    try {
      const created = await apiFetch<Message>(`/conversations/${selectedId}/messages`, { method: 'POST', body: JSON.stringify({ message: body }) });
      setMessages((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
      void loadConversations();
    } catch (err) {
      setText(body);
      setError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje');
    } finally { setSending(false); }
  };

  const startRecording = async () => {
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
      setError('No se pudo acceder al micrófono');
    }
  };

  const stopRecording = (confirmSend: boolean) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    const mimeType = recorder.mimeType;
    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (confirmSend && chunksRef.current.length) {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `nota-de-voz.${extension}`, { type: mimeType });
        void sendMediaFile(file, { ptt: true });
      }
      chunksRef.current = [];
    };
    recorder.stop();
    mediaRecorderRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
  };

  const take = async () => {
    if (!selectedId) return;
    try { await apiFetch(`/conversations/${selectedId}/take`, { method: 'POST' }); await loadConversations(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo asignar'); }
  };

  const openIncidentModal = () => {
    setIncidentType('BUG');
    setIncidentDepartmentId(selected?.department?.id || '');
    setIncidentSubject('');
    setIncidentMessage('');
    setIncidentError('');
    setIncidentSent(false);
    setIncidentModal(true);
  };

  const closeIncidentModal = () => setIncidentModal(false);

  const submitIncident = async () => {
    if (!selectedId) return;
    if (!incidentDepartmentId) { setIncidentError('Selecciona el área que debe atender la incidencia'); return; }
    if (!incidentSubject.trim() || !incidentMessage.trim()) { setIncidentError('Completa el asunto y el detalle'); return; }
    setIncidentSaving(true);
    setIncidentError('');
    try {
      const created = await apiFetch<Incident>('/incidents', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: selectedId,
          departmentId: incidentDepartmentId,
          type: incidentType,
          subject: incidentSubject.trim(),
          message: incidentMessage.trim(),
        }),
      });
      setIncidents((current) => [created, ...current]);
      setIncidentSent(true);
    } catch (err) {
      setIncidentError(err instanceof Error ? err.message : 'No se pudo crear la incidencia');
    } finally {
      setIncidentSaving(false);
    }
  };

  const updateAssignment = async (field: 'assignedUserId' | 'departmentId' | 'projectId', value: string) => {
    if (!selectedId) return;
    try {
      await apiFetch(`/conversations/${selectedId}`, { method: 'PATCH', body: JSON.stringify({ [field]: value || null }) });
      await loadConversations();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo transferir la conversación'); }
  };

  const updateIncidentStatus = async (incident: Incident, status: IncidentStatus) => {
    setIncidents((current) => current.map((item) => item.id === incident.id ? { ...item, status } : item));
    try {
      await apiFetch(`/incidents/${incident.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    } catch (err) {
      setIncidents((current) => current.map((item) => item.id === incident.id ? { ...item, status: incident.status } : item));
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la incidencia');
    }
  };

  const toggleConversationPin = async (e: { stopPropagation: () => void }, conversation: Conversation) => {
    e.stopPropagation();
    const pinned = !conversation.pinned;
    setConversations((current) => sortConversations(current.map((item) => item.id === conversation.id ? { ...item, pinned } : item)));
    try {
      await apiFetch(`/conversations/${conversation.id}`, { method: 'PATCH', body: JSON.stringify({ pinned }) });
    } catch (err) {
      setConversations((current) => sortConversations(current.map((item) => item.id === conversation.id ? { ...item, pinned: !pinned } : item)));
      setError(err instanceof Error ? err.message : 'No se pudo fijar la conversación');
    }
  };

  const toggleMessageMenu = (e: { currentTarget: HTMLElement }, messageId: string) => {
    if (openMessageMenuId === messageId) { setOpenMessageMenuId(null); return; }
    messageMenuButtonRef.current = e.currentTarget;
    setOpenMessageMenuId(messageId);
  };

  const copyMessageText = async (message: Message) => {
    const text = message.body || message.caption || '';
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch { setError('No se pudo copiar el texto'); }
    setOpenMessageMenuId(null);
  };

  const toggleFlag = async (message: Message, field: 'pinned' | 'starred') => {
    if (!selectedId) return;
    setOpenMessageMenuId(null);
    const value = !message[field];
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, [field]: value } : item));
    try {
      await apiFetch(`/conversations/${selectedId}/messages/${message.id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) });
    } catch (err) {
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, [field]: !value } : item));
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el mensaje');
    }
  };

  const saveNotes = async (value: string) => {
    if (!selectedId) return;
    try {
      await apiFetch(`/conversations/${selectedId}/notes`, { method: 'PATCH', body: JSON.stringify({ notes: value }) });
      setConversations((current) => current.map((item) => item.id === selectedId ? { ...item, contact: { ...item.contact, notes: value } } : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar la nota'); }
  };

  const addToNote = (message: Message) => {
    const text = message.body || message.caption || '';
    if (!text) { setOpenMessageMenuId(null); return; }
    const next = notesDraft ? `${notesDraft}\n${text}` : text;
    setNotesDraft(next);
    void saveNotes(next);
    setOpenMessageMenuId(null);
  };

  const openForward = (messageId: string) => {
    setForwardMessageId(messageId);
    setForwardSearch('');
    setOpenMessageMenuId(null);
  };

  const confirmForward = async (targetConversationId: string) => {
    if (!selectedId || !forwardMessageId) return;
    try {
      await apiFetch(`/conversations/${selectedId}/messages/${forwardMessageId}/forward`, { method: 'POST', body: JSON.stringify({ targetConversationId }) });
      void loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reenviar el mensaje');
    } finally {
      setForwardMessageId(null);
    }
  };

  const renderMessageBody = (message: Message) => {
    switch (message.type) {
      case 'IMAGE':
        return <div className="message-media"><button className="media-zoom" onClick={() => setLightboxUrl(mediaUrl(message.id))} title="Ampliar imagen"><img src={mediaUrl(message.id)} alt={message.caption || 'Imagen'} /><span className="media-zoom-hint"><ZoomIn size={15} /></span></button>{message.caption && <div className="media-caption">{formatMessageText(message.caption)}</div>}</div>;
      case 'VIDEO':
        return <div className="message-media"><video controls src={mediaUrl(message.id)} />{message.caption && <div className="media-caption">{formatMessageText(message.caption)}</div>}</div>;
      case 'AUDIO':
        return <audio controls src={mediaUrl(message.id)} className="message-audio" />;
      case 'DOCUMENT':
        return <a className="doc-link" href={mediaUrl(message.id)} target="_blank" rel="noreferrer">📄 {message.fileName || 'Documento'}</a>;
      case 'STICKER':
        return <img className="message-sticker" src={mediaUrl(message.id)} alt="Sticker" />;
      default:
        return formatMessageText(message.body || message.caption || message.type);
    }
  };

  return (
    <>
    <AppShell title="Conversaciones" subtitle="Bandeja en tiempo real para agentes">
      {error && <div className="error-box">{error}</div>}
      <section className="chat-layout">
        <aside className="chat-list">
          <div className="chat-list-head">
            <h2>Conversaciones</h2>
            <div className="searchbox"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..." /></div>
            <div className="chat-filters">
              <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}>
                <option value="">Todos los agentes</option>
                <option value="unassigned">Sin asignar</option>
                {teamUsers.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}
              </select>
              <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                <option value="">Todos los departamentos</option>
                {departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}
              </select>
              <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
                <option value="">Todos los proyectos</option>
                {projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
              </select>
              {hasActiveFilters && <button className="filter-clear" onClick={() => { setFilterAgent(''); setFilterDept(''); setFilterProject(''); }}>Limpiar filtros</button>}
            </div>
          </div>
          <div className="chat-list-scroll">
            {filtered.map((conversation) => (
              <button className={`chat-row ${selectedId === conversation.id ? 'active' : ''} ${conversation.pinned ? 'pinned' : ''}`} key={conversation.id} onClick={() => setSelectedId(conversation.id)}>
                <div className="chat-avatar">{avatarContent(conversation.contact)}</div>
                <div className="chat-copy"><strong>{displayName(conversation.contact)}</strong><span>{lastText(conversation)}</span></div>
                <div>
                  <div className="chat-time">{new Date(conversation.lastMessageAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</div>
                  {conversation.unreadCount > 0 && <div className="chat-unread">{conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}</div>}
                </div>
                <span
                  className="chat-pin-toggle"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => void toggleConversationPin(e, conversation)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void toggleConversationPin(e, conversation); } }}
                  title={conversation.pinned ? 'Desfijar chat' : 'Fijar chat'}
                ><Pin size={13} /></span>
              </button>
            ))}
          </div>
        </aside>

        <div className="chat-main">
          {selected ? <>
            <header className="chat-header"><div className="chat-avatar">{avatarContent(selected.contact, 17)}</div><div className="chat-header-copy"><strong>{displayName(selected.contact)}</strong><span>{selected.instance.status === 'CONNECTED' ? `● ${selected.instance.name} conectado` : `${selected.instance.name} · ${selected.instance.status}`}</span></div>{!selected.assignedUser && <button className="button small" onClick={() => void take()}><UserRoundCheck size={14} />Tomar conversación</button>}<button className="button small" onClick={openIncidentModal} title="Reportar una incidencia de este cliente"><AlertTriangle size={14} />Incidencia</button>{selected.contact.phone ? <a className="icon-button" href={`tel:${selected.contact.phone}`} title={`Llamar a ${selected.contact.phone}`}><Phone size={16} /></a> : <button className="icon-button" disabled title="No hay un número de teléfono para este contacto"><Phone size={16} /></button>}<button className="icon-button"><MoreHorizontal size={17} /></button></header>
            <div className="message-stream" ref={messageStreamRef}>
              {messages.map((message) => (
                <div className={`message-bubble ${message.direction === 'OUTBOUND' ? 'out' : ''}`} key={message.id}>
                  <button className="message-menu-trigger" onClick={(e) => toggleMessageMenu(e, message.id)} title="Más opciones"><ChevronDown size={13} /></button>
                  {message.direction === 'INBOUND' && authorName(message.author) && <div className="message-author">{authorName(message.author)}</div>}
                  {renderMessageBody(message)}
                  <div className="message-time">
                    {message.pinned && <Pin size={10} className="message-badge-pin" />}
                    {message.starred && <Star size={10} className="message-badge-star" />}
                    {new Date(message.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                    {message.direction === 'OUTBOUND' && statusIcon(message.status)}
                  </div>
                </div>
              ))}
            </div>

            {pendingFile && (
              <div className="composer-preview">
                {pendingPreviewUrl && isImageFile(pendingFile) && <img src={pendingPreviewUrl} alt="preview" />}
                {pendingPreviewUrl && isVideoFile(pendingFile) && <video src={pendingPreviewUrl} muted />}
                {!pendingPreviewUrl && <span className="composer-preview-name">📎 {pendingFile.name}</span>}
                <button className="icon-button ghost" onClick={removePendingFile}><X size={14} /></button>
              </div>
            )}

            <div className="chat-composer">
              <input ref={fileInputRef} type="file" hidden accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx" onChange={onFileChange} />
              {recording ? (
                <div className="recording-indicator">
                  <span className="recording-dot" />
                  <span>Grabando · {formatTime(recordSeconds)}</span>
                  <button className="icon-button ghost" onClick={() => stopRecording(false)}><Trash2 size={16} /></button>
                </div>
              ) : (
                <>
                  <button className="icon-button ghost" onClick={pickFile} title="Adjuntar archivo"><Paperclip size={17} /></button>
                  <button ref={emojiButtonRef} className="icon-button ghost" onClick={() => setShowEmoji((v) => !v)} title="Emojis"><Smile size={17} /></button>
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    placeholder={pendingFile ? 'Agrega un mensaje (opcional)...' : 'Escribe un mensaje...'}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                    onPaste={onComposerPaste}
                  />
                </>
              )}
              {!recording && !text.trim() && !pendingFile ? (
                <button className="send-button" onClick={() => void startRecording()} title="Grabar nota de voz"><Mic size={17} /></button>
              ) : recording ? (
                <button className="send-button" onClick={() => stopRecording(true)} title="Enviar nota de voz"><Square size={15} /></button>
              ) : (
                <button className="send-button" disabled={sending} onClick={() => void send()}><Send size={17} /></button>
              )}
            </div>
          </> : <div className="empty-state"><div><strong>Selecciona una conversación</strong>Los mensajes aparecerán aquí en tiempo real.</div></div>}
        </div>

        <aside className="contact-panel">
          {selected ? <><div className="contact-big-avatar">{avatarContent(selected.contact, 24)}</div><h3>{displayName(selected.contact)}</h3><p>{selected.contact.phone || selected.contact.waId}</p><div className="contact-section"><h4>Conversación</h4><div className="contact-line"><span>Estado</span><strong>{selected.status}</strong></div><div className="field compact-field"><label>Agente asignado</label><select value={selected.assignedUser?.id || ''} onChange={(e) => void updateAssignment('assignedUserId', e.target.value)}><option value="">Sin asignar</option>{teamUsers.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}</select></div><div className="field compact-field"><label>Departamento</label><select value={selected.department?.id || ''} onChange={(e) => void updateAssignment('departmentId', e.target.value)}><option value="">General</option>{departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</select></div><div className="field compact-field"><label>Proyecto</label><select value={selected.project?.id || ''} onChange={(e) => void updateAssignment('projectId', e.target.value)}><option value="">Sin definir</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></div></div><div className="contact-section"><h4>Notas</h4><textarea className="notes-textarea" placeholder="Notas internas sobre este cliente..." value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} onBlur={() => void saveNotes(notesDraft)} /></div><div className="contact-section"><div className="card-header" style={{padding:0,marginBottom:10}}><h4 style={{margin:0}}>Incidencias</h4><button className="button small" onClick={openIncidentModal}><AlertTriangle size={13} />Nueva</button></div>{conversationIncidents.map((incident) => (<div className="incident-row" key={incident.id}><div className="incident-row-copy"><strong>{incident.subject}</strong><span>{incident.department.name}</span></div>{canManageIncident(incident) ? (<select className={`status-select status-select-${incident.status.toLowerCase()}`} value={incident.status} onChange={(e) => void updateIncidentStatus(incident, e.target.value as IncidentStatus)}><option value="PENDING">Pendiente</option><option value="IN_PROGRESS">En proceso</option><option value="RESOLVED">Solucionado</option></select>) : (<span className={`status-pill ${incident.status === 'RESOLVED' ? 'success' : incident.status === 'IN_PROGRESS' ? 'warning' : 'neutral'}`}><span className="status-dot" />{incidentStatusLabels[incident.status]}</span>)}</div>))}{!conversationIncidents.length && <p className="contact-empty-hint">Sin incidencias para este cliente.</p>}</div></> : null}
        </aside>
      </section>

      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <button className="icon-button ghost lightbox-close" onClick={() => setLightboxUrl(null)}><X size={20} /></button>
          <img src={lightboxUrl} alt="Imagen ampliada" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {forwardMessageId && (
        <div className="lightbox-overlay" onClick={() => setForwardMessageId(null)}>
          <div className="forward-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Reenviar a...</h3>
            <div className="searchbox"><Search size={16} /><input autoFocus value={forwardSearch} onChange={(e) => setForwardSearch(e.target.value)} placeholder="Buscar conversación..." /></div>
            <div className="forward-list">
              {conversations
                .filter((c) => displayName(c.contact).toLowerCase().includes(forwardSearch.toLowerCase()))
                .map((c) => (
                  <button key={c.id} className="forward-row" onClick={() => void confirmForward(c.id)}>
                    <div className="chat-avatar">{avatarContent(c.contact)}</div>
                    <span>{displayName(c.contact)}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {incidentModal && selected && (
        <div className="modal-backdrop" onClick={closeIncidentModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeIncidentModal} title="Cerrar"><X size={16} /></button>
            <div className="modal-header"><h2>Reportar incidencia</h2><p>Cliente: {displayName(selected.contact)}. Se asignará al área que la debe resolver.</p></div>

            {incidentSent ? (
              <div className="modal-body">
                <div className="empty-state"><div><strong>Incidencia creada</strong>El área asignada podrá darle seguimiento desde Equipo y agentes.</div></div>
              </div>
            ) : (
              <div className="modal-body">
                {incidentError && <div className="error-box">{incidentError}</div>}
                <div className="feedback-type-tabs">
                  {INCIDENT_TYPES.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button key={item.id} className={`feedback-type-tab ${incidentType === item.id ? 'active' : ''}`} onClick={() => setIncidentType(item.id)}>
                        <Icon size={14} />{item.label}
                      </button>
                    );
                  })}
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label>Asunto</label>
                    <input value={incidentSubject} onChange={(e) => setIncidentSubject(e.target.value)} placeholder="Ej: No se genera el comprobante" />
                  </div>
                  <div className="field">
                    <label>Detalle</label>
                    <textarea value={incidentMessage} onChange={(e) => setIncidentMessage(e.target.value)} placeholder="Cuenta qué reportó el cliente..." rows={4} />
                  </div>
                  <div className="field">
                    <label>Asignar al área</label>
                    <select value={incidentDepartmentId} onChange={(e) => setIncidentDepartmentId(e.target.value)}>
                      <option value="">Selecciona un área</option>
                      {departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="modal-actions">
              {incidentSent ? (
                <button className="button primary" onClick={closeIncidentModal}>Cerrar</button>
              ) : (
                <>
                  <button className="button" onClick={closeIncidentModal}>Cancelar</button>
                  <button className="button primary" disabled={incidentSaving} onClick={() => void submitIncident()}>{incidentSaving ? 'Enviando...' : 'Crear incidencia'}</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
    {showEmoji && emojiPos && typeof document !== 'undefined' && createPortal(
      <div ref={emojiPopoverRef} className="emoji-popover" style={{ top: emojiPos.top, left: emojiPos.left }}>
        <EmojiPicker onEmojiClick={insertEmoji} />
      </div>,
      document.body,
    )}
    {openMessageMenuId && messageMenuPos && typeof document !== 'undefined' && createPortal(
      (() => {
        const message = messages.find((m) => m.id === openMessageMenuId);
        if (!message) return null;
        const hasText = !!(message.body || message.caption);
        return (
          <div ref={messageMenuRef} className="message-actions-menu" style={{ top: messageMenuPos.top, left: messageMenuPos.left }}>
            <button disabled={!hasText} onClick={() => void copyMessageText(message)}><Copy size={14} />Copiar</button>
            <button onClick={() => openForward(message.id)}><Forward size={14} />Reenviar</button>
            <button onClick={() => void toggleFlag(message, 'pinned')}><Pin size={14} />{message.pinned ? 'Desfijar' : 'Fijar'}</button>
            <button onClick={() => void toggleFlag(message, 'starred')}><Star size={14} />{message.starred ? 'Quitar destacado' : 'Destacar'}</button>
            <button disabled={!hasText} onClick={() => addToNote(message)}><StickyNote size={14} />Añadir texto a la nota</button>
          </div>
        );
      })(),
      document.body,
    )}
    </>
  );
}
