'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { AlertCircle, AlertTriangle, ArrowLeft, Bot, Check, CheckCheck, ChevronDown, Clock, Copy, FileText, Forward, Lightbulb, MapPin, MessageCircle, Mic, MoreHorizontal, Paperclip, Pencil, Phone, Pin, Plus, Search, Send, Settings, SlidersHorizontal, Smile, Sticker as StickerIcon, Square, StickyNote, Star, Tag as TagIcon, Trash2, Users, UserRoundCheck, X, Zap, ZoomIn } from 'lucide-react';
import { io } from 'socket.io-client';
import type { EmojiClickData } from 'emoji-picker-react';
import { AppShell } from '@/components/app-shell';
import { apiFetch, getToken, mediaUrl, stickerFileUrl, SOCKET_URL } from '@/lib/api';

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
  messages: Array<{ id: string; body?: string | null; caption?: string | null; type: string; direction: string; status: string; createdAt: string; author?: Author | null }>;
};
type Reaction = { id: string; emoji: string; fromMe: boolean; reactorJid: string; contactId?: string | null };
type MessageMetadata = { latitude?: number; longitude?: number; name?: string; address?: string; contacts?: Array<{ displayName?: string; vcard?: string }> };
type Message = { id: string; body?: string | null; caption?: string | null; type: string; direction: string; status: string; createdAt: string; fileName?: string | null; fileSize?: number | null; mimeType?: string | null; author?: Author | null; pinned: boolean; starred: boolean; reactions?: Reaction[]; metadata?: MessageMetadata | null };
type TeamUser = { id: string; name: string; email: string; role: string; active: boolean };
type Department = { id: string; name: string; active: boolean; users?: Array<{ user: { id: string } }> };
type Project = { id: string; name: string; active: boolean };
type QuickReply = { id: string; shortcut: string; title: string; content: string; active: boolean };
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
  if (contact.avatarUrl) return <img src={contact.avatarUrl} alt="" className="chat-avatar-img" />;
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
function fileExtLabel(fileName?: string | null, mimeType?: string | null) {
  const fromName = fileName?.split('.').pop();
  if (fromName && fromName.length <= 5 && !fromName.includes(' ')) return fromName.toUpperCase();
  const subtype = mimeType?.split('/')[1]?.split(';')[0];
  return subtype ? subtype.replace(/^x-/, '').toUpperCase() : 'ARCHIVO';
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

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Below ~850px the list and the open chat can't share the screen (WhatsApp's own mobile
  // pattern): only one is visible at a time, this tracks which. Starts closed so a phone
  // lands on the conversation list first, not whatever conversation auto-selected on load.
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
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
  const [showEmoji, setShowEmoji] = useState(false);
  const [showStickerTray, setShowStickerTray] = useState(false);
  const [stickerTrayPos, setStickerTrayPos] = useState<{ top: number; left: number } | null>(null);
  const stickerButtonRef = useRef<HTMLButtonElement>(null);
  const stickerTrayRef = useRef<HTMLDivElement>(null);
  const [stickers, setStickers] = useState<Array<{ id: string }>>([]);
  const [savedStickerMsgIds, setSavedStickerMsgIds] = useState<Set<string>>(new Set());
  const [stickerUploading, setStickerUploading] = useState(false);
  const stickerFileInputRef = useRef<HTMLInputElement>(null);
  const [showQuickReplyTray, setShowQuickReplyTray] = useState(false);
  const [quickReplyTrayPos, setQuickReplyTrayPos] = useState<{ top: number; left: number } | null>(null);
  const quickReplyButtonRef = useRef<HTMLButtonElement>(null);
  const quickReplyTrayRef = useRef<HTMLDivElement>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [editingQuickReplyId, setEditingQuickReplyId] = useState<string | null>(null);
  const [qrShortcutDraft, setQrShortcutDraft] = useState('');
  const [qrTitleDraft, setQrTitleDraft] = useState('');
  const [qrContentDraft, setQrContentDraft] = useState('');
  const [qrSaving, setQrSaving] = useState(false);
  const [qrAutocompleteOpen, setQrAutocompleteOpen] = useState(false);
  const [qrAutocompleteMatches, setQrAutocompleteMatches] = useState<QuickReply[]>([]);
  const [qrAutocompleteIndex, setQrAutocompleteIndex] = useState(0);
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
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const notesSavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [incidentModal, setIncidentModal] = useState(false);
  const [incidentType, setIncidentType] = useState<IncidentType>('BUG');
  const [incidentDepartmentId, setIncidentDepartmentId] = useState('');
  const [incidentSubject, setIncidentSubject] = useState('');
  const [incidentMessage, setIncidentMessage] = useState('');
  const [incidentSaving, setIncidentSaving] = useState(false);
  const [incidentError, setIncidentError] = useState('');
  const [incidentSent, setIncidentSent] = useState(false);

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
    void Promise.all([apiFetch<TeamUser[]>('/team/users'), apiFetch<Department[]>('/team/departments'), apiFetch<Project[]>('/team/projects'), apiFetch<Incident[]>('/incidents'), apiFetch<Tag[]>('/team/tags'), apiFetch<QuickReply[]>('/quick-replies')])
      .then(([users, deps, projs, incs, tags, replies]) => { setTeamUsers(users.filter((user) => user.active)); setDepartments(deps.filter((dep) => dep.active)); setProjects(projs.filter((p) => p.active)); setIncidents(incs); setCompanyTags(tags); setQuickReplies(replies); })
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
    socket.on('message.reaction', (event: { messageId: string; reactorJid: string; emoji: string; reaction?: Reaction }) => {
      setMessages((current) => current.map((item) => {
        if (item.id !== event.messageId) return item;
        const withoutReactor = (item.reactions || []).filter((r) => r.reactorJid !== event.reactorJid);
        return { ...item, reactions: event.emoji && event.reaction ? [...withoutReactor, event.reaction] : withoutReactor };
      }));
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

  useEffect(() => {
    if (!showStickerTray) { setStickerTrayPos(null); return; }
    const button = stickerButtonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      setStickerTrayPos({ top: rect.top, left: rect.left });
    }
    void apiFetch<Array<{ id: string }>>('/stickers').then(setStickers).catch(() => undefined);
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (stickerTrayRef.current?.contains(target) || stickerButtonRef.current?.contains(target)) return;
      setShowStickerTray(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showStickerTray]);

  useEffect(() => {
    if (!showQuickReplyTray) { setQuickReplyTrayPos(null); return; }
    const button = quickReplyButtonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      setQuickReplyTrayPos({ top: rect.top, left: rect.left });
    }
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (quickReplyTrayRef.current?.contains(target) || quickReplyButtonRef.current?.contains(target)) return;
      setShowQuickReplyTray(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showQuickReplyTray]);

  useEffect(() => { setQrAutocompleteOpen(false); resetQuickReplyForm(); setShowQuickReplyTray(false); }, [selectedId]);

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
      if (showEmoji) { setShowEmoji(false); return; }
      if (showStickerTray) { setShowStickerTray(false); return; }
      if (showQuickReplyTray) { setShowQuickReplyTray(false); return; }
      if (forwardMessageId) { setForwardMessageId(null); return; }
      if (lightboxUrl) { setLightboxUrl(null); return; }
      if (incidentModal) { setIncidentModal(false); return; }
      if (newChatModal) { setNewChatModal(false); return; }
      if (aiPromptModal) { setAiPromptModal(false); return; }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [quickMenuOpen, tagMenuOpen, openMessageMenuId, showEmoji, showStickerTray, showQuickReplyTray, forwardMessageId, lightboxUrl, incidentModal, newChatModal, aiPromptModal]);

  // Revoke the local object URL used for the attach preview once it's no longer shown.
  useEffect(() => () => { if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl); }, [pendingPreviewUrl]);
  useEffect(() => () => { streamRef.current?.getTracks().forEach((track) => track.stop()); if (timerRef.current) clearInterval(timerRef.current); }, []);

  const selected = conversations.find((item) => item.id === selectedId) || null;

  useEffect(() => {
    const departmentIds = [selected?.department?.id, filterDept].filter((id): id is string => !!id && !stagesByDept[id]);
    for (const departmentId of new Set(departmentIds)) {
      void apiFetch<Stage[]>(`/team/departments/${departmentId}/stages`)
        .then((stages) => setStagesByDept((current) => ({ ...current, [departmentId]: stages })))
        .catch(() => undefined);
    }
  }, [selected?.department?.id, filterDept, stagesByDept]);

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

  useEffect(() => { setNotesDraft(selected?.contact.notes || ''); setNotesSaved(false); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const file = e.dataTransfer.files?.[0];
    if (file) attachFile(file);
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

  const deleteCompanyTag = async (tag: Tag) => {
    if (!window.confirm(`¿Eliminar la etiqueta "${tag.name}"? Se quitará de todos los contactos que la tengan.`)) return;
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
    const next = text.slice(0, start) + qr.content + text.slice(caret);
    setText(next);
    setQrAutocompleteOpen(false);
    requestAnimationFrame(() => {
      textarea?.focus();
      const pos = start + qr.content.length;
      textarea?.setSelectionRange(pos, pos);
    });
  };

  const sendQuickReplyFromTray = (qr: QuickReply) => {
    setShowQuickReplyTray(false);
    insertQuickReplyContent(qr.content);
  };

  const resetQuickReplyForm = () => {
    setEditingQuickReplyId(null);
    setQrShortcutDraft('');
    setQrTitleDraft('');
    setQrContentDraft('');
  };

  const startEditQuickReply = (qr: QuickReply) => {
    setEditingQuickReplyId(qr.id);
    setQrShortcutDraft(qr.shortcut);
    setQrTitleDraft(qr.title);
    setQrContentDraft(qr.content);
  };

  const saveQuickReply = async () => {
    const shortcut = qrShortcutDraft.trim().toLowerCase();
    const title = qrTitleDraft.trim();
    const content = qrContentDraft.trim();
    if (!shortcut || !title || !content) return;
    setQrSaving(true);
    try {
      if (editingQuickReplyId) {
        const updated = await apiFetch<QuickReply>(`/quick-replies/${editingQuickReplyId}`, { method: 'PATCH', body: JSON.stringify({ shortcut, title, content }) });
        setQuickReplies((current) => current.map((item) => item.id === updated.id ? updated : item).sort((a, b) => a.shortcut.localeCompare(b.shortcut)));
      } else {
        const created = await apiFetch<QuickReply>('/quick-replies', { method: 'POST', body: JSON.stringify({ shortcut, title, content }) });
        setQuickReplies((current) => [...current, created].sort((a, b) => a.shortcut.localeCompare(b.shortcut)));
      }
      resetQuickReplyForm();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar la respuesta rápida'); }
    finally { setQrSaving(false); }
  };

  const deleteQuickReply = async (qr: QuickReply) => {
    if (!window.confirm(`¿Eliminar la respuesta rápida "/${qr.shortcut}"?`)) return;
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
        return <div className="message-media"><button className="media-zoom" onClick={() => setLightboxUrl(mediaUrl(message.id))} title="Ampliar imagen"><img src={mediaUrl(message.id)} alt={message.caption || 'Imagen'} onError={handleMediaError} /><div className="media-fallback"><AlertCircle size={18} />Imagen no disponible</div><span className="media-zoom-hint"><ZoomIn size={15} /></span></button>{message.caption && <div className="media-caption">{formatMessageText(message.caption)}</div>}</div>;
      case 'VIDEO':
        return <div className="message-media"><video controls src={mediaUrl(message.id)} />{message.caption && <div className="media-caption">{formatMessageText(message.caption)}</div>}</div>;
      case 'AUDIO':
        return <audio controls src={mediaUrl(message.id)} className="message-audio" />;
      case 'DOCUMENT': {
        const meta = [fileExtLabel(message.fileName, message.mimeType), formatFileSize(message.fileSize)].filter(Boolean).join(' · ');
        return (
          <div className="doc-card">
            <div className="doc-card-main">
              <div className="doc-card-icon"><FileText size={20} /></div>
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
              <select value={filterDept} onChange={(e) => { setFilterDept(e.target.value); setFilterStage(''); }}>
                <option value="">Todos los departamentos</option>
                {departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}
              </select>
              {filterDept && (
                <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
                  <option value="">Todas las etapas</option>
                  {(stagesByDept[filterDept] || []).map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}
                </select>
              )}
              <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
                <option value="">Todos los proyectos</option>
                {projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
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
              <div className="chat-header-copy"><strong>{displayName(selected.contact)}</strong><span>{selected.instance.status === 'CONNECTED' ? `● ${selected.instance.name} conectado` : `${selected.instance.name} · ${selected.instance.status}`}</span></div>
              <div className="chat-header-actions">
                {!selected.assignedUser && <button className="button small" onClick={() => void take()}><UserRoundCheck size={14} />Tomar conversación</button>}
                <button className={`icon-button ${selected.aiEnabled ? 'ai-toggle-on' : ''}`} onClick={() => void toggleAi()} title={selected.aiEnabled ? 'El agente IA está respondiendo automáticamente aquí. Click para desactivarlo.' : 'Activar respuesta automática con IA en esta conversación'}><Bot size={17} /></button>
                {isAdmin && <button className="icon-button" onClick={() => void openAiPromptModal()} title="Configurar instrucciones del agente IA"><Settings size={16} /></button>}
                <button className="icon-button" onClick={openIncidentModal} title="Reportar una incidencia de este cliente"><AlertTriangle size={16} /></button>
                {selected.contact.phone ? <a className="icon-button" href={`tel:${selected.contact.phone}`} title={`Llamar a ${selected.contact.phone}`}><Phone size={16} /></a> : <button className="icon-button" disabled title="No hay un número de teléfono para este contacto"><Phone size={16} /></button>}
                <button className="icon-button"><MoreHorizontal size={17} /></button>
              </div>
            </header>
            <div className="message-stream" ref={messageStreamRef}>
              <div className="message-stream-inner">
                {messages.map((message) => (
                  <div className={`message-bubble ${message.direction === 'OUTBOUND' ? 'out' : ''}`} key={message.id}>
                    <button className="message-menu-trigger" onClick={(e) => toggleMessageMenu(e, message.id)} title="Más opciones"><ChevronDown size={13} /></button>
                    {message.direction === 'INBOUND' && authorName(message.author) && <div className="message-author">{authorName(message.author)}</div>}
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
                  <button className="icon-button ghost" onClick={pickFile} title="Adjuntar archivo"><Paperclip size={17} /></button>
                  <button ref={emojiButtonRef} className="icon-button ghost" onClick={() => setShowEmoji((v) => !v)} title="Emojis"><Smile size={17} /></button>
                  <button ref={stickerButtonRef} className="icon-button ghost" onClick={() => setShowStickerTray((v) => !v)} title="Stickers"><StickerIcon size={17} /></button>
                  <button ref={quickReplyButtonRef} className="icon-button ghost" onClick={() => setShowQuickReplyTray((v) => !v)} title="Respuestas rápidas"><Zap size={17} /></button>
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
          </> : <div className="empty-state"><div><strong>Selecciona una conversación</strong>Los mensajes aparecerán aquí en tiempo real.</div></div>}
        </div>

        <aside className="contact-panel">
          {selected ? <><div className="contact-big-avatar">{avatarContent(selected.contact, 24)}</div><h3>{displayName(selected.contact)}</h3><p>{selected.contact.phone || selected.contact.waId}</p><div className="contact-section"><div className="card-header" style={{padding:0,marginBottom:10}}><h4 style={{margin:0,display:'flex',alignItems:'center',gap:6}}><TagIcon size={13} />Etiquetas</h4><div className="tag-add-wrap" ref={tagMenuRef}><button className="icon-button" onClick={() => setTagMenuOpen((v) => !v)} title="Agregar etiqueta"><Plus size={14} /></button>{tagMenuOpen && (<div className="tag-menu">{companyTags.filter((tag) => !selected.contact.tags?.some((t) => t.tag.id === tag.id)).map((tag) => (<div className="tag-menu-row" key={tag.id}><button onClick={() => void addTag(tag.id)}><span className="tag-dot" style={{ background: tag.color }} />{tag.name}</button>{canDeleteTags && <button className="tag-menu-delete" onClick={() => void deleteCompanyTag(tag)} title="Eliminar etiqueta de la empresa"><Trash2 size={12} /></button>}</div>))}{!companyTags.length && <p className="contact-empty-hint">Aún no hay etiquetas.</p>}<div className="tag-menu-create"><input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} title="Color" /><input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Nueva etiqueta..." onKeyDown={(e) => { if (e.key === 'Enter') void createTag(); }} /><button onClick={() => void createTag()} disabled={!newTagName.trim()}><Plus size={12} /></button></div></div>)}</div></div><div className="tag-pills">{selected.contact.tags?.map(({ tag }) => (<span className="tag-pill" key={tag.id} style={{ background: `${tag.color}22`, color: tag.color, borderColor: `${tag.color}55` }}>{tag.name}<button onClick={() => void removeTag(tag.id)} title="Quitar etiqueta"><X size={10} /></button></span>))}{!selected.contact.tags?.length && <p className="contact-empty-hint">Sin etiquetas.</p>}</div></div><div className="contact-section"><h4>Etapa</h4>{selected.department ? (() => {
              const stages = stagesByDept[selected.department!.id] || [];
              return stages.length ? (
                <select className="lead-stage-select" style={{ background: `${(selected.stage?.color) || '#eef1f7'}22`, borderColor: `${(selected.stage?.color) || '#dde1ea'}55`, color: selected.stage?.color || '#5b6478' }} value={selected.stage?.id || ''} onChange={(e) => void updateStage(e.target.value || null)}>
                  <option value="">Sin etapa</option>
                  {stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}
                </select>
              ) : <p className="contact-empty-hint">"{selected.department.name}" todavía no tiene etapas configuradas. Créalas desde Equipo y agentes.</p>;
            })() : <p className="contact-empty-hint">Asigna un departamento para poder usar etapas.</p>}</div><div className="contact-section"><h4>Conversación</h4><div className="contact-line"><span>Estado</span><strong>{selected.status}</strong></div><div className="field compact-field"><label>Agente asignado</label><select value={selected.assignedUser?.id || ''} onChange={(e) => void updateAssignment('assignedUserId', e.target.value)}><option value="">Sin asignar</option>{teamUsers.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}</select></div><div className="field compact-field"><label>Departamento</label><select value={selected.department?.id || ''} onChange={(e) => void updateAssignment('departmentId', e.target.value)}><option value="">General</option>{departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</select></div><div className="field compact-field"><label>Proyecto</label><select value={selected.project?.id || ''} onChange={(e) => void updateAssignment('projectId', e.target.value)}><option value="">Sin definir</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></div></div><div className="contact-section"><div className="card-header" style={{padding:0,marginBottom:10}}><h4 style={{margin:0}}>Notas</h4><button className={`button small notes-save-button ${notesSaved ? 'saved' : ''}`} disabled={notesSaving} onMouseDown={(e) => e.preventDefault()} onClick={() => void saveNotes(notesDraft)}>{notesSaved ? <Check size={13} /> : null}{notesSaving ? 'Guardando...' : notesSaved ? 'Guardado' : 'Guardar'}</button></div><textarea className="notes-textarea" placeholder="Notas internas sobre este cliente..." value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} onBlur={() => void saveNotes(notesDraft)} /></div><div className="contact-section"><div className="card-header" style={{padding:0,marginBottom:10}}><h4 style={{margin:0}}>Incidencias</h4><button className="button small" onClick={openIncidentModal}><AlertTriangle size={13} />Nueva</button></div>{conversationIncidents.map((incident) => (<div className="incident-row" key={incident.id}><div className="incident-row-copy"><strong>{incident.subject}</strong><span>{incident.department.name}</span></div>{canManageIncident(incident) ? (<select className={`status-select status-select-${incident.status.toLowerCase()}`} value={incident.status} onChange={(e) => void updateIncidentStatus(incident, e.target.value as IncidentStatus)}><option value="PENDING">Pendiente</option><option value="IN_PROGRESS">En proceso</option><option value="RESOLVED">Solucionado</option></select>) : (<span className={`status-pill ${incident.status === 'RESOLVED' ? 'success' : incident.status === 'IN_PROGRESS' ? 'warning' : 'neutral'}`}><span className="status-dot" />{incidentStatusLabels[incident.status]}</span>)}</div>))}{!conversationIncidents.length && <p className="contact-empty-hint">Sin incidencias para este cliente.</p>}</div></> : null}
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
    </AppShell>
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
              <button className="quick-reply-tray-body" onClick={() => sendQuickReplyFromTray(qr)}>
                <span className="quick-reply-tray-shortcut">/{qr.shortcut}{!qr.active && ' · inactiva'}</span>
                <strong>{qr.title}</strong>
                <span className="quick-reply-tray-preview">{qr.content}</span>
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
            <textarea value={qrContentDraft} onChange={(e) => setQrContentDraft(e.target.value)} placeholder="Mensaje..." rows={2} />
            <div className="quick-reply-tray-form-actions">
              {editingQuickReplyId && <button onClick={resetQuickReplyForm} disabled={qrSaving}>Cancelar</button>}
              <button onClick={() => void saveQuickReply()} disabled={qrSaving || !qrShortcutDraft.trim() || !qrTitleDraft.trim() || !qrContentDraft.trim()}>{editingQuickReplyId ? 'Actualizar' : 'Guardar'}</button>
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
