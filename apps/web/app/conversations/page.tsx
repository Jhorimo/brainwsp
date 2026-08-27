'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { AlertCircle, AlertTriangle, ArrowLeft, Ban, Bot, CalendarDays, Check, CheckCheck, CheckSquare, ChevronDown, Clock, Copy, FileText, Forward, Info, Lightbulb, MapPin, MessageCircle, Mic, MoreHorizontal, Paperclip, Pencil, Phone, Pin, Plus, Reply, Search, Send, Settings, SlidersHorizontal, Smile, Sticker as StickerIcon, Square, StickyNote, Star, Tag as TagIcon, Trash2, Users, UserRoundCheck, X, Zap, ZoomIn } from 'lucide-react';
import { io } from 'socket.io-client';
import type { EmojiClickData } from 'emoji-picker-react';
import { AppShell } from '@/components/app-shell';
import { useConfirm } from '@/components/confirm-provider';
import { apiFetch, fetchAsFile, getStoredUser, getToken, mediaUrl, quickReplyFileUrl, stickerFileUrl, SOCKET_URL } from '@/lib/api';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

type Tag = { id: string; name: string; color: string };
type Stage = { id: string; name: string; color: string };
type Contact = { id: string; name?: string | null; pushName?: string | null; phone?: string | null; waId: string; notes?: string | null; avatarUrl?: string | null; tags?: Array<{ tag: Tag }> };
type Author = { id: string; name?: string | null; pushName?: string | null };
type Conversation = {
  id: string;
  status: string;
  pinned: boolean;
  aiEnabled: boolean;
  unreadCount: number;
  lastMessageAt: string;
  contact: Contact;
  assignedUser?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  stage?: Stage | null;
  instance: { id: string; name: string; slug: string; status: string };
  messages: Array<{ id: string; body?: string | null; caption?: string | null; type: string; direction: string; status: string; createdAt: string; deleted?: boolean; author?: Author | null }>;
};
type Reaction = { id: string; emoji: string; fromMe: boolean; reactorJid: string; contactId?: string | null };
type MessageMetadata = { latitude?: number; longitude?: number; name?: string; address?: string; contacts?: Array<{ displayName?: string; vcard?: string }> };
type QuotedMessage = { id: string; type: string; body?: string | null; caption?: string | null; fileName?: string | null; direction: string; author?: Author | null };
type Message = { id: string; body?: string | null; caption?: string | null; type: string; direction: string; status: string; createdAt: string; fileName?: string | null; fileSize?: number | null; mimeType?: string | null; author?: Author | null; pinned: boolean; starred: boolean; deleted?: boolean; reactions?: Reaction[]; metadata?: MessageMetadata | null; quotedMessageId?: string | null; quotedMessage?: QuotedMessage | null };
type TeamUser = { id: string; name: string; email: string; role: string; active: boolean };
type Department = { id: string; name: string; active: boolean; users?: Array<{ user: { id: string } }> };
type Project = { id: string; name: string; active: boolean };
type QuickReply = { id: string; shortcut: string; title: string; content?: string | null; active: boolean; mediaUrl?: string | null; fileName?: string | null; mimeType?: string | null; fileSize?: number | null };
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

type Appointment = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  conversation?: { id: string } | null;
  createdByUser?: { id: string; name: string } | null;
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
  if (contact.avatarUrl) return <img src={contact.avatarUrl} alt="" className="chat-avatar-img" />;
  return isGroupContact(contact) ? <Users size={iconSize} /> : initials(contact);
}
function lastText(conversation: Conversation) {
  const message = conversation.messages[0];
  if (!message) return 'Sin mensajes';
  const prefix = authorName(message.author) ? `${authorName(message.author)}: ` : '';
  if (message.deleted) return prefix + 'Se eliminó este mensaje';
  if (message.body || message.caption) return prefix + (message.body || message.caption);
  switch (message.type) {
    case 'IMAGE': return prefix + '📷 Foto';
    case 'VIDEO': return prefix + '🎥 Video';
    case 'AUDIO': return prefix + '🎤 Audio';
    case 'DOCUMENT': return prefix + '📄 Documento';
    case 'STICKER': return prefix + '😀 Sticker';
    case 'LOCATION': return prefix + '📍 Ubicación';
    case 'CONTACT': return prefix + '👤 Contacto';
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
// WhatsApp's own lightweight markup: *bold*, _italic_, ~strikethrough~, ```monospace```, plus
// bare URLs (with or without a protocol, e.g. "app.misire.pe") and phone numbers in
// international format (+51 970 445 971) — same things WhatsApp Web itself auto-links.
const FORMAT_PATTERN = /(https?:\/\/[^\s]+)|(\+\d[\d\s\-()]{6,18}\d)|(\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,24}(?:\/[^\s]*)?\b)|\*([^\n*]+)\*|_([^\n_]+)_|~([^\n~]+)~|```([^`]+)```/g;
function formatMessageText(text: string) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  FORMAT_PATTERN.lastIndex = 0;
  while ((match = FORMAT_PATTERN.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const [full, url, phone, domain, bold, italic, strike, mono] = match;
    if (url) nodes.push(<a key={key++} href={url} target="_blank" rel="noreferrer" className="message-link">{url}</a>);
    else if (phone) nodes.push(<a key={key++} href={`https://wa.me/${phone.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer" className="message-link">{phone}</a>);
    else if (domain) nodes.push(<a key={key++} href={`https://${domain}`} target="_blank" rel="noreferrer" className="message-link">{domain}</a>);
    else if (bold !== undefined) nodes.push(<strong key={key++}>{bold}</strong>);
    else if (italic !== undefined) nodes.push(<em key={key++}>{italic}</em>);
    else if (strike !== undefined) nodes.push(<s key={key++}>{strike}</s>);
    else if (mono !== undefined) nodes.push(<code key={key++}>{mono}</code>);
    lastIndex = match.index + full.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
