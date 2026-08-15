'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCheck, MoreHorizontal, Search, Send, UserRoundCheck } from 'lucide-react';
import { io } from 'socket.io-client';
import { AppShell } from '@/components/app-shell';
import { apiFetch, getToken, SOCKET_URL } from '@/lib/api';

type Contact = { id: string; name?: string | null; pushName?: string | null; phone?: string | null; waId: string };
type Conversation = {
  id: string;
  status: string;
  unreadCount: number;
  lastMessageAt: string;
  contact: Contact;
  assignedUser?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  instance: { id: string; name: string; slug: string; status: string };
  messages: Array<{ id: string; body?: string | null; caption?: string | null; type: string; direction: string; status: string; createdAt: string }>;
};
type Message = { id: string; body?: string | null; caption?: string | null; type: string; direction: string; status: string; createdAt: string; fileName?: string | null };
type TeamUser = { id: string; name: string; email: string; role: string; active: boolean };
type Department = { id: string; name: string; active: boolean };

function displayName(contact: Contact) {
  return contact.name || contact.pushName || contact.phone || contact.waId.split('@')[0] || 'Cliente';
}
function initials(contact: Contact) {
  const name = displayName(contact);
  return name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}
function lastText(conversation: Conversation) {
  const message = conversation.messages[0];
  if (!message) return 'Sin mensajes';
  return message.body || message.caption || (message.type === 'DOCUMENT' ? '📄 Documento' : message.type);
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const loadConversations = useCallback(async () => {
    try {
      const data = await apiFetch<Conversation[]>('/conversations');
      setConversations(data);
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
    void Promise.all([apiFetch<TeamUser[]>('/team/users'), apiFetch<Department[]>('/team/departments')])
      .then(([users, deps]) => { setTeamUsers(users.filter((user) => user.active)); setDepartments(deps.filter((dep) => dep.active)); })
      .catch(() => undefined);
  }, [loadConversations]);
  useEffect(() => { if (selectedId) void loadMessages(selectedId); }, [selectedId, loadMessages]);
  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { token: getToken() } });
    socket.on('message.created', (event: { message: Message; conversation: Conversation }) => {
      setConversations((current) => {
        const found = current.find((item) => item.id === event.conversation.id);
        const unread = selectedId === event.conversation.id
          ? 0
          : (found?.unreadCount || 0) + (event.message.direction === 'INBOUND' ? 1 : 0);
        const next: Conversation = found
          ? { ...found, unreadCount: unread, lastMessageAt: event.message.createdAt, messages: [event.message] }
          : { ...event.conversation, unreadCount: unread, messages: [event.message] };
        return [next, ...current.filter((item) => item.id !== next.id)];
      });
      if (selectedId === event.conversation.id) {
        setMessages((current) => current.some((item) => item.id === event.message.id) ? current : [...current, event.message]);
      }
    });
    socket.on('conversation.updated', (updated: Conversation) => {
      setConversations((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    });
    socket.on('message.updated', () => {
      if (selectedId) void loadMessages(selectedId);
    });
    return () => { socket.disconnect(); };
  }, [selectedId, loadMessages]);

  const selected = conversations.find((item) => item.id === selectedId) || null;
  const filtered = useMemo(() => conversations.filter((item) => `${displayName(item.contact)} ${item.contact.phone || ''} ${lastText(item)}`.toLowerCase().includes(search.toLowerCase())), [conversations, search]);

  const send = async () => {
    if (!selectedId || !text.trim() || sending) return;
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

  const take = async () => {
    if (!selectedId) return;
    try { await apiFetch(`/conversations/${selectedId}/take`, { method: 'POST' }); await loadConversations(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo asignar'); }
  };

  const updateAssignment = async (field: 'assignedUserId' | 'departmentId', value: string) => {
    if (!selectedId) return;
    try {
      await apiFetch(`/conversations/${selectedId}`, { method: 'PATCH', body: JSON.stringify({ [field]: value || null }) });
      await loadConversations();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo transferir la conversación'); }
  };

  return (
    <AppShell title="Conversaciones" subtitle="Bandeja en tiempo real para agentes">
      {error && <div className="error-box">{error}</div>}
      <section className="chat-layout">
        <aside className="chat-list">
          <div className="chat-list-head"><h2>Conversaciones</h2><div className="searchbox"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..." /></div></div>
          <div className="chat-list-scroll">
            {filtered.map((conversation) => (
              <button className={`chat-row ${selectedId === conversation.id ? 'active' : ''}`} key={conversation.id} onClick={() => setSelectedId(conversation.id)}>
                <div className="chat-avatar">{initials(conversation.contact)}</div>
                <div className="chat-copy"><strong>{displayName(conversation.contact)}</strong><span>{lastText(conversation)}</span></div>
                <div><div className="chat-time">{new Date(conversation.lastMessageAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</div>{conversation.unreadCount > 0 && <div className="chat-unread">{conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}</div>}</div>
              </button>
            ))}
          </div>
        </aside>

        <div className="chat-main">
          {selected ? <>
            <header className="chat-header"><div className="chat-avatar">{initials(selected.contact)}</div><div className="chat-header-copy"><strong>{displayName(selected.contact)}</strong><span>{selected.instance.status === 'CONNECTED' ? `● ${selected.instance.name} conectado` : `${selected.instance.name} · ${selected.instance.status}`}</span></div>{!selected.assignedUser && <button className="button small" onClick={() => void take()}><UserRoundCheck size={14} />Tomar conversación</button>}<button className="icon-button"><MoreHorizontal size={17} /></button></header>
            <div className="message-stream">
              {messages.map((message) => <div className={`message-bubble ${message.direction === 'OUTBOUND' ? 'out' : ''}`} key={message.id}>{message.body || message.caption || (message.type === 'DOCUMENT' ? `📄 ${message.fileName || 'Documento'}` : message.type)}<div className="message-time">{new Date(message.createdAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}{message.direction === 'OUTBOUND' && <CheckCheck size={11} />}</div></div>)}
            </div>
            <div className="chat-composer"><textarea rows={1} placeholder="Escribe un mensaje..." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} /><button className="send-button" disabled={sending || !text.trim()} onClick={() => void send()}><Send size={17} /></button></div>
          </> : <div className="empty-state"><div><strong>Selecciona una conversación</strong>Los mensajes aparecerán aquí en tiempo real.</div></div>}
        </div>

        <aside className="contact-panel">
          {selected ? <><div className="contact-big-avatar">{initials(selected.contact)}</div><h3>{displayName(selected.contact)}</h3><p>{selected.contact.phone || selected.contact.waId}</p><div className="contact-section"><h4>Conversación</h4><div className="contact-line"><span>Estado</span><strong>{selected.status}</strong></div><div className="field compact-field"><label>Agente asignado</label><select value={selected.assignedUser?.id || ''} onChange={(e) => void updateAssignment('assignedUserId', e.target.value)}><option value="">Sin asignar</option>{teamUsers.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}</select></div><div className="field compact-field"><label>Departamento</label><select value={selected.department?.id || ''} onChange={(e) => void updateAssignment('departmentId', e.target.value)}><option value="">General</option>{departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}</select></div></div><div className="contact-section"><h4>Canal</h4><div className="contact-line"><span>WhatsApp</span><strong>{selected.instance.name}</strong></div><div className="contact-line"><span>Instancia</span><strong>{selected.instance.slug}</strong></div></div><div className="contact-section"><h4>Integración Brain Tech</h4><div className="warning-box" style={{marginTop:0}}>Aquí se conectará el perfil BrainPOS/ERP: últimas ventas, comprobantes, deuda y accesos rápidos.</div></div></> : null}
        </aside>
      </section>
    </AppShell>
  );
}
