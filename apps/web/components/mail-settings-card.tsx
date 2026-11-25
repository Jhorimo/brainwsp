'use client';

import { CheckCircle2, Eye, EyeOff, Mail, Send } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { apiFetch } from '@/lib/api';

type MailSettings = {
  smtpEnabled: boolean; smtpHost: string | null; smtpPort: number | null; smtpSecure: boolean;
  smtpUser: string | null; hasPassword: boolean; mailFromEmail: string | null; mailFromName: string | null; ready: boolean;
};

// Atajos para Mailtrap: solo completan servidor/puerto; usuario y contraseña se copian de
// Mailtrap (Sending Domains → SMTP, o Email Testing → Inbox → SMTP).
const PRESETS = [
  { label: 'Mailtrap · envío real', host: 'live.smtp.mailtrap.io', port: 587, secure: false, user: 'api' },
  { label: 'Mailtrap · pruebas (no llega a nadie)', host: 'sandbox.smtp.mailtrap.io', port: 2525, secure: false, user: '' },
];

// Servidor de correo de toda la plataforma (superadmin). Lo usan los avisos de Clienera
// Chat y queda listo para otros correos (ej. recuperar contraseña). Mientras esté apagado
// no se envía ningún correo.
export function MailSettingsCard() {
  const ids = { enabled: useId(), host: useId(), port: useId(), user: useId(), pass: useId(), from: useId(), name: useId(), test: useId(), secure: useId() };
  const [loaded, setLoaded] = useState<MailSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [testTo, setTestTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const apply = (s: MailSettings) => {
    setLoaded(s);
    setEnabled(s.smtpEnabled);
    setHost(s.smtpHost || '');
    setPort(s.smtpPort ? String(s.smtpPort) : '587');
    setSecure(s.smtpSecure);
    setUser(s.smtpUser || '');
    setFromEmail(s.mailFromEmail || '');
    setFromName(s.mailFromName || '');
    setPass('');
  };

  useEffect(() => {
    apiFetch<MailSettings>('/system-settings/mail').then(apply).catch((err) => setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No se pudo cargar' }));
  }, []);

  const save = async () => {
    setMessage(null);
    if (enabled && (!host.trim() || !port || !fromEmail.trim())) {
      setMessage({ kind: 'error', text: 'Para activarlo completa servidor, puerto y correo remitente.' });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        smtpEnabled: enabled, smtpHost: host.trim(), smtpPort: Number(port) || undefined, smtpSecure: secure,
        smtpUser: user.trim(), mailFromEmail: fromEmail.trim(), mailFromName: fromName.trim(),
      };
      if (pass) body.smtpPass = pass;
      apply(await apiFetch<MailSettings>('/system-settings/mail', { method: 'PATCH', body: JSON.stringify(body) }));
      setMessage({ kind: 'ok', text: enabled ? 'Guardado. Envía un correo de prueba para confirmar.' : 'Guardado. El correo está apagado: no se enviará nada.' });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No se pudo guardar' });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setMessage(null);
    if (!testTo.trim()) { setMessage({ kind: 'error', text: 'Escribe a qué correo enviar la prueba.' }); return; }
    setTesting(true);
    try {
      await apiFetch('/system-settings/mail/test', { method: 'POST', body: JSON.stringify({ to: testTo.trim() }) });
      setMessage({ kind: 'ok', text: `Correo de prueba enviado a ${testTo.trim()}. Revisa la bandeja (y spam).` });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'No se pudo enviar la prueba' });
    } finally {
      setTesting(false);
    }
  };

  const dirty = loaded && (enabled !== loaded.smtpEnabled || host !== (loaded.smtpHost || '') || Number(port) !== (loaded.smtpPort || 587) || secure !== loaded.smtpSecure
    || user !== (loaded.smtpUser || '') || fromEmail !== (loaded.mailFromEmail || '') || fromName !== (loaded.mailFromName || '') || pass !== '');

  return (
    <section className="table-card mail-card" style={{ padding: 20 }} aria-labelledby="mail-card-title">
      <div className="mail-card-head">
        <h3 id="mail-card-title"><Mail size={16} aria-hidden="true" /> Servidor de correo</h3>
        <span className={`status-pill ${loaded?.smtpEnabled && loaded.ready ? 'success' : 'neutral'}`}>
          <span className="status-dot" />{loaded?.smtpEnabled && loaded.ready ? 'Activo' : 'Apagado'}
        </span>
      </div>
      <p className="mail-card-help">
        Lo usan los avisos por correo de Clienera Chat («te respondieron» y volver al chat). Mientras esté apagado no se envía ningún correo.
      </p>

      <label className="mail-toggle" htmlFor={ids.enabled}>
        <input id={ids.enabled} type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enviar correos
      </label>

      <div className="mail-presets" role="group" aria-label="Completar con un proveedor">
        <span>Completar con:</span>
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="button small" onClick={() => { setHost(p.host); setPort(String(p.port)); setSecure(p.secure); if (p.user) setUser(p.user); }}>{p.label}</button>
        ))}
      </div>

      <div className="mail-grid">
        <div className="field"><label htmlFor={ids.host}>Servidor SMTP</label><input id={ids.host} value={host} onChange={(e) => setHost(e.target.value)} placeholder="live.smtp.mailtrap.io" autoComplete="off" spellCheck={false} /></div>
        <div className="field"><label htmlFor={ids.port}>Puerto</label><input id={ids.port} type="number" inputMode="numeric" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} /></div>
        <div className="field"><label htmlFor={ids.user}>Usuario</label><input id={ids.user} value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" spellCheck={false} /></div>
        <div className="field">
          <label htmlFor={ids.pass}>Contraseña / token</label>
          <div className="mail-pass">
            <input id={ids.pass} type={showPass ? 'text' : 'password'} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" placeholder={loaded?.hasPassword ? '•••••••• (guardada, escribe para cambiarla)' : ''} />
            <button type="button" className="icon-button" aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowPass((v) => !v)}>{showPass ? <EyeOff size={15} /> : <Eye size={15} />}</button>
          </div>
        </div>
        <div className="field"><label htmlFor={ids.from}>Correo remitente</label><input id={ids.from} type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="avisos@tudominio.com" autoComplete="off" /></div>
        <div className="field"><label htmlFor={ids.name}>Nombre remitente por defecto</label><input id={ids.name} value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Clienera" /></div>
      </div>
      <label className="mail-toggle small" htmlFor={ids.secure}>
        <input id={ids.secure} type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
        Conexión segura directa (SSL, normalmente puerto 465). Déjalo sin marcar para 587 o 2525.
      </label>
      <p className="mail-card-help">Los avisos de cada empresa salen con el nombre de esa empresa; el correo remitente debe ser de un dominio verificado en el proveedor.</p>

      <div className="mail-actions">
        <button type="button" className="button primary" disabled={saving || !dirty} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar'}</button>
        <div className="mail-test">
          <label htmlFor={ids.test} className="sr-only">Correo para la prueba</label>
          <input id={ids.test} type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Correo para la prueba" />
          <button type="button" className="button" disabled={testing || !!dirty} title={dirty ? 'Guarda los cambios antes de probar' : undefined} onClick={() => void test()}>
            <Send size={14} aria-hidden="true" />{testing ? 'Enviando…' : 'Enviar correo de prueba'}
          </button>
        </div>
      </div>
      {message && (
        <div className={`mail-message ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.kind === 'ok' && <CheckCircle2 size={15} aria-hidden="true" />}{message.text}
        </div>
      )}
    </section>
  );
}