function fileExtLabel(fileName?: string | null, mimeType?: string | null) {
  const fromName = fileName?.split('.').pop();
  if (fromName && fromName.length <= 5 && !fromName.includes(' ')) return fromName.toUpperCase();
  const subtype = mimeType?.split('/')[1]?.split(';')[0];
  return subtype ? subtype.replace(/^x-/, '').toUpperCase() : 'ARCHIVO';
}
// A colored badge per file type, same idea as WhatsApp's own document icon, so a PDF
// reads as red, a spreadsheet as green, etc. instead of one generic grey icon for
// everything. Falls back to a plain icon for anything outside this common set.
const FILE_TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  PDF: { bg: '#fbe7e5', fg: '#dc4a3a' },
  DOC: { bg: '#e5edfb', fg: '#3467d6' },
  DOCX: { bg: '#e5edfb', fg: '#3467d6' },
  XLS: { bg: '#e3f4e9', fg: '#1e8f52' },
  XLSX: { bg: '#e3f4e9', fg: '#1e8f52' },
  CSV: { bg: '#e3f4e9', fg: '#1e8f52' },
  PPT: { bg: '#fcebe0', fg: '#d9702b' },
  PPTX: { bg: '#fcebe0', fg: '#d9702b' },
  ZIP: { bg: '#f0eafb', fg: '#7749d1' },
  RAR: { bg: '#f0eafb', fg: '#7749d1' },
  TXT: { bg: '#ebeef2', fg: '#5c6b80' },
};
// For pre-filling a <input type="datetime-local">, which needs local time with no
// timezone suffix — `toISOString()` would shift it to UTC and show the wrong hour.
function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function formatFileSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 100) / 10} kB`;
  return `${Math.round(bytes / 100_000) / 10} MB`;
}
// A media message whose file failed to persist (e.g. a transient download error on the
// worker) renders an <img> with no valid src; swap it for a clear placeholder instead of
// the browser's broken-image icon sitting next to raw alt text.
function handleMediaError(e: SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = 'none';
  const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
  if (fallback) fallback.style.display = 'flex';
}
function parseVCard(vcard?: string) {
  if (!vcard) return { name: undefined as string | undefined, phones: [] as string[] };
  const lines = vcard.split(/\r?\n/);
  const name = lines.find((line) => line.startsWith('FN:'))?.slice(3).trim();
  const phones = lines
    .filter((line) => line.startsWith('TEL'))
    .map((line) => line.slice(line.indexOf(':') + 1).trim())
    .filter(Boolean);
  return { name, phones };
}
function isImageFile(file: File) { return file.type.startsWith('image/'); }
function isVideoFile(file: File) { return file.type.startsWith('video/'); }

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export default function ConversationsPage() {
  const confirm = useConfirm();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Below ~850px the list and the open chat can't share the screen (WhatsApp's own mobile
  // pattern): only one is visible at a time, this tracks which. Starts closed so a phone
  // lands on the conversation list first, not whatever conversation auto-selected on load.
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  // Debajo de 1200px el panel de contacto (etiquetas, notas, incidencias, asignación) no
  // cabe como tercera columna y se oculta por completo en el CSS — este estado lo muestra
  // como un panel deslizable bajo demanda en vez de dejarlo inalcanzable en tablet/celular.
  const [contactPanelOpen, setContactPanelOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [quickFilter, setQuickFilter] = useState<string>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const quickMenuRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [companyTags, setCompanyTags] = useState<Tag[]>([]);
  const [stagesByDept, setStagesByDept] = useState<Record<string, Stage[]>>({});
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6b8afd');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  // Escape must discard the edit, not save it — but the input's onBlur (which saves) fires
  // right after Escape unmounts it, so this flag tells that blur "this close was a cancel".
  const cancelTagEditRef = useRef(false);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  const [aiPromptModal, setAiPromptModal] = useState(false);
  const [aiPromptDraft, setAiPromptDraft] = useState('');
  const [aiPromptSaving, setAiPromptSaving] = useState(false);
  const [knowledgeEntries, setKnowledgeEntries] = useState<Array<{ id: string; title: string; content: string }>>([]);
  const [newKnowledgeTitle, setNewKnowledgeTitle] = useState('');
  const [newKnowledgeContent, setNewKnowledgeContent] = useState('');
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);
  const [identity, setIdentity] = useState({ id: '', role: '' });

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const dragCounterRef = useRef(0);
  // The four composer actions (adjuntar/emoji/stickers/respuestas rápidas) used to be four
  // separate icon buttons crowding the bar above the textarea — now they live behind one
  // "+" button, and this is the single anchor every one of their popovers positions itself
  // from (see the position-calc effects below, which all read composerMenuButtonRef).
  const [showComposerMenu, setShowComposerMenu] = useState(false);
  const [composerMenuPos, setComposerMenuPos] = useState<{ top: number; left: number } | null>(null);
  const composerMenuButtonRef = useRef<HTMLButtonElement>(null);
  const composerMenuRef = useRef<HTMLDivElement>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showStickerTray, setShowStickerTray] = useState(false);
  const [stickerTrayPos, setStickerTrayPos] = useState<{ top: number; left: number } | null>(null);
  const stickerTrayRef = useRef<HTMLDivElement>(null);
  const [stickers, setStickers] = useState<Array<{ id: string }>>([]);
  const [savedStickerMsgIds, setSavedStickerMsgIds] = useState<Set<string>>(new Set());
  const [stickerUploading, setStickerUploading] = useState(false);
  const stickerFileInputRef = useRef<HTMLInputElement>(null);
  const [showQuickReplyTray, setShowQuickReplyTray] = useState(false);
  const [quickReplyTrayPos, setQuickReplyTrayPos] = useState<{ top: number; left: number } | null>(null);
  const quickReplyTrayRef = useRef<HTMLDivElement>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [editingQuickReplyId, setEditingQuickReplyId] = useState<string | null>(null);
  const [qrShortcutDraft, setQrShortcutDraft] = useState('');
  const [qrTitleDraft, setQrTitleDraft] = useState('');
  const [qrContentDraft, setQrContentDraft] = useState('');
  const [qrSaving, setQrSaving] = useState(false);
  const [qrMediaDraft, setQrMediaDraft] = useState<{ mediaUrl: string; fileName: string; mimeType: string; fileSize: number; previewUrl?: string } | null>(null);
  const [qrMediaUploading, setQrMediaUploading] = useState(false);
  const [qrMediaCleared, setQrMediaCleared] = useState(false);
  const qrFileInputRef = useRef<HTMLInputElement>(null);
  const [qrSendingId, setQrSendingId] = useState<string | null>(null);
  const [qrAutocompleteOpen, setQrAutocompleteOpen] = useState(false);
  const [qrAutocompleteMatches, setQrAutocompleteMatches] = useState<QuickReply[]>([]);
  const [qrAutocompleteIndex, setQrAutocompleteIndex] = useState(0);
  const [emojiPos, setEmojiPos] = useState<{ top: number; left: number } | null>(null);
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
  const [bulkForwardOpen, setBulkForwardOpen] = useState(false);

  // "Responder" (reply/quote a message), WhatsApp Web style.
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);

  // "Seleccionar" (multi-select messages to bulk-forward/copy/star).
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());

  // Hover quick-react popover (6 common emojis + "+" for the full picker), same as WA Web.
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null);
  const [reactionPos, setReactionPos] = useState<{ top: number; left: number } | null>(null);
  const [reactionMoreOpen, setReactionMoreOpen] = useState(false);
  const reactionButtonRef = useRef<HTMLElement | null>(null);
  const reactionMenuRef = useRef<HTMLDivElement>(null);

  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const notesSavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // WhatsApp's pushName (the contact's own phone display name) is often not what the
  // business actually calls this client — this lets an agent correct it, same
  // inline-edit-with-cancel pattern as the tag rename above.
  const [editingContactName, setEditingContactName] = useState(false);
  const [contactNameDraft, setContactNameDraft] = useState('');
  const cancelContactNameEditRef = useRef(false);

  const [incidentModal, setIncidentModal] = useState(false);
  const [incidentType, setIncidentType] = useState<IncidentType>('BUG');
  const [incidentDepartmentId, setIncidentDepartmentId] = useState('');
  const [incidentSubject, setIncidentSubject] = useState('');
  const [incidentMessage, setIncidentMessage] = useState('');
  const [incidentSaving, setIncidentSaving] = useState(false);
  const [incidentError, setIncidentError] = useState('');
  const [incidentSent, setIncidentSent] = useState(false);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentModal, setAppointmentModal] = useState(false);
  const [appointmentTitle, setAppointmentTitle] = useState('');
  const [appointmentDescription, setAppointmentDescription] = useState('');
  const [appointmentLocation, setAppointmentLocation] = useState('');
  const [appointmentStart, setAppointmentStart] = useState('');
  const [appointmentEnd, setAppointmentEnd] = useState('');
  const [appointmentSaving, setAppointmentSaving] = useState(false);
  const [appointmentError, setAppointmentError] = useState('');

  const [newChatModal, setNewChatModal] = useState(false);
  const [newChatInstances, setNewChatInstances] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [newChatInstanceId, setNewChatInstanceId] = useState('');
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatText, setNewChatText] = useState('');
  const [newChatSaving, setNewChatSaving] = useState(false);
  const [newChatError, setNewChatError] = useState('');

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
    void Promise.all([apiFetch<TeamUser[]>('/team/users'), apiFetch<Department[]>('/team/departments'), apiFetch<Project[]>('/team/projects'), apiFetch<Incident[]>('/incidents'), apiFetch<Tag[]>('/team/tags'), apiFetch<QuickReply[]>('/quick-replies'), apiFetch<Appointment[]>('/calendar/appointments')])
      .then(([users, deps, projs, incs, tags, replies, appts]) => { setTeamUsers(users.filter((user) => user.active)); setDepartments(deps.filter((dep) => dep.active)); setProjects(projs.filter((p) => p.active)); setIncidents(incs); setCompanyTags(tags); setQuickReplies(replies); setAppointments(appts); })
      .catch(() => undefined);
  }, [loadConversations]);

  useEffect(() => {
    try {
      const user = getStoredUser<{ id?: string; role?: string }>();
      setIdentity({ id: String(user.id || ''), role: String(user.role || '') });
    } catch {}
  }, []);
  useEffect(() => { if (selectedId) void loadMessages(selectedId); }, [selectedId, loadMessages]);
  useEffect(() => { setContactPanelOpen(false); }, [selectedId]);

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
    // A dropped connection (server redeploy, network blip) can miss events while it's down.
    // socket.io reconnects on its own but never replays what it missed, so every (re)connect
    // forces a full refetch to make sure the list can't get stuck showing stale data forever.
    socket.on('connect', () => void loadConversations());
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
    socket.on('message.reaction', (event: { messageId: string; reactorJid: string; emoji: string; reaction?: Reaction }) => {
      setMessages((current) => current.map((item) => {
        if (item.id !== event.messageId) return item;
        const withoutReactor = (item.reactions || []).filter((r) => r.reactorJid !== event.reactorJid);
        return { ...item, reactions: event.emoji && event.reaction ? [...withoutReactor, event.reaction] : withoutReactor };
      }));
    });
    return () => { socket.disconnect(); };
  }, [loadMessages, loadConversations]);

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
    if (!showComposerMenu) { setComposerMenuPos(null); return; }
    const button = composerMenuButtonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      const margin = 12;
      const left = Math.min(rect.left, Math.max(margin, window.innerWidth - 210 - margin));
      setComposerMenuPos({ top: rect.top, left });
    }
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (composerMenuRef.current?.contains(target) || composerMenuButtonRef.current?.contains(target)) return;
      setShowComposerMenu(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showComposerMenu]);

  useEffect(() => {
    if (!showEmoji) { setEmojiPos(null); return; }
    const button = composerMenuButtonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      // emoji-picker-react mide ~350px de ancho por defecto — anclarlo al borde
      // izquierdo del botón lo saca de la pantalla en un celular angosto.
      const margin = 12;
      const left = Math.min(rect.left, Math.max(margin, window.innerWidth - 350 - margin));
      setEmojiPos({ top: rect.top, left });
    }
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (emojiPopoverRef.current?.contains(target) || composerMenuButtonRef.current?.contains(target)) return;
      setShowEmoji(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showEmoji]);

  useEffect(() => {
    if (!showStickerTray) { setStickerTrayPos(null); return; }
    const button = composerMenuButtonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      const margin = 12;
      const left = Math.min(rect.left, Math.max(margin, window.innerWidth - 280 - margin));
      setStickerTrayPos({ top: rect.top, left });
    }
    void apiFetch<Array<{ id: string }>>('/stickers').then(setStickers).catch(() => undefined);
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (stickerTrayRef.current?.contains(target) || composerMenuButtonRef.current?.contains(target)) return;
      setShowStickerTray(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showStickerTray]);

  useEffect(() => {
    if (!showQuickReplyTray) { setQuickReplyTrayPos(null); return; }
    const button = composerMenuButtonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      // El tray mide hasta 320px — anclarlo siempre al borde izquierdo del botón lo saca
      // de la pantalla en un celular angosto (el botón vive cerca del centro-izquierda
      // del compositor). Se recorta contra el viewport dejando un margen de 12px.
      const margin = 12;
      const left = Math.min(rect.left, Math.max(margin, window.innerWidth - 320 - margin));
      setQuickReplyTrayPos({ top: rect.top, left });
    }
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (quickReplyTrayRef.current?.contains(target) || composerMenuButtonRef.current?.contains(target)) return;
      setShowQuickReplyTray(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showQuickReplyTray]);

  useEffect(() => { setQrAutocompleteOpen(false); resetQuickReplyForm(); setShowQuickReplyTray(false); setReplyToMessage(null); setSelectMode(false); setSelectedMessageIds(new Set()); }, [selectedId]);

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

  // Anchored above the trigger (grows upward via CSS transform) so it reads as "attached to
  // the message", same spot WhatsApp Web puts its hover react bar.
  useEffect(() => {
    if (!reactionMessageId) { setReactionPos(null); return; }
    const button = reactionButtonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      setReactionPos({ top: rect.top - 16, left: Math.min(rect.left - 90, window.innerWidth - 260) });
    }
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (reactionMenuRef.current?.contains(target) || reactionButtonRef.current?.contains(target)) return;
      setReactionMessageId(null);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [reactionMessageId]);

  useEffect(() => {
    if (!quickMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (quickMenuRef.current?.contains(e.target as Node)) return;
      setQuickMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [quickMenuOpen]);

  useEffect(() => {
    if (!tagMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (tagMenuRef.current?.contains(e.target as Node)) return;
      setTagMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [tagMenuOpen]);

  // Esc closes whichever popover/overlay is currently on top — emoji picker, message
  // actions menu, forward dialog, image lightbox — same as WhatsApp Web.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (quickMenuOpen) { setQuickMenuOpen(false); return; }
      if (tagMenuOpen) { setTagMenuOpen(false); return; }
      if (openMessageMenuId) { setOpenMessageMenuId(null); return; }
      if (reactionMessageId) { setReactionMessageId(null); return; }
      if (showComposerMenu) { setShowComposerMenu(false); return; }
      if (showEmoji) { setShowEmoji(false); return; }
      if (showStickerTray) { setShowStickerTray(false); return; }
      if (showQuickReplyTray) { setShowQuickReplyTray(false); return; }
      if (forwardMessageId || bulkForwardOpen) { setForwardMessageId(null); setBulkForwardOpen(false); return; }
      if (lightboxUrl) { setLightboxUrl(null); return; }
      if (incidentModal) { setIncidentModal(false); return; }
      if (appointmentModal) { setAppointmentModal(false); return; }
      if (newChatModal) { setNewChatModal(false); return; }
      if (aiPromptModal) { setAiPromptModal(false); return; }
      if (replyToMessage) { setReplyToMessage(null); return; }
      if (selectMode) { setSelectMode(false); setSelectedMessageIds(new Set()); return; }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [quickMenuOpen, tagMenuOpen, openMessageMenuId, reactionMessageId, showComposerMenu, showEmoji, showStickerTray, showQuickReplyTray, forwardMessageId, bulkForwardOpen, lightboxUrl, incidentModal, appointmentModal, newChatModal, aiPromptModal, replyToMessage, selectMode]);

  // Revoke the local object URL used for the attach preview once it's no longer shown.
  useEffect(() => () => { if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl); }, [pendingPreviewUrl]);
  useEffect(() => () => { streamRef.current?.getTracks().forEach((track) => track.stop()); if (timerRef.current) clearInterval(timerRef.current); }, []);

  const selected = conversations.find((item) => item.id === selectedId) || null;

  useEffect(() => {
    const departmentIds = departments.map((department) => department.id).filter((id) => !stagesByDept[id]);
    for (const departmentId of new Set(departmentIds)) {
      void apiFetch<Stage[]>(`/team/departments/${departmentId}/stages`)
        .then((stages) => setStagesByDept((current) => ({ ...current, [departmentId]: stages })))
        .catch(() => undefined);
    }
  }, [departments, stagesByDept]);

  const baseFiltered = useMemo(() => conversations.filter((item) =>
    `${displayName(item.contact)} ${item.contact.phone || ''} ${lastText(item)}`.toLowerCase().includes(search.toLowerCase())
    && (!filterAgent || (filterAgent === 'unassigned' ? !item.assignedUser : item.assignedUser?.id === filterAgent))
    && (!filterDept || item.department?.id === filterDept)
    && (!filterProject || item.project?.id === filterProject)
    && (!filterStage || item.stage?.id === filterStage)
  ), [conversations, search, filterAgent, filterDept, filterProject, filterStage]);
  const unreadTabCount = useMemo(() => baseFiltered.filter((item) => item.unreadCount > 0).length, [baseFiltered]);
  const pinnedTabCount = useMemo(() => baseFiltered.filter((item) => item.pinned).length, [baseFiltered]);
  const groupTabCount = useMemo(() => baseFiltered.filter((item) => isGroupContact(item.contact)).length, [baseFiltered]);
  const aiTabCount = useMemo(() => baseFiltered.filter((item) => item.aiEnabled).length, [baseFiltered]);
  const filtered = useMemo(() => baseFiltered.filter((item) => {
    if (quickFilter === 'unread') return item.unreadCount > 0;
    if (quickFilter === 'pinned') return item.pinned;
    if (quickFilter === 'groups') return isGroupContact(item.contact);
    if (quickFilter === 'ai') return item.aiEnabled;
    if (quickFilter.startsWith('tag:')) return item.contact.tags?.some((t) => t.tag.id === quickFilter.slice(4));
    return true;
  }), [baseFiltered, quickFilter]);
  const hasActiveFilters = !!(filterAgent || filterDept || filterProject || filterStage);

  const isAdmin = identity.role === 'OWNER' || identity.role === 'ADMIN';
  const canDeleteTags = isAdmin || identity.role === 'SUPERVISOR';
  const canManageQuickReplies = canDeleteTags;
  const myDepartmentIds = useMemo(() => new Set(
    departments.filter((department) => department.users?.some((item) => item.user.id === identity.id)).map((department) => department.id),
  ), [departments, identity.id]);
  const canManageIncident = useCallback((incident: Incident) => isAdmin || myDepartmentIds.has(incident.department.id), [isAdmin, myDepartmentIds]);
  const conversationIncidents = useMemo(() => incidents.filter((incident) => incident.conversation.id === selectedId), [incidents, selectedId]);
  const conversationAppointments = useMemo(
    () => appointments.filter((a) => a.conversation?.id === selectedId).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [appointments, selectedId],
  );

  useEffect(() => { setNotesDraft(selected?.contact.notes || ''); setNotesSaved(false); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickFile = () => fileInputRef.current?.click();

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    if (files.length === 1) { attachFile(files[0]); return; }
    void sendFiles(files);
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

  // Lets agents drop an image/video/document straight onto the open chat to attach it,
  // same as WhatsApp Web. dragCounterRef tracks enter/leave depth because those events also
  // fire for every child element crossed, not just the outer drop zone.
  const onChatDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setDragActive(true);
  };
  const onChatDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
  };
  const onChatDragLeave = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragActive(false);
  };
  const onChatDrop = (e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    if (files.length === 1) { attachFile(files[0]); return; }
    void sendFiles(files);
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
    const quotedMessageId = replyToMessage?.id;
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (opts.caption) formData.append('caption', opts.caption);
      formData.append('ptt', opts.ptt ? 'true' : 'false');
      if (quotedMessageId) formData.append('quotedMessageId', quotedMessageId);
      const created = await apiFetch<Message>(`/conversations/${selectedId}/messages/media`, { method: 'POST', body: formData });
      setMessages((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
      void loadConversations();
      removePendingFile();
      setText('');
      setReplyToMessage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el archivo');
    } finally { setSending(false); }
  };

  // Dropping/picking more than one file at once skips the single-attachment preview
  // (there's no UI for captioning several files individually) and sends each one as
  // its own message right away, same as WhatsApp Web does for a multi-file drop.
  const sendFiles = async (files: File[]) => {
    if (!selectedId || sending || files.length === 0) return;
    setSending(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('ptt', 'false');
        const created = await apiFetch<Message>(`/conversations/${selectedId}/messages/media`, { method: 'POST', body: formData });
        setMessages((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
      }
      void loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron enviar los archivos');
    } finally { setSending(false); }
  };

  const send = async () => {
    if (!selectedId || sending) return;
    if (pendingFile) { await sendMediaFile(pendingFile, { caption: text.trim() || undefined }); return; }
    if (!text.trim()) return;
    const body = text.trim();
    const quotedMessage = replyToMessage;
    setText('');
    setReplyToMessage(null);
    setSending(true);
    try {
      const created = await apiFetch<Message>(`/conversations/${selectedId}/messages`, { method: 'POST', body: JSON.stringify({ message: body, quotedMessageId: quotedMessage?.id }) });
      setMessages((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
      void loadConversations();
    } catch (err) {
      setText(body);
      setReplyToMessage(quotedMessage);
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

  const openNewChatModal = async () => {
    setNewChatError('');
    setNewChatPhone('');
    setNewChatText('');
    setNewChatModal(true);
    try {
      const instances = await apiFetch<Array<{ id: string; name: string; status: string }>>('/instances');
      const connected = instances.filter((instance) => instance.status === 'CONNECTED');
      setNewChatInstances(connected);
      setNewChatInstanceId((current) => current && connected.some((i) => i.id === current) ? current : connected[0]?.id || '');
    } catch {
      setNewChatInstances([]);
    }
  };

  const closeNewChatModal = () => setNewChatModal(false);

  const submitNewChat = async () => {
    if (!newChatInstanceId) { setNewChatError('Selecciona la línea de WhatsApp desde la que vas a escribir'); return; }
    if (newChatPhone.replace(/[^0-9]/g, '').length < 8) { setNewChatError('Ingresa un número válido con código de país'); return; }
    if (!newChatText.trim()) { setNewChatError('Escribe el primer mensaje'); return; }
    setNewChatSaving(true);
    setNewChatError('');
    try {
      const message = await apiFetch<{ conversationId: string }>('/conversations/start', {
        method: 'POST',
        body: JSON.stringify({ instanceId: newChatInstanceId, phone: newChatPhone.trim(), text: newChatText.trim() }),
      });
      await loadConversations();
      setSelectedId(message.conversationId);
      setMobileChatOpen(true);
      setNewChatModal(false);
    } catch (err) {
      setNewChatError(err instanceof Error ? err.message : 'No se pudo iniciar la conversación');
    } finally {
      setNewChatSaving(false);
    }
  };

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

  const openAppointmentModal = () => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    const end = new Date(start.getTime() + 30 * 60_000);
    setAppointmentTitle('');
    setAppointmentDescription('');
    setAppointmentLocation('');
    setAppointmentStart(toDatetimeLocalValue(start));
    setAppointmentEnd(toDatetimeLocalValue(end));
    setAppointmentError('');
    setAppointmentModal(true);
  };

  const closeAppointmentModal = () => setAppointmentModal(false);

  // Changing "Inicio" alone used to leave "Fin" wherever it was — move the start forward a
  // couple of days and the end could silently stay in the past, only caught as an error at
  // submit time. Shifting Fin by the same delta keeps the appointment's duration constant,
  // same as dragging an event's start in Google Calendar.
  const onAppointmentStartChange = (value: string) => {
    const newStart = new Date(value);
    if (value && !Number.isNaN(newStart.getTime()) && appointmentStart && appointmentEnd) {
      const oldStart = new Date(appointmentStart);
      const oldEnd = new Date(appointmentEnd);
      if (!Number.isNaN(oldStart.getTime()) && !Number.isNaN(oldEnd.getTime())) {
        const delta = newStart.getTime() - oldStart.getTime();
        setAppointmentEnd(toDatetimeLocalValue(new Date(oldEnd.getTime() + delta)));
      }
    }
    setAppointmentStart(value);
  };

  const submitAppointment = async () => {
    if (!selectedId) return;
    if (!appointmentTitle.trim()) { setAppointmentError('Escribe un título para la cita'); return; }
    if (!appointmentStart || !appointmentEnd) { setAppointmentError('Completa el inicio y el fin de la cita'); return; }
    const startAt = new Date(appointmentStart);
    const endAt = new Date(appointmentEnd);
    if (endAt <= startAt) { setAppointmentError('La hora de fin debe ser después del inicio'); return; }
    setAppointmentSaving(true);
    setAppointmentError('');
    try {
      const created = await apiFetch<Appointment>('/calendar/appointments', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: selectedId,
          title: appointmentTitle.trim(),
          description: appointmentDescription.trim() || undefined,
          location: appointmentLocation.trim() || undefined,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        }),
      });
      setAppointments((current) => [...current, created]);
      setAppointmentModal(false);
    } catch (err) {
      setAppointmentError(err instanceof Error ? err.message : 'No se pudo agendar la cita');
    } finally {
      setAppointmentSaving(false);
    }
  };

  const cancelAppointment = async (appointment: Appointment) => {
    if (!(await confirm(`¿Cancelar la cita "${appointment.title}"? También se elimina de Google Calendar.`, { confirmText: 'Cancelar cita', cancelText: 'Volver' }))) return;
    setAppointments((current) => current.filter((item) => item.id !== appointment.id));
    try {
      await apiFetch(`/calendar/appointments/${appointment.id}`, { method: 'DELETE' });
    } catch (err) {
      setAppointments((current) => [...current, appointment]);
      setError(err instanceof Error ? err.message : 'No se pudo cancelar la cita');
    }
  };

  const updateAssignment = async (field: 'assignedUserId' | 'departmentId' | 'projectId', value: string) => {
    if (!selectedId) return;
    try {
      await apiFetch(`/conversations/${selectedId}`, { method: 'PATCH', body: JSON.stringify({ [field]: value || null }) });
      await loadConversations();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo transferir la conversación'); }
  };

  const addTag = async (tagId: string) => {
    if (!selectedId) return;
    setTagMenuOpen(false);
    try {
      const updated = await apiFetch<Conversation>(`/conversations/${selectedId}/tags`, { method: 'POST', body: JSON.stringify({ tagId }) });
      setConversations((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo agregar la etiqueta'); }
  };

  const removeTag = async (tagId: string) => {
    if (!selectedId) return;
    try {
      const updated = await apiFetch<Conversation>(`/conversations/${selectedId}/tags/${tagId}`, { method: 'DELETE' });
      setConversations((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo quitar la etiqueta'); }
  };

  const createTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      const tag = await apiFetch<Tag>('/team/tags', { method: 'POST', body: JSON.stringify({ name, color: newTagColor }) });
      setCompanyTags((current) => [...current, tag].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTagName('');
      await addTag(tag.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear la etiqueta'); }
  };

  const updateTagColor = async (tagId: string, color: string) => {
    try {
      const updated = await apiFetch<Tag>(`/team/tags/${tagId}`, { method: 'PATCH', body: JSON.stringify({ color }) });
      setCompanyTags((current) => current.map((item) => item.id === tagId ? updated : item));
      setConversations((current) => current.map((item) => item.contact.tags?.some((t) => t.tag.id === tagId)
        ? { ...item, contact: { ...item.contact, tags: item.contact.tags!.map((t) => t.tag.id === tagId ? { ...t, tag: updated } : t) } }
        : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar el color'); }
  };

  const startEditTagName = (tag: Tag) => {
    setEditingTagId(tag.id);
    setEditingTagName(tag.name);
  };

  const saveTagName = async (tagId: string) => {
    setEditingTagId(null);
    if (cancelTagEditRef.current) { cancelTagEditRef.current = false; return; }
    const name = editingTagName.trim();
    if (!name) return;
    try {
      const updated = await apiFetch<Tag>(`/team/tags/${tagId}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      setCompanyTags((current) => current.map((item) => item.id === tagId ? updated : item).sort((a, b) => a.name.localeCompare(b.name)));
      setConversations((current) => current.map((item) => item.contact.tags?.some((t) => t.tag.id === tagId)
        ? { ...item, contact: { ...item.contact, tags: item.contact.tags!.map((t) => t.tag.id === tagId ? { ...t, tag: updated } : t) } }
        : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo renombrar la etiqueta'); }
  };

  const deleteCompanyTag = async (tag: Tag) => {
    if (!(await confirm(`¿Eliminar la etiqueta "${tag.name}"? Se quitará de todos los contactos que la tengan.`, { confirmText: 'Eliminar' }))) return;
    try {
      await apiFetch(`/team/tags/${tag.id}`, { method: 'DELETE' });
      setCompanyTags((current) => current.filter((item) => item.id !== tag.id));
      setConversations((current) => current.map((item) => item.contact.tags?.some((t) => t.tag.id === tag.id)
        ? { ...item, contact: { ...item.contact, tags: item.contact.tags?.filter((t) => t.tag.id !== tag.id) } }
        : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo eliminar la etiqueta'); }
  };

  const sendStickerFromTray = async (stickerId: string) => {
    if (!selectedId) return;
    setShowStickerTray(false);
    try {
      await apiFetch(`/conversations/${selectedId}/messages/sticker`, { method: 'POST', body: JSON.stringify({ stickerId }) });
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo enviar el sticker'); }
  };

  const uploadSticker = async (file: File) => {
    setStickerUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const sticker = await apiFetch<{ id: string }>('/stickers', { method: 'POST', body: form });
      setStickers((current) => [sticker, ...current]);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo subir el sticker'); }
    finally { setStickerUploading(false); }
  };

  const saveStickerToLibrary = async (messageId: string) => {
    if (savedStickerMsgIds.has(messageId)) return;
    try {
      await apiFetch('/stickers/from-message', { method: 'POST', body: JSON.stringify({ messageId }) });
      setSavedStickerMsgIds((current) => new Set(current).add(messageId));
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar el sticker'); }
  };

  // Finds the "/shortcut" token the caret is currently inside of, if any — same idea as an
  // IDE's autocomplete: only triggers right after a "/" that starts the word (line start or
  // preceded by whitespace), so a bare slash mid-sentence doesn't hijack typing.
  const findSlashToken = (value: string, caret: number): { start: number; query: string } | null => {
    const uptoCaret = value.slice(0, caret);
    const slashIndex = uptoCaret.lastIndexOf('/');
    if (slashIndex === -1) return null;
    const before = slashIndex === 0 ? '' : uptoCaret[slashIndex - 1];
    if (before && !/\s/.test(before)) return null;
    const query = uptoCaret.slice(slashIndex + 1);
    if (!/^[a-z0-9_-]*$/i.test(query)) return null;
    return { start: slashIndex, query: query.toLowerCase() };
  };

  const onComposerTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    const caret = e.target.selectionStart ?? value.length;
    const token = findSlashToken(value, caret);
    const matches = token ? quickReplies.filter((qr) => qr.active && qr.shortcut.startsWith(token.query)) : [];
    if (token && matches.length) {
      setQrAutocompleteMatches(matches);
      setQrAutocompleteOpen(true);
      setQrAutocompleteIndex(0);
    } else {
      setQrAutocompleteOpen(false);
    }
  };

  const insertQuickReplyContent = (content: string) => {
    const textarea = textareaRef.current;
    if (!textarea) { setText((current) => current + content); return; }
    const start = textarea.selectionStart ?? text.length;
    const end = textarea.selectionEnd ?? text.length;
    const next = text.slice(0, start) + content + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const caret = start + content.length;
      textarea.setSelectionRange(caret, caret);
    });
  };

  const applyQuickReplyAutocomplete = (qr: QuickReply) => {
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? text.length;
    const token = findSlashToken(text, caret);
    const start = token ? token.start : caret;
    setQrAutocompleteOpen(false);

    if (qr.mediaUrl) {
      setText(text.slice(0, start) + text.slice(caret));
      setQrSendingId(qr.id);
      fetchAsFile(quickReplyFileUrl(qr.id), qr.fileName || qr.id, qr.mimeType || 'application/octet-stream')
        .then((file) => { attachFile(file); if (qr.content) insertQuickReplyContent(qr.content); })
        .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar el archivo de la respuesta rápida'))
        .finally(() => setQrSendingId(null));
      return;
    }

    const content = qr.content || '';
    const next = text.slice(0, start) + content + text.slice(caret);
    setText(next);
    requestAnimationFrame(() => {
      textarea?.focus();
      const pos = start + content.length;
      textarea?.setSelectionRange(pos, pos);
    });
  };

  const sendQuickReplyFromTray = async (qr: QuickReply) => {
    setShowQuickReplyTray(false);
    if (!qr.mediaUrl) { insertQuickReplyContent(qr.content || ''); return; }
    setQrSendingId(qr.id);
    try {
      const file = await fetchAsFile(quickReplyFileUrl(qr.id), qr.fileName || qr.id, qr.mimeType || 'application/octet-stream');
      attachFile(file);
      if (qr.content) insertQuickReplyContent(qr.content);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cargar el archivo de la respuesta rápida'); }
    finally { setQrSendingId(null); }
  };

  const resetQuickReplyForm = () => {
    setEditingQuickReplyId(null);
    setQrShortcutDraft('');
    setQrTitleDraft('');
    setQrContentDraft('');
    setQrMediaDraft((current) => { if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl); return null; });
    setQrMediaCleared(false);
  };

  const startEditQuickReply = (qr: QuickReply) => {
    setEditingQuickReplyId(qr.id);
    setQrShortcutDraft(qr.shortcut);
    setQrTitleDraft(qr.title);
    setQrContentDraft(qr.content || '');
    setQrMediaDraft(qr.mediaUrl ? { mediaUrl: qr.mediaUrl, fileName: qr.fileName || '', mimeType: qr.mimeType || '', fileSize: qr.fileSize || 0 } : null);
    setQrMediaCleared(false);
  };

  const uploadQuickReplyMedia = async (file: File) => {
    setQrMediaUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const uploaded = await apiFetch<{ mediaUrl: string; fileName: string; mimeType: string; fileSize: number }>('/quick-replies/media', { method: 'POST', body: form });
      const previewUrl = isImageFile(file) || isVideoFile(file) ? URL.createObjectURL(file) : undefined;
      setQrMediaDraft((current) => {
        if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
        return { ...uploaded, previewUrl };
      });
      setQrMediaCleared(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo subir el archivo'); }
    finally { setQrMediaUploading(false); }
  };

  const removeQuickReplyMedia = () => {
    setQrMediaDraft((current) => { if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl); return null; });
    setQrMediaCleared(true);
  };

  const saveQuickReply = async () => {
    const shortcut = qrShortcutDraft.trim().toLowerCase();
    const title = qrTitleDraft.trim();
    const content = qrContentDraft.trim();
    if (!shortcut || !title || (!content && !qrMediaDraft)) return;
    setQrSaving(true);
    try {
      const body: Record<string, unknown> = { shortcut, title, content };
      if (qrMediaDraft || qrMediaCleared) {
        body.mediaUrl = qrMediaDraft?.mediaUrl ?? null;
        body.fileName = qrMediaDraft?.fileName ?? null;
        body.mimeType = qrMediaDraft?.mimeType ?? null;
        body.fileSize = qrMediaDraft?.fileSize ?? null;
      }
      if (editingQuickReplyId) {
        const updated = await apiFetch<QuickReply>(`/quick-replies/${editingQuickReplyId}`, { method: 'PATCH', body: JSON.stringify(body) });
        setQuickReplies((current) => current.map((item) => item.id === updated.id ? updated : item).sort((a, b) => a.shortcut.localeCompare(b.shortcut)));
      } else {
        const created = await apiFetch<QuickReply>('/quick-replies', { method: 'POST', body: JSON.stringify(body) });
        setQuickReplies((current) => [...current, created].sort((a, b) => a.shortcut.localeCompare(b.shortcut)));
      }
      resetQuickReplyForm();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar la respuesta rápida'); }
    finally { setQrSaving(false); }
  };

  const deleteQuickReply = async (qr: QuickReply) => {
    if (!(await confirm(`¿Eliminar la respuesta rápida "/${qr.shortcut}"?`, { confirmText: 'Eliminar' }))) return;
    try {
      await apiFetch(`/quick-replies/${qr.id}`, { method: 'DELETE' });
      setQuickReplies((current) => current.filter((item) => item.id !== qr.id));
      if (editingQuickReplyId === qr.id) resetQuickReplyForm();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo eliminar la respuesta rápida'); }
  };

  const deleteStickerItem = async (id: string) => {
    setStickers((current) => current.filter((item) => item.id !== id));
    try { await apiFetch(`/stickers/${id}`, { method: 'DELETE' }); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo borrar el sticker'); }
  };

  const updateStage = async (stageId: string | null) => {
    if (!selectedId) return;
    try {
      const updated = await apiFetch<Conversation>(`/conversations/${selectedId}/stage`, { method: 'PATCH', body: JSON.stringify({ stageId }) });
      setConversations((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar la etapa'); }
  };

  const toggleAi = async () => {
    if (!selected) return;
    const next = !selected.aiEnabled;
    setConversations((current) => current.map((item) => item.id === selected.id ? { ...item, aiEnabled: next } : item));
    try {
      await apiFetch(`/conversations/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ aiEnabled: next }) });
    } catch (err) {
      setConversations((current) => current.map((item) => item.id === selected.id ? { ...item, aiEnabled: !next } : item));
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el agente IA');
    }
  };

  const openAiPromptModal = async () => {
    setAiPromptModal(true);
    try {
      const [settings, entries] = await Promise.all([
        apiFetch<{ aiSystemPrompt: string }>('/team/ai'),
        apiFetch<Array<{ id: string; title: string; content: string }>>('/team/knowledge'),
      ]);
      setAiPromptDraft(settings.aiSystemPrompt);
      setKnowledgeEntries(entries);
    } catch { setAiPromptDraft(''); }
  };

  const saveAiPrompt = async () => {
    setAiPromptSaving(true);
    try {
      await apiFetch('/team/ai', { method: 'PATCH', body: JSON.stringify({ aiSystemPrompt: aiPromptDraft }) });
      setAiPromptModal(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar el prompt'); }
    finally { setAiPromptSaving(false); }
  };

  const addKnowledgeEntry = async () => {
    const title = newKnowledgeTitle.trim();
    const content = newKnowledgeContent.trim();
    if (!title || !content) return;
    setKnowledgeSaving(true);
    try {
      const entry = await apiFetch<{ id: string; title: string; content: string }>('/team/knowledge', { method: 'POST', body: JSON.stringify({ title, content }) });
      setKnowledgeEntries((current) => [entry, ...current]);
      setNewKnowledgeTitle('');
      setNewKnowledgeContent('');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar la entrada'); }
    finally { setKnowledgeSaving(false); }
  };

  const deleteKnowledgeEntry = async (id: string) => {
    setKnowledgeEntries((current) => current.filter((item) => item.id !== id));
    try { await apiFetch(`/team/knowledge/${id}`, { method: 'DELETE' }); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo borrar la entrada'); }
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

  // "Eliminar" (delete for everyone), same as WhatsApp Web. Only ever offered for the
  // agent's own outbound messages — see the menu below and the backend guard.
  const deleteMessageForEveryone = async (message: Message) => {
    setOpenMessageMenuId(null);
    if (!selectedId) return;
    if (!(await confirm('¿Eliminar este mensaje para todos? Esta acción no se puede deshacer.', { confirmText: 'Eliminar' }))) return;
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, deleted: true } : item));
    try {
      await apiFetch(`/conversations/${selectedId}/messages/${message.id}`, { method: 'DELETE' });
    } catch (err) {
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, deleted: false } : item));
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el mensaje');
    }
  };

  const saveNotes = async (value: string) => {
    if (!selectedId) return;
    setNotesSaving(true);
    try {
      await apiFetch(`/conversations/${selectedId}/notes`, { method: 'PATCH', body: JSON.stringify({ notes: value }) });
      setConversations((current) => current.map((item) => item.id === selectedId ? { ...item, contact: { ...item.contact, notes: value } } : item));
      setNotesSaved(true);
      if (notesSavedTimeoutRef.current) clearTimeout(notesSavedTimeoutRef.current);
      notesSavedTimeoutRef.current = setTimeout(() => setNotesSaved(false), 2200);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar la nota'); }
    finally { setNotesSaving(false); }
  };

  const startEditContactName = () => {
    if (!selected) return;
    setContactNameDraft(displayName(selected.contact));
    setEditingContactName(true);
  };

  const saveContactName = async () => {
    setEditingContactName(false);
    if (cancelContactNameEditRef.current) { cancelContactNameEditRef.current = false; return; }
    if (!selectedId) return;
    const name = contactNameDraft.trim();
    if (!name) return;
    try {
      await apiFetch(`/conversations/${selectedId}/contact-name`, { method: 'PATCH', body: JSON.stringify({ name }) });
      setConversations((current) => current.map((item) => item.id === selectedId ? { ...item, contact: { ...item.contact, name } } : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo renombrar el cliente'); }
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
    if (!selectedId) return;
    const ids = bulkForwardOpen ? Array.from(selectedMessageIds) : forwardMessageId ? [forwardMessageId] : [];
    if (!ids.length) return;
    try {
      for (const id of ids) {
        await apiFetch(`/conversations/${selectedId}/messages/${id}/forward`, { method: 'POST', body: JSON.stringify({ targetConversationId }) });
      }
      void loadConversations();
      if (bulkForwardOpen) exitSelectMode();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reenviar el mensaje');
    } finally {
      setForwardMessageId(null);
      setBulkForwardOpen(false);
    }
  };

  // "Responder": quotes a message in the composer, WhatsApp Web style.
  const startReply = (message: Message) => {
    setReplyToMessage(message);
    setOpenMessageMenuId(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };
  const cancelReply = () => setReplyToMessage(null);

  const quoteSenderLabel = (quoted: { direction: string; author?: Author | null }) => {
    if (quoted.direction === 'OUTBOUND') return 'Tú';
    return authorName(quoted.author) || (selected ? displayName(selected.contact) : 'Contacto');
  };
  const quoteTypeLabels: Record<string, string> = { IMAGE: '📷 Foto', VIDEO: '🎥 Video', AUDIO: '🎤 Audio', STICKER: '😊 Sticker' };
  const quoteSnippet = (quoted: { type: string; body?: string | null; caption?: string | null; fileName?: string | null }) => {
    if (quoted.body || quoted.caption) return quoted.body || quoted.caption || '';
    if (quoted.type === 'DOCUMENT') return `📄 ${quoted.fileName || 'Documento'}`;
    return quoteTypeLabels[quoted.type] || quoted.type;
  };

  // Scrolls to and briefly highlights the original message when its quote preview is clicked.
  const scrollToMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightMessageId(id);
    setTimeout(() => setHighlightMessageId((current) => current === id ? null : current), 1500);
  };

  // "Seleccionar": multi-select messages to bulk copy/star/forward, WhatsApp Web style.
  const enterSelectMode = (messageId: string) => {
    setSelectMode(true);
    setSelectedMessageIds(new Set([messageId]));
    setOpenMessageMenuId(null);
  };
  const exitSelectMode = () => { setSelectMode(false); setSelectedMessageIds(new Set()); };
  const toggleMessageSelected = (messageId: string) => {
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId); else next.add(messageId);
      return next;
    });
  };

  const bulkCopy = async () => {
    const texts = messages.filter((m) => selectedMessageIds.has(m.id)).map((m) => m.body || m.caption || '').filter(Boolean);
    if (!texts.length) return;
    try { await navigator.clipboard.writeText(texts.join('\n')); } catch { setError('No se pudo copiar el texto'); }
  };

  const bulkStar = async () => {
    if (!selectedId) return;
    const ids = Array.from(selectedMessageIds);
    setMessages((current) => current.map((item) => ids.includes(item.id) ? { ...item, starred: true } : item));
    try {
      await Promise.all(ids.map((id) => apiFetch(`/conversations/${selectedId}/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ starred: true }) })));
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron destacar los mensajes'); }
  };

  // Reactions: optimistic local update (clicking your own already-set emoji again removes
  // it, matching WhatsApp's toggle behavior), reconciled by the `message.reaction` realtime
  // event once the worker actually confirms the send to WhatsApp.
  const toggleReactionMenu = (e: { currentTarget: HTMLElement }, messageId: string) => {
    if (reactionMessageId === messageId) { setReactionMessageId(null); return; }
    // Anchor to the whole bubble, not the small trigger icon pinned to its top-right corner —
    // on a short, single-line bubble the icon sits so close to the top edge that the picker's
    // "grow upward from here" math left it overlapping the message text instead of clearing it.
    reactionButtonRef.current = e.currentTarget.closest('.message-bubble') || e.currentTarget;
    setReactionMoreOpen(false);
    setReactionMessageId(messageId);
  };

  const sendReaction = async (message: Message, emoji: string) => {
    if (!selectedId) return;
    const mine = message.reactions?.find((r) => r.reactorJid === 'me');
    const nextEmoji = mine?.emoji === emoji ? '' : emoji;
    setReactionMessageId(null);
    setReactionMoreOpen(false);
    const previous = message.reactions || [];
    const withoutMine = previous.filter((r) => r.reactorJid !== 'me');
    const optimistic = nextEmoji ? [...withoutMine, { id: `optimistic-${message.id}`, emoji: nextEmoji, fromMe: true, reactorJid: 'me' }] : withoutMine;
    setMessages((current) => current.map((item) => item.id === message.id ? { ...item, reactions: optimistic } : item));
    try {
      await apiFetch(`/conversations/${selectedId}/messages/${message.id}/reaction`, { method: 'POST', body: JSON.stringify({ emoji: nextEmoji }) });
    } catch (err) {
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, reactions: previous } : item));
      setError(err instanceof Error ? err.message : 'No se pudo enviar la reacción');
    }
  };

  const renderMessageBody = (message: Message) => {
    if (message.deleted) return <div className="message-deleted"><Ban size={13} />Se eliminó este mensaje</div>;
    switch (message.type) {
      case 'IMAGE':
        return <div className="message-media"><button className="media-zoom" onClick={() => setLightboxUrl(mediaUrl(message.id))} title="Ampliar imagen"><img src={mediaUrl(message.id)} alt={message.caption || 'Imagen'} onError={handleMediaError} /><div className="media-fallback"><AlertCircle size={18} />Imagen no disponible</div><span className="media-zoom-hint"><ZoomIn size={15} /></span></button>{message.caption && <div className="media-caption">{formatMessageText(message.caption)}</div>}</div>;
      case 'VIDEO':
        return <div className="message-media"><video controls src={mediaUrl(message.id)} />{message.caption && <div className="media-caption">{formatMessageText(message.caption)}</div>}</div>;
      case 'AUDIO':
        return <audio controls src={mediaUrl(message.id)} className="message-audio" />;
      case 'DOCUMENT': {
        const ext = fileExtLabel(message.fileName, message.mimeType);
        const meta = [ext, formatFileSize(message.fileSize)].filter(Boolean).join(' · ');
        const colors = FILE_TYPE_COLORS[ext];
        return (
          <div className="message-media">
            <div className="doc-card">
              <div className="doc-card-main">
                <div className="doc-card-icon" style={colors ? { background: colors.bg, color: colors.fg } : undefined}>
                  {colors ? <span className="doc-card-icon-label">{ext}</span> : <FileText size={20} />}
                </div>
                <div className="doc-card-info">
                  <div className="doc-card-name">{message.fileName || 'Documento'}</div>
                  {meta && <div className="doc-card-meta">{meta}</div>}
                </div>
              </div>
              <div className="doc-card-actions">
                <a href={mediaUrl(message.id)} target="_blank" rel="noreferrer">Abrir</a>
                <a href={`${mediaUrl(message.id)}&download=1`}>Guardar como...</a>
              </div>
            </div>
            {message.caption && <div className="media-caption">{formatMessageText(message.caption)}</div>}
          </div>
        );
      }
      case 'STICKER': {
        const saved = savedStickerMsgIds.has(message.id);
        return (
          <div className="sticker-wrap">
            <img className="message-sticker" src={mediaUrl(message.id)} alt="Sticker" onError={handleMediaError} />
            <div className="media-fallback"><AlertCircle size={18} />Sticker no disponible</div>
            <button className={`sticker-save-btn ${saved ? 'saved' : ''}`} onClick={() => void saveStickerToLibrary(message.id)} title={saved ? 'Guardado en tu galería' : 'Guardar en mi galería de stickers'}>
              {saved ? <Check size={12} /> : <Plus size={12} />}
            </button>
          </div>
        );
      }
      case 'LOCATION': {
        const { latitude, longitude, name, address } = message.metadata || {};
        const hasCoords = typeof latitude === 'number' && typeof longitude === 'number';
        return (
          <div className="doc-card">
            <div className="doc-card-main">
              <div className="doc-card-icon"><MapPin size={20} /></div>
              <div className="doc-card-info">
                <div className="doc-card-name">{name || 'Ubicación compartida'}</div>
                {address && <div className="doc-card-meta">{address}</div>}
              </div>
            </div>
            {hasCoords && (
              <div className="doc-card-actions">
                <a href={`https://www.google.com/maps?q=${latitude},${longitude}`} target="_blank" rel="noreferrer">Ver en el mapa</a>
              </div>
            )}
          </div>
        );
      }
      case 'CONTACT': {
        const contacts = message.metadata?.contacts?.length ? message.metadata.contacts : [{}];
        return (
          <>
            {contacts.map((c, i) => {
              const parsed = parseVCard(c.vcard);
              const name = c.displayName || parsed.name || 'Contacto compartido';
              return (
                <div className="doc-card" key={i}>
                  <div className="doc-card-main">
                    <div className="doc-card-icon"><Phone size={20} /></div>
                    <div className="doc-card-info">
                      <div className="doc-card-name">{name}</div>
                      {parsed.phones.length > 0 && <div className="doc-card-meta">{parsed.phones.join(' · ')}</div>}
                    </div>
                  </div>
                  {parsed.phones[0] && (
                    <div className="doc-card-actions">
                      <a href={`tel:${parsed.phones[0].replace(/[^0-9+]/g, '')}`}>Llamar</a>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        );
      }
      default:
        return formatMessageText(message.body || message.caption || message.type);
    }
  };

  return (
    <>
    <AppShell title="Conversaciones" subtitle="Bandeja en tiempo real para agentes">
      {error && <div className="error-box">{error}</div>}
      <section className={`chat-layout ${mobileChatOpen ? 'mobile-chat-open' : ''}`}>
        <aside className="chat-list">
          <div className="chat-list-head">
            <div className="chat-list-title-row">
              <h2>Conversaciones</h2>
              <button className="button small" onClick={() => void openNewChatModal()} title="Iniciar una conversación con un número nuevo"><Plus size={14} />Nuevo chat</button>
            </div>
            <div className="searchbox-row">
              <div className="searchbox"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..." /></div>
              <button className={`icon-button ${hasActiveFilters ? 'filters-active' : ''}`} onClick={() => setFiltersOpen((v) => !v)} title="Filtrar por agente, departamento o proyecto"><SlidersHorizontal size={16} /></button>
            </div>
            <div className="chat-quick-filters">
              <button className={`chat-quick-tab ${quickFilter === 'all' ? 'active' : ''}`} onClick={() => setQuickFilter('all')}>Todos</button>
              <button className={`chat-quick-tab ${quickFilter === 'unread' ? 'active' : ''}`} onClick={() => setQuickFilter('unread')}>No leídos{unreadTabCount > 0 && ` ${unreadTabCount}`}</button>
              <button className={`chat-quick-tab ${quickFilter === 'pinned' ? 'active' : ''}`} onClick={() => setQuickFilter('pinned')}>Favoritos</button>
              <div className="chat-quick-more" ref={quickMenuRef}>
                <button className={`chat-quick-tab chat-quick-tab-icon ${quickFilter === 'groups' || quickFilter === 'ai' || quickFilter.startsWith('tag:') ? 'active' : ''}`} onClick={() => setQuickMenuOpen((v) => !v)} title="Más filtros"><ChevronDown size={13} /></button>
                {quickMenuOpen && (
                  <div className="chat-quick-menu">
                    <button className={quickFilter === 'groups' ? 'active' : ''} onClick={() => { setQuickFilter('groups'); setQuickMenuOpen(false); }}><Users size={14} />Grupos{groupTabCount > 0 && <span className="chat-quick-menu-count">{groupTabCount}</span>}</button>
                    <button className={quickFilter === 'ai' ? 'active' : ''} onClick={() => { setQuickFilter('ai'); setQuickMenuOpen(false); }}><Bot size={14} />Con IA activa{aiTabCount > 0 && <span className="chat-quick-menu-count">{aiTabCount}</span>}</button>
                    {companyTags.length > 0 && <div className="chat-quick-menu-divider" />}
                    {companyTags.map((tag) => (
                      <button key={tag.id} className={quickFilter === `tag:${tag.id}` ? 'active' : ''} onClick={() => { setQuickFilter(`tag:${tag.id}`); setQuickMenuOpen(false); }}>
                        <span className="tag-dot" style={{ background: tag.color }} />{tag.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {filtersOpen && (
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
              <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
                <option value="">Todas las etapas</option>
                {departments.map((department) => {
                  const stages = stagesByDept[department.id] || [];
                  if (!stages.length) return null;
                  return (
                    <optgroup label={department.name} key={department.id}>
                      {stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}
                    </optgroup>
                  );
                })}
              </select>
              {hasActiveFilters && <button className="filter-clear" onClick={() => { setFilterAgent(''); setFilterDept(''); setFilterProject(''); setFilterStage(''); }}>Limpiar filtros</button>}
            </div>
            )}
          </div>
          <div className="chat-list-scroll">
            {filtered.map((conversation) => (
              <button className={`chat-row ${selectedId === conversation.id ? 'active' : ''} ${conversation.pinned ? 'pinned' : ''}`} key={conversation.id} style={{ borderLeftColor: conversation.stage?.color || 'transparent' }} onClick={() => { setSelectedId(conversation.id); setMobileChatOpen(true); }}>
                <div className="chat-avatar">{avatarContent(conversation.contact)}</div>
                <div className="chat-copy">
                  <div className="chat-copy-name-row">
                    <strong>{displayName(conversation.contact)}</strong>
                    {conversation.contact.tags && conversation.contact.tags.length > 0 && (
                      <span className="chat-row-tags">
                        {conversation.contact.tags.slice(0, 4).map(({ tag }) => <span key={tag.id} className="tag-dot" style={{ background: tag.color }} title={tag.name} />)}
                      </span>
                    )}
                  </div>
                  <span>{lastText(conversation)}</span>
                </div>
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

        <div
          className="chat-main"
          onDragEnter={selected ? onChatDragEnter : undefined}
          onDragOver={selected ? onChatDragOver : undefined}
          onDragLeave={selected ? onChatDragLeave : undefined}
          onDrop={selected ? onChatDrop : undefined}
        >
          {selected && dragActive && (
            <div className="chat-drop-overlay">
              <div className="chat-drop-overlay-box">
                <Paperclip size={28} />
                <span>Suelta el archivo para adjuntarlo</span>
              </div>
            </div>
          )}
          {selected ? <>
            <header className="chat-header">
              <button className="chat-back-button" onClick={() => setMobileChatOpen(false)} title="Volver a la lista"><ArrowLeft size={18} /></button>
              <div className="chat-avatar">{avatarContent(selected.contact, 17)}</div>
              <div className="chat-header-copy">
                {editingContactName ? (
                  <input className="chat-header-name-input" autoFocus value={contactNameDraft} onChange={(e) => setContactNameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void saveContactName(); if (e.key === 'Escape') { cancelContactNameEditRef.current = true; setEditingContactName(false); } }} onBlur={() => void saveContactName()} />
                ) : (
                  <div className="chat-header-name-row">
                    <strong>{displayName(selected.contact)}</strong>
                    <button className="chat-header-edit-btn" onClick={startEditContactName} title="Editar nombre"><Pencil size={11} /></button>
                  </div>
                )}
                <div className="chat-header-meta">
                  <span className="chat-header-phone">{selected.contact.phone || selected.contact.waId}</span>
                  <span className="chat-header-status">{selected.instance.status === 'CONNECTED' ? `● ${selected.instance.name} conectado` : `${selected.instance.name} · ${selected.instance.status}`}</span>
                </div>
              </div>
              <div className="chat-header-actions">
                {!selected.assignedUser && <button className="button small" onClick={() => void take()}><UserRoundCheck size={14} />Tomar conversación</button>}
                <button className={`icon-button ${selected.aiEnabled ? 'ai-toggle-on' : ''}`} onClick={() => void toggleAi()} title={selected.aiEnabled ? 'El agente IA está respondiendo automáticamente aquí. Click para desactivarlo.' : 'Activar respuesta automática con IA en esta conversación'}><Bot size={17} /></button>
                {isAdmin && <button className="icon-button" onClick={() => void openAiPromptModal()} title="Configurar instrucciones del agente IA"><Settings size={16} /></button>}
                <button className="icon-button" onClick={openIncidentModal} title="Reportar una incidencia de este cliente"><AlertTriangle size={16} /></button>
                <button className="icon-button" onClick={openAppointmentModal} title="Agendar una cita con este cliente"><CalendarDays size={16} /></button>
                {selected.contact.phone ? <a className="icon-button" href={`tel:${selected.contact.phone}`} title={`Llamar a ${selected.contact.phone}`}><Phone size={16} /></a> : <button className="icon-button" disabled title="No hay un número de teléfono para este contacto"><Phone size={16} /></button>}
                <button className="icon-button contact-panel-toggle" onClick={() => setContactPanelOpen(true)} title="Ver etiquetas, notas e incidencias"><Info size={16} /></button>
                <button className="icon-button"><MoreHorizontal size={17} /></button>
              </div>
            </header>
            <div className="message-stream" ref={messageStreamRef}>
              <div className={`message-stream-inner ${selectMode ? 'select-mode' : ''}`}>
                {messages.map((message) => (
                  <div
                    id={`msg-${message.id}`}
                    className={`message-bubble ${message.direction === 'OUTBOUND' ? 'out' : ''} ${highlightMessageId === message.id ? 'highlight' : ''} ${selectedMessageIds.has(message.id) ? 'selected' : ''}`}
                    key={message.id}
                    onClick={() => { if (selectMode) toggleMessageSelected(message.id); }}
                  >
                    {selectMode && (
                      <input
                        type="checkbox"
                        className="message-select-checkbox"
                        checked={selectedMessageIds.has(message.id)}
                        onChange={() => toggleMessageSelected(message.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {!selectMode && (
                      <>
                        <button className="message-menu-trigger" onClick={(e) => toggleMessageMenu(e, message.id)} title="Más opciones"><ChevronDown size={13} /></button>
                        <button className="message-react-trigger" onClick={(e) => toggleReactionMenu(e, message.id)} title="Reaccionar"><Smile size={13} /></button>
                      </>
                    )}
                    {message.direction === 'INBOUND' && authorName(message.author) && <div className="message-author">{authorName(message.author)}</div>}
                    {message.quotedMessage && (
                      <button className="message-quote" onClick={(e) => { e.stopPropagation(); scrollToMessage(message.quotedMessage!.id); }}>
                        <strong>{quoteSenderLabel(message.quotedMessage)}</strong>
                        <span>{quoteSnippet(message.quotedMessage)}</span>
                      </button>
                    )}
                    {renderMessageBody(message)}
                    {message.reactions && message.reactions.length > 0 && (
                      <div className="message-reactions">{[...new Set(message.reactions.map((r) => r.emoji))].join(' ')}</div>
                    )}
                    <div className="message-time">
                      {message.pinned && <Pin size={10} className="message-badge-pin" />}
                      {message.starred && <Star size={10} className="message-badge-star" />}
                      {new Date(message.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                      {message.direction === 'OUTBOUND' && statusIcon(message.status)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectMode ? (
              <div className="bulk-select-bar">
                <button className="icon-button ghost" onClick={exitSelectMode} title="Cancelar"><X size={18} /></button>
                <span className="bulk-select-count">{selectedMessageIds.size} seleccionado{selectedMessageIds.size === 1 ? '' : 's'}</span>
                <div className="bulk-select-actions">
                  <button className="icon-button ghost" onClick={() => void bulkCopy()} disabled={!selectedMessageIds.size} title="Copiar"><Copy size={17} /></button>
                  <button className="icon-button ghost" onClick={() => void bulkStar()} disabled={!selectedMessageIds.size} title="Destacar"><Star size={17} /></button>
                  <button className="icon-button ghost" onClick={() => setBulkForwardOpen(true)} disabled={!selectedMessageIds.size} title="Reenviar"><Forward size={17} /></button>
                </div>
              </div>
            ) : <>
            {replyToMessage && (
              <div className="composer-reply-preview">
                <div className="composer-reply-bar" />
                <div className="composer-reply-body">
                  <strong>{quoteSenderLabel(replyToMessage)}</strong>
                  <span>{quoteSnippet(replyToMessage)}</span>
                </div>
                <button className="icon-button ghost" onClick={cancelReply}><X size={14} /></button>
              </div>
            )}
            {pendingFile && (
              <div className="composer-preview">
                {pendingPreviewUrl && isImageFile(pendingFile) && <img src={pendingPreviewUrl} alt="preview" />}
                {pendingPreviewUrl && isVideoFile(pendingFile) && <video src={pendingPreviewUrl} muted />}
                {!pendingPreviewUrl && <span className="composer-preview-name">📎 {pendingFile.name}</span>}
                <button className="icon-button ghost" onClick={removePendingFile}><X size={14} /></button>
              </div>
            )}

            <div className="chat-composer">
              <input ref={fileInputRef} type="file" multiple hidden accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx" onChange={onFileChange} />
              <input ref={stickerFileInputRef} type="file" hidden accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void uploadSticker(file); }} />
              {qrAutocompleteOpen && qrAutocompleteMatches.length > 0 && (
                <div className="quick-reply-autocomplete">
                  {qrAutocompleteMatches.map((qr, index) => (
                    <button
                      key={qr.id}
                      className={`quick-reply-autocomplete-item ${index === qrAutocompleteIndex ? 'active' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyQuickReplyAutocomplete(qr)}
                    >
                      <span className="quick-reply-autocomplete-shortcut">/{qr.shortcut}</span>
                      <span className="quick-reply-autocomplete-title">{qr.title}</span>
                    </button>
                  ))}
                </div>
              )}
              {recording ? (
                <div className="recording-indicator">
                  <span className="recording-dot" />
                  <span>Grabando · {formatTime(recordSeconds)}</span>
                  <button className="icon-button ghost" onClick={() => stopRecording(false)}><Trash2 size={16} /></button>
                </div>
              ) : (
                <>
                  <button ref={composerMenuButtonRef} className="icon-button ghost" onClick={() => setShowComposerMenu((v) => !v)} title="Adjuntar, emojis, stickers y respuestas rápidas"><Plus size={17} /></button>
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    placeholder={pendingFile ? 'Agrega un mensaje (opcional)...' : 'Escribe un mensaje... ("/" para respuestas rápidas)'}
                    value={text}
                    onChange={onComposerTextChange}
                    onKeyDown={(e) => {
                      if (qrAutocompleteOpen && qrAutocompleteMatches.length) {
                        if (e.key === 'ArrowDown') { e.preventDefault(); setQrAutocompleteIndex((i) => (i + 1) % qrAutocompleteMatches.length); return; }
                        if (e.key === 'ArrowUp') { e.preventDefault(); setQrAutocompleteIndex((i) => (i - 1 + qrAutocompleteMatches.length) % qrAutocompleteMatches.length); return; }
                        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyQuickReplyAutocomplete(qrAutocompleteMatches[qrAutocompleteIndex]); return; }
                        if (e.key === 'Escape') { e.preventDefault(); setQrAutocompleteOpen(false); return; }
                      }
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
                    }}
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
            </>}
          </> : <div className="empty-state"><div><strong>Selecciona una conversación</strong>Los mensajes aparecerán aquí en tiempo real.</div></div>}
        </div>

        <div className={`contact-panel-backdrop ${contactPanelOpen ? 'open' : ''}`} onClick={() => setContactPanelOpen(false)} />
        <aside className={`contact-panel ${contactPanelOpen ? 'mobile-open' : ''}`}>
          <button className="icon-button ghost contact-panel-close" onClick={() => setContactPanelOpen(false)} title="Cerrar"><X size={18} /></button>
          {selected ? <><div className="contact-section"><div className="card-header" style={{padding:0,marginBottom:10}}><h4 style={{margin:0,display:'flex',alignItems:'center',gap:6}}><TagIcon size={13} />Etiquetas</h4><div className="tag-add-wrap" ref={tagMenuRef}><button className="icon-button" onClick={() => setTagMenuOpen((v) => !v)} title="Agregar etiqueta"><Plus size={14} /></button>{tagMenuOpen && (<div className="tag-menu">{companyTags.filter((tag) => !selected.contact.tags?.some((t) => t.tag.id === tag.id)).map((tag) => (<div className="tag-menu-row" key={tag.id}><label className="tag-dot-picker" style={{ background: tag.color }} title="Cambiar color" onClick={(e) => e.stopPropagation()}><input type="color" value={tag.color} onChange={(e) => void updateTagColor(tag.id, e.target.value)} /></label>{editingTagId === tag.id ? (<input className="tag-menu-name-input" autoFocus value={editingTagName} onChange={(e) => setEditingTagName(e.target.value)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter') void saveTagName(tag.id); if (e.key === 'Escape') { cancelTagEditRef.current = true; setEditingTagId(null); } }} onBlur={() => void saveTagName(tag.id)} />) : (<button className="tag-menu-name" onClick={() => void addTag(tag.id)}>{tag.name}</button>)}{canDeleteTags && editingTagId !== tag.id && <button className="tag-menu-edit" onClick={(e) => { e.stopPropagation(); startEditTagName(tag); }} title="Renombrar etiqueta"><Pencil size={12} /></button>}{canDeleteTags && <button className="tag-menu-delete" onClick={() => void deleteCompanyTag(tag)} title="Eliminar etiqueta de la empresa"><Trash2 size={12} /></button>}</div>))}{!companyTags.length && <p className="contact-empty-hint">Aún no hay etiquetas.</p>}<div className="tag-menu-create"><input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} title="Color" /><input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Nueva etiqueta..." onKeyDown={(e) => { if (e.key === 'Enter') void createTag(); }} /><button onClick={() => void createTag()} disabled={!newTagName.trim()}><Plus size={12} /></button></div></div>)}</div></div><div className="tag-pills">{selected.contact.tags?.map(({ tag }) => (<span className="tag-pill" key={tag.id} style={{ background: `${tag.color}22`, color: tag.color, borderColor: `${tag.color}55` }}>{tag.name}<button onClick={() => void removeTag(tag.id)} title="Quitar etiqueta"><X size={10} /></button></span>))}{!selected.contact.tags?.length && <p className="contact-empty-hint">Sin etiquetas.</p>}</div></div><div className="contact-section"><h4>Etapa</h4>{selected.department ? (() => {
              const stages = stagesByDept[selected.department!.id] || [];
              return stages.length ? (
                <select className="lead-stage-select" style={{ background: `${(selected.stage?.color) || '#eef1f7'}22`, borderColor: `${(selected.stage?.color) || '#dde1ea'}55`, color: selected.stage?.color || '#5b6478' }} value={selected.stage?.id || ''} onChange={(e) => void updateStage(e.target.value || null)}>
                  <option value="">Sin etapa</option>
                  {stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}
                </select>
              ) : <p className="contact-empty-hint">"{selected.department.name}" todavía no tiene etapas configuradas. Créalas desde Equipo y agentes.</p>;
            })() : <p className="contact-empty-hint">Asigna un departamento para poder usar etapas.</p>}</div><div className="contact-section"><h4>Conversación</h4><div className="contact-line"><span>Estado</span><strong>{selected.status}</strong></div><div className="field compact-field"><label>Agente asignado</label><select value={selected.assignedUser?.id || ''} onChange={(e) => void updateAssignment('assignedUserId', e.target.value)}><option value="">Sin asignar</option>{teamUsers.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}</select></div><div className="field compact-field"><label>Departamento</label><select value={selected.department?.id || ''} onChange={(e) => void updateAssignment('departmentId', e.target.value)}><option value="">Sin departamento</option>{departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</select></div><div className="field compact-field"><label>Proyecto</label><select value={selected.project?.id || ''} onChange={(e) => void updateAssignment('projectId', e.target.value)}><option value="">Sin definir</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></div></div><div className="contact-section"><div className="card-header" style={{padding:0,marginBottom:10}}><h4 style={{margin:0}}>Notas</h4><button className={`button small notes-save-button ${notesSaved ? 'saved' : ''}`} disabled={notesSaving} onMouseDown={(e) => e.preventDefault()} onClick={() => void saveNotes(notesDraft)}>{notesSaved ? <Check size={13} /> : null}{notesSaving ? 'Guardando...' : notesSaved ? 'Guardado' : 'Guardar'}</button></div><textarea className="notes-textarea" placeholder="Notas internas sobre este cliente..." value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} onBlur={() => void saveNotes(notesDraft)} /></div><div className="contact-section"><div className="card-header" style={{padding:0,marginBottom:10}}><h4 style={{margin:0}}>Incidencias</h4><button className="button small" onClick={openIncidentModal}><AlertTriangle size={13} />Nueva</button></div>{conversationIncidents.map((incident) => (<div className="incident-row" key={incident.id}><div className="incident-row-copy"><strong>{incident.subject}</strong><span>{incident.department.name}</span></div>{canManageIncident(incident) ? (<select className={`status-select status-select-${incident.status.toLowerCase()}`} value={incident.status} onChange={(e) => void updateIncidentStatus(incident, e.target.value as IncidentStatus)}><option value="PENDING">Pendiente</option><option value="IN_PROGRESS">En proceso</option><option value="RESOLVED">Solucionado</option></select>) : (<span className={`status-pill ${incident.status === 'RESOLVED' ? 'success' : incident.status === 'IN_PROGRESS' ? 'warning' : 'neutral'}`}><span className="status-dot" />{incidentStatusLabels[incident.status]}</span>)}</div>))}{!conversationIncidents.length && <p className="contact-empty-hint">Sin incidencias para este cliente.</p>}</div><div className="contact-section"><div className="card-header" style={{padding:0,marginBottom:10}}><h4 style={{margin:0}}>Citas</h4><button className="button small" onClick={openAppointmentModal}><CalendarDays size={13} />Nueva</button></div>{conversationAppointments.map((appointment) => (<div className="incident-row" key={appointment.id}><div className="incident-row-copy"><strong>{appointment.title}</strong><span>{new Date(appointment.startAt).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</span></div><button className="icon-button" onClick={() => void cancelAppointment(appointment)} title="Cancelar cita"><Trash2 size={12} /></button></div>))}{!conversationAppointments.length && <p className="contact-empty-hint">Sin citas agendadas para este cliente.</p>}</div></> : null}
        </aside>
      </section>

      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <button className="icon-button ghost lightbox-close" onClick={() => setLightboxUrl(null)}><X size={20} /></button>
          <img src={lightboxUrl} alt="Imagen ampliada" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {(forwardMessageId || bulkForwardOpen) && (
        <div className="lightbox-overlay" onClick={() => { setForwardMessageId(null); setBulkForwardOpen(false); }}>
          <div className="forward-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{bulkForwardOpen ? `Reenviar ${selectedMessageIds.size} mensaje${selectedMessageIds.size === 1 ? '' : 's'} a...` : 'Reenviar a...'}</h3>
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

      {newChatModal && (
        <div className="modal-backdrop" onClick={closeNewChatModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeNewChatModal} title="Cerrar"><X size={16} /></button>
            <div className="modal-header"><h2>Nuevo chat</h2><p>Escríbele primero a un número que todavía no te ha contactado.</p></div>
            <div className="modal-body">
              {newChatError && <div className="error-box">{newChatError}</div>}
              <div className="warning-box">
                <strong>Ten cuidado:</strong> este número simula tu WhatsApp normal, no la API oficial de negocios. Escribirle a desconocidos que no te han contactado puede generar reportes de spam y, si se abusa, el bloqueo de tu número. Úsalo solo con contactos legítimos (ej. un cliente que te dejó su número por otro medio).
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Línea de WhatsApp</label>
                  <select value={newChatInstanceId} onChange={(e) => setNewChatInstanceId(e.target.value)}>
                    {newChatInstances.length === 0 && <option value="">No hay líneas conectadas</option>}
                    {newChatInstances.map((instance) => <option value={instance.id} key={instance.id}>{instance.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Número (con código de país)</label>
                  <input value={newChatPhone} onChange={(e) => setNewChatPhone(e.target.value)} placeholder="Ej: 51999999999" />
                </div>
                <div className="field">
                  <label>Primer mensaje</label>
                  <textarea value={newChatText} onChange={(e) => setNewChatText(e.target.value)} placeholder="Escribe el mensaje..." rows={4} />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={closeNewChatModal}>Cancelar</button>
              <button className="button primary" disabled={newChatSaving || newChatInstances.length === 0} onClick={() => void submitNewChat()}>{newChatSaving ? 'Enviando...' : 'Iniciar conversación'}</button>
            </div>
          </div>
        </div>
      )}

      {aiPromptModal && (
        <div className="modal-backdrop" onClick={() => setAiPromptModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAiPromptModal(false)} title="Cerrar"><X size={16} /></button>
            <div className="modal-header"><h2>Configuración del agente IA</h2><p>Aplica a toda la empresa. Se usa cuando actives "IA activa" en una conversación.</p></div>
            <div className="modal-body">
              <div className="field">
                <label>Instrucciones del sistema</label>
                <textarea value={aiPromptDraft} onChange={(e) => setAiPromptDraft(e.target.value)} placeholder="Ej: Eres el asistente de ventas de Brain Tech. Responde en español, sé breve y ofrece agendar una llamada si el cliente muestra interés real... (vacío = comportamiento por defecto)" rows={5} />
              </div>
              <div className="field">
                <label>Base de conocimiento</label>
                <p className="contact-empty-hint" style={{ margin: '0 0 8px' }}>El agente usa estas entradas como referencia para responder con precisión (horarios, precios, políticas...).</p>
                <div className="knowledge-list">
                  {knowledgeEntries.map((entry) => (
                    <div className="knowledge-row" key={entry.id}>
                      <div className="knowledge-row-copy"><strong>{entry.title}</strong><span>{entry.content}</span></div>
                      <button className="icon-button" onClick={() => void deleteKnowledgeEntry(entry.id)} title="Eliminar"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {!knowledgeEntries.length && <p className="contact-empty-hint">Aún no hay entradas.</p>}
                </div>
                <div className="knowledge-add">
                  <input value={newKnowledgeTitle} onChange={(e) => setNewKnowledgeTitle(e.target.value)} placeholder="Título (ej: Horario de atención)" />
                  <textarea value={newKnowledgeContent} onChange={(e) => setNewKnowledgeContent(e.target.value)} placeholder="Contenido..." rows={2} />
                  <button className="button small" disabled={knowledgeSaving || !newKnowledgeTitle.trim() || !newKnowledgeContent.trim()} onClick={() => void addKnowledgeEntry()}><Plus size={13} />Agregar</button>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setAiPromptModal(false)}>Cancelar</button>
              <button className="button primary" disabled={aiPromptSaving} onClick={() => void saveAiPrompt()}>{aiPromptSaving ? 'Guardando...' : 'Guardar'}</button>
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
      {appointmentModal && selected && (
        <div className="modal-backdrop" onClick={closeAppointmentModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeAppointmentModal} title="Cerrar"><X size={16} /></button>
            <div className="modal-header"><h2>Agendar cita</h2><p>Cliente: {displayName(selected.contact)}. Se creará en Google Calendar si el calendario está conectado.</p></div>
            <div className="modal-body">
              {appointmentError && <div className="error-box">{appointmentError}</div>}
              <div className="form-grid">
                <div className="field">
                  <label>Título</label>
                  <input value={appointmentTitle} onChange={(e) => setAppointmentTitle(e.target.value)} placeholder="Ej: Llamada de seguimiento" />
                </div>
                <div className="field">
                  <label>Inicio</label>
                  <input type="datetime-local" value={appointmentStart} onChange={(e) => onAppointmentStartChange(e.target.value)} />
                </div>
                <div className="field">
                  <label>Fin</label>
                  <input type="datetime-local" value={appointmentEnd} onChange={(e) => setAppointmentEnd(e.target.value)} />
                </div>
                <div className="field">
                  <label>Lugar (opcional)</label>
                  <input value={appointmentLocation} onChange={(e) => setAppointmentLocation(e.target.value)} placeholder="Ej: Oficina, videollamada, etc." />
                </div>
                <div className="field">
                  <label>Detalle (opcional)</label>
                  <textarea value={appointmentDescription} onChange={(e) => setAppointmentDescription(e.target.value)} placeholder="Notas sobre la cita..." rows={3} />
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={closeAppointmentModal}>Cancelar</button>
              <button className="button primary" disabled={appointmentSaving} onClick={() => void submitAppointment()}>{appointmentSaving ? 'Agendando...' : 'Agendar cita'}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
    {showComposerMenu && composerMenuPos && typeof document !== 'undefined' && createPortal(
      <div ref={composerMenuRef} className="chat-quick-menu" style={{ position: 'fixed', top: composerMenuPos.top, left: composerMenuPos.left, right: 'auto', transform: 'translateY(-100%) translateY(-10px)' }}>
        <button onClick={() => { setShowComposerMenu(false); pickFile(); }}><Paperclip size={14} />Adjuntar archivo</button>
        <button onClick={() => { setShowComposerMenu(false); setShowEmoji(true); }}><Smile size={14} />Emojis</button>
        <button onClick={() => { setShowComposerMenu(false); setShowStickerTray(true); }}><StickerIcon size={14} />Stickers</button>
        <button onClick={() => { setShowComposerMenu(false); setShowQuickReplyTray(true); }}><Zap size={14} />Respuestas rápidas</button>
      </div>,
      document.body,
    )}
    {showEmoji && emojiPos && typeof document !== 'undefined' && createPortal(
      <div ref={emojiPopoverRef} className="emoji-popover" style={{ top: emojiPos.top, left: emojiPos.left }}>
        <EmojiPicker onEmojiClick={insertEmoji} />
      </div>,
      document.body,
    )}
    {showStickerTray && stickerTrayPos && typeof document !== 'undefined' && createPortal(
      <div ref={stickerTrayRef} className="sticker-tray" style={{ top: stickerTrayPos.top, left: stickerTrayPos.left }}>
        <div className="sticker-tray-grid">
          <button className="sticker-tray-add" onClick={() => stickerFileInputRef.current?.click()} disabled={stickerUploading} title="Subir sticker nuevo">
            {stickerUploading ? '...' : <Plus size={20} />}
          </button>
          {stickers.map((sticker) => (
            <div className="sticker-tray-item" key={sticker.id}>
              <button onClick={() => void sendStickerFromTray(sticker.id)}><img src={stickerFileUrl(sticker.id)} alt="Sticker" /></button>
              <button className="sticker-tray-delete" onClick={() => void deleteStickerItem(sticker.id)} title="Eliminar sticker"><Trash2 size={11} /></button>
            </div>
          ))}
        </div>
        {!stickers.length && <p className="contact-empty-hint">Sube tu primer sticker con el botón "+".</p>}
      </div>,
      document.body,
    )}
    {showQuickReplyTray && quickReplyTrayPos && typeof document !== 'undefined' && createPortal(
      <div ref={quickReplyTrayRef} className="quick-reply-tray" style={{ top: quickReplyTrayPos.top, left: quickReplyTrayPos.left }}>
        <div className="quick-reply-tray-list">
          {quickReplies.map((qr) => (
            <div className="quick-reply-tray-item" key={qr.id}>
              <button className="quick-reply-tray-body" onClick={() => void sendQuickReplyFromTray(qr)} disabled={qrSendingId === qr.id}>
                <span className="quick-reply-tray-shortcut">/{qr.shortcut}{!qr.active && ' · inactiva'}{qrSendingId === qr.id && ' · cargando…'}</span>
                <strong>{qr.mediaUrl && <Paperclip size={11} />} {qr.title}</strong>
                <span className="quick-reply-tray-preview">{qr.content || qr.fileName}</span>
              </button>
              {canManageQuickReplies && (
                <div className="quick-reply-tray-actions">
                  <button onClick={() => startEditQuickReply(qr)} title="Editar"><Pencil size={12} /></button>
                  <button onClick={() => void deleteQuickReply(qr)} title="Eliminar"><Trash2 size={12} /></button>
                </div>
              )}
            </div>
          ))}
          {!quickReplies.length && <p className="contact-empty-hint">Aún no hay respuestas rápidas.</p>}
        </div>
        {canManageQuickReplies && (
          <div className="quick-reply-tray-form">
            <input value={qrShortcutDraft} onChange={(e) => setQrShortcutDraft(e.target.value)} placeholder="atajo (ej: saludo)" />
            <input value={qrTitleDraft} onChange={(e) => setQrTitleDraft(e.target.value)} placeholder="Título" />
            <textarea value={qrContentDraft} onChange={(e) => setQrContentDraft(e.target.value)} placeholder="Mensaje (opcional si adjuntas un archivo)..." rows={2} />
            <input
              ref={qrFileInputRef}
              type="file"
              hidden
              accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
              onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void uploadQuickReplyMedia(file); }}
            />
            {qrMediaDraft ? (() => {
              const previewSrc = qrMediaDraft.previewUrl || (editingQuickReplyId ? quickReplyFileUrl(editingQuickReplyId) : undefined);
              const isImage = qrMediaDraft.mimeType.startsWith('image/');
              const isVideo = qrMediaDraft.mimeType.startsWith('video/');
              return (
                <div className="quick-reply-tray-form-media">
                  {previewSrc && isImage && <img src={previewSrc} alt="" />}
                  {previewSrc && isVideo && <video src={previewSrc} muted />}
                  {(!previewSrc || (!isImage && !isVideo)) && <span className="quick-reply-tray-form-media-name"><FileText size={12} /> {qrMediaDraft.fileName}</span>}
                  <button onClick={removeQuickReplyMedia} title="Quitar archivo"><X size={12} /></button>
                </div>
              );
            })() : (
              <button className="quick-reply-tray-attach" onClick={() => qrFileInputRef.current?.click()} disabled={qrMediaUploading}>
                <Paperclip size={13} /> {qrMediaUploading ? 'Subiendo…' : 'Adjuntar imagen, video, PDF o archivo'}
              </button>
            )}
            <div className="quick-reply-tray-form-actions">
              {editingQuickReplyId && <button onClick={resetQuickReplyForm} disabled={qrSaving}>Cancelar</button>}
              <button onClick={() => void saveQuickReply()} disabled={qrSaving || qrMediaUploading || !qrShortcutDraft.trim() || !qrTitleDraft.trim() || (!qrContentDraft.trim() && !qrMediaDraft)}>{editingQuickReplyId ? 'Actualizar' : 'Guardar'}</button>
            </div>
          </div>
        )}
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
            <button onClick={() => startReply(message)}><Reply size={14} />Responder</button>
            <button disabled={!hasText} onClick={() => void copyMessageText(message)}><Copy size={14} />Copiar</button>
            <button onClick={() => openForward(message.id)}><Forward size={14} />Reenviar</button>
            <button onClick={() => void toggleFlag(message, 'pinned')}><Pin size={14} />{message.pinned ? 'Desfijar' : 'Fijar'}</button>
            <button onClick={() => void toggleFlag(message, 'starred')}><Star size={14} />{message.starred ? 'Quitar destacado' : 'Destacar'}</button>
            <button disabled={!hasText} onClick={() => addToNote(message)}><StickyNote size={14} />Añadir texto a la nota</button>
            <button onClick={() => enterSelectMode(message.id)}><CheckSquare size={14} />Seleccionar</button>
            {message.direction === 'OUTBOUND' && !message.deleted && ['SENT', 'DELIVERED', 'READ'].includes(message.status) && <button className="danger" onClick={() => void deleteMessageForEveryone(message)}><Trash2 size={14} />Eliminar</button>}
          </div>
        );
      })(),
      document.body,
    )}
    {reactionMessageId && reactionPos && typeof document !== 'undefined' && createPortal(
      (() => {
        const message = messages.find((m) => m.id === reactionMessageId);
        if (!message) return null;
        return (
          <div ref={reactionMenuRef} className={`reaction-picker ${reactionMoreOpen ? 'expanded' : ''}`} style={{ top: reactionPos.top, left: reactionPos.left }}>
            {reactionMoreOpen ? (
              <EmojiPicker onEmojiClick={(data) => void sendReaction(message, data.emoji)} />
            ) : (
              <>
                {QUICK_REACTIONS.map((emoji) => (
                  <button key={emoji} className="reaction-picker-emoji" onClick={() => void sendReaction(message, emoji)}>{emoji}</button>
                ))}
                <button className="reaction-picker-more" onClick={() => setReactionMoreOpen(true)} title="Más emojis">+</button>
              </>
            )}
          </div>
        );
      })(),
      document.body,
    )}
    </>
  );
}
