'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Lightbulb, MessageCircle, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';

type Department = { id: string; name: string; active: boolean };
type FeedbackType = 'SUGGESTION' | 'BUG' | 'OTHER';

const TYPES: Array<{ id: FeedbackType; label: string; icon: typeof Lightbulb }> = [
  { id: 'SUGGESTION', label: 'Sugerencia', icon: Lightbulb },
  { id: 'BUG', label: 'Error', icon: AlertTriangle },
  { id: 'OTHER', label: 'Otro', icon: MessageCircle },
];

// Controlled from the "Sugerencias y reportes" page's own "Nueva sugerencia" button — this
// used to also render its own floating bubble on every screen, which the product owner
// found intrusive. Now it only ever opens where that page tells it to.
export function FeedbackWidget({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [type, setType] = useState<FeedbackType>('SUGGESTION');
  const [departmentId, setDepartmentId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    apiFetch<Department[]>('/team/departments').then((items) => setDepartments(items.filter((item) => item.active))).catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const reset = () => {
    setType('SUGGESTION');
    setDepartmentId('');
    setSubject('');
    setMessage('');
    setError('');
    setSent(false);
  };

  const close = () => {
    onClose();
    reset();
  };

  const send = async () => {
    if (!subject.trim() || !message.trim()) { setError('Completa el asunto y el mensaje'); return; }
    setSending(true);
    setError('');
    try {
      await apiFetch('/feedback', {
        method: 'POST',
        body: JSON.stringify({ type, subject: subject.trim(), message: message.trim(), departmentId: departmentId || undefined }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el reporte');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {open && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={close} title="Cerrar"><X size={16} /></button>
            <div className="modal-header"><h2>Sugerencias y reportes</h2><p>Contanos qué funcionalidad te gustaría tener o qué no está funcionando bien.</p></div>

            {sent ? (
              <div className="modal-body">
                <div className="empty-state"><div><strong>¡Gracias por tu reporte!</strong>Lo va a revisar el equipo encargado.</div></div>
              </div>
            ) : (
              <div className="modal-body">
                {error && <div className="error-box">{error}</div>}
                <div className="feedback-type-tabs">
                  {TYPES.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button key={item.id} className={`feedback-type-tab ${type === item.id ? 'active' : ''}`} onClick={() => setType(item.id)}>
                        <Icon size={14} />{item.label}
                      </button>
                    );
                  })}
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label>Asunto</label>
                    <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ej: Poder duplicar una plantilla" />
                  </div>
                  <div className="field">
                    <label>Mensaje</label>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Contanos los detalles..." rows={4} />
                  </div>
                  <div className="field">
                    <label>Área (opcional)</label>
                    <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                      <option value="">General</option>
                      {departments.map((department) => <option value={department.id} key={department.id}>{department.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="modal-actions">
              {sent ? (
                <button className="button primary" onClick={close}>Cerrar</button>
              ) : (
                <>
                  <button className="button" onClick={close}>Cancelar</button>
                  <button className="button primary" disabled={sending} onClick={() => void send()}>{sending ? 'Enviando...' : 'Enviar'}</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
