'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { EMAIL_PATTERN, QUICK_EMAIL_DOMAINS, suggestEmail } from '@/lib/email-suggest';
import { buildPhone, DEFAULT_COUNTRY, PHONE_COUNTRIES } from '@/lib/phone-countries';

export type PrechatFieldMode = 'required' | 'optional' | 'hidden';
export type PrechatSettings = { enabled: boolean; name: PrechatFieldMode; email: PrechatFieldMode; phone: PrechatFieldMode };
export type PrechatValues = { name?: string; email?: string; phone?: string; notifyEmail?: boolean; withoutHistory?: boolean };
// Respuesta del envío: error en texto, o que ese correo ya tiene chat y hay que verificarlo.
export type PrechatResult = { error?: string; verify?: { emailMasked: string; resendIn: number } } | null;

type Field = 'name' | 'email' | 'phone';

// El color de marca lo elige cada empresa: si con texto blanco no llega a contraste AA
// (4.5:1), se oscurece lo justo para el botón de enviar.
function readableBackground(hex: string) {
  const parse = (h: string) => { const m = h.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); return m ? m.slice(1).map((x) => parseInt(x, 16)) : null; };
  const lum = ([r, g, b]: number[]) => { const c = [r, g, b].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  let rgb = parse(hex);
  if (!rgb) return hex;
  for (let i = 0; i < 20 && 1.05 / (lum(rgb) + 0.05) < 4.5; i++) rgb = rgb.map((v) => Math.round(v * 0.9));
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// "987654321" → "987 654 321" (solo visual; se envían solo los dígitos).
function groupDigits(digits: string) {
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

// Formulario del ENLACE público de Clienera Chat (nunca del widget embebido). Pensado para
// escribir lo mínimo: autocompletado del navegador en todos los campos, teclado adecuado en el
// celular, atajos y corrección del dominio del correo, +51 ya puesto y el primer mensaje en el
// mismo paso. Accesible: etiquetas visibles, errores asociados al campo y foco al primer error.
export function PrechatForm({ settings, color, emailNotices, onSubmit, onVerifyCode, onResendCode }: {
  settings: PrechatSettings;
  color: string;
  // Si el servidor de correo está activo: se ofrece la casilla de avisos por correo.
  emailNotices: boolean;
  onSubmit: (values: PrechatValues, message: string) => Promise<PrechatResult>;
  // Paso del código de 6 dígitos (el correo ya tenía un chat): null si salió bien.
  onVerifyCode: (code: string) => Promise<string | null>;
  onResendCode: () => Promise<{ error?: string; resendIn?: number }>;
}) {
  const ids = { name: useId(), email: useId(), phone: useId(), country: useId(), message: useId(), status: useId() };
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [national, setNational] = useState('');
  const [message, setMessage] = useState('');
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [touched, setTouched] = useState<Record<Field, boolean>>({ name: false, email: false, phone: false });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [verify, setVerify] = useState<{ emailMasked: string; resendIn: number } | null>(null);
  const lastValues = useRef<PrechatValues | null>(null);
  const refs = { name: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null), phone: useRef<HTMLInputElement>(null) };
  const messageRef = useRef<HTMLTextAreaElement>(null);


  const visible = (field: Field) => settings[field] !== 'hidden';
  const required = (field: Field) => settings[field] === 'required';
  const order = (['name', 'email', 'phone'] as Field[]).filter(visible);
  const countryInfo = PHONE_COUNTRIES.find((c) => c.iso === country) ?? PHONE_COUNTRIES[0];

  const errors: Record<Field, string> = {
    name: !visible('name') ? ''
      : !name.trim() ? (required('name') ? 'Escribe tu nombre' : '')
      : name.trim().length < 2 ? 'El nombre es muy corto' : '',
    email: !visible('email') ? ''
      : !email.trim() ? (required('email') ? 'Escribe tu correo' : '')
      : !email.includes('@') ? 'Falta la @ en tu correo'
      : !EMAIL_PATTERN.test(email.trim()) ? 'Revisa tu correo, parece incompleto' : '',
    phone: !visible('phone') ? ''
      : !national ? (required('phone') ? 'Escribe tu celular' : '')
      : buildPhone({ country, customDial: '', national }).error || '',
  };
  const emailSuggestion = visible('email') && email.includes('@') ? suggestEmail(email) : null;
  const showQuickDomains = visible('email') && email.trim().length > 0 && !email.includes('@') && !/\s/.test(email.trim());

  const shown = (field: Field) => touched[field] && errors[field];

  // Enter en un campo pasa al siguiente (o al mensaje) en vez de enviar a medias.
  const nextOnEnter = (field: Field) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    setTouched((t) => ({ ...t, [field]: true }));
    const idx = order.indexOf(field);
    const next = order[idx + 1];
    if (next) refs[next].current?.focus();
    else messageRef.current?.focus();
  };

  // El autocompletado del navegador puede traer el número con código (+51 987…): se lo quitamos.
  const onPhoneChange = (raw: string) => {
    let digits = raw.replace(/\D/g, '');
    if (raw.trim().startsWith('+') || digits.length > countryInfo.max) {
      if (digits.startsWith(countryInfo.dial) && digits.length - countryInfo.dial.length >= countryInfo.min) digits = digits.slice(countryInfo.dial.length);
    }
    // Solo los dígitos que admite el país (Perú: 9).
    setNational(digits.slice(0, countryInfo.max));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, phone: true });
    setServerError('');
    const firstInvalid = order.find((field) => errors[field]);
    if (firstInvalid) { refs[firstInvalid].current?.focus(); return; }
    const values: PrechatValues = {};
    if (visible('name') && name.trim()) values.name = name.trim();
    if (visible('email') && email.trim()) values.email = email.trim().toLowerCase();
    if (visible('phone') && national) values.phone = buildPhone({ country, customDial: '', national }).phone;
    // Solo se manda si se mostró la casilla; si el correo está apagado no es que el cliente
    // los haya rechazado (queda el valor por defecto: activados).
    if (values.email && emailNotices) values.notifyEmail = notifyEmail;
    lastValues.current = values;
    setSubmitting(true);
    const result = await onSubmit(values, message.trim());
    setSubmitting(false);
    if (result?.error) setServerError(result.error);
    if (result?.verify) setVerify(result.verify);
  };

  // "Continuar sin ver el historial": se une al MISMO chat (el correo identifica a la
  // persona) pero este dispositivo solo ve los mensajes desde ahora.
  const continueWithoutHistory = async () => {
    if (!lastValues.current) return;
    setSubmitting(true);
    const result = await onSubmit({ ...lastValues.current, withoutHistory: true }, message.trim());
    setSubmitting(false);
    if (result?.error) setServerError(result.error);
    else setVerify(null);
  };

  if (verify) {
    return (
      <CodeStep
        color={color}
        emailMasked={verify.emailMasked}
        initialResendIn={verify.resendIn}
        busy={submitting}
        serverError={serverError}
        onVerify={onVerifyCode}
        onResend={onResendCode}
        onNewChat={() => void continueWithoutHistory()}
        onBack={() => { setVerify(null); setServerError(''); setTimeout(() => refs.email.current?.focus(), 0); }}
      />
    );
  }

  const label = (text: string, field: Field) => <>{text}{!required(field) && <span className="cc-pf-optional"> (opcional)</span>}</>;
  const describedBy = (field: Field, extra?: string) => [shown(field) ? `${ids[field]}-error` : '', extra || ''].filter(Boolean).join(' ') || undefined;

  return (
    <form className="cc-prechat" onSubmit={(e) => void submit(e)} noValidate aria-describedby={ids.status} style={{ ['--cc-color' as string]: color }}>
      <p className="cc-pf-intro" id={ids.status}>{emailNotices && visible('email') ? 'Déjanos tus datos para atenderte y avisarte cuando te respondamos.' : 'Déjanos tus datos para atenderte.'}</p>

      {visible('name') && (
        <div className={`cc-pf-field${shown('name') ? ' has-error' : ''}`}>
          <label htmlFor={ids.name}>{label('Nombre', 'name')}</label>
          <input
            id={ids.name} ref={refs.name} name="name" type="text"
            autoComplete="name" autoCapitalize="words" enterKeyHint="next" maxLength={80}
            value={name} onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))} onKeyDown={nextOnEnter('name')}
            aria-required={required('name')} aria-invalid={shown('name') ? true : undefined} aria-describedby={describedBy('name')}
          />
          {shown('name') && <span className="cc-pf-error" id={`${ids.name}-error`}>{errors.name}</span>}
        </div>
      )}

      {visible('email') && (
        <div className={`cc-pf-field${shown('email') ? ' has-error' : ''}`}>
          <label htmlFor={ids.email}>{label('Correo', 'email')}</label>
          <input
            id={ids.email} ref={refs.email} name="email" type="email" inputMode="email"
            autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" maxLength={120}
            value={email} onChange={(e) => setEmail(e.target.value.replace(/\s/g, ''))}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))} onKeyDown={nextOnEnter('email')}
            aria-required={required('email')} aria-invalid={shown('email') ? true : undefined}
            aria-describedby={describedBy('email', emailSuggestion ? `${ids.email}-suggest` : undefined)}
          />
          {showQuickDomains && (
            <div className="cc-pf-chips" role="group" aria-label="Completar el correo">
              {QUICK_EMAIL_DOMAINS.map((domain) => (
                <button key={domain} type="button" className="cc-pf-chip" onClick={() => { setEmail(`${email.trim()}@${domain}`); refs.email.current?.focus(); }}>
                  @{domain}
                </button>
              ))}
            </div>
          )}
          {emailSuggestion && (
            <div className="cc-pf-suggest" id={`${ids.email}-suggest`} role="status">
              <span>¿Quisiste decir <strong>{emailSuggestion}</strong>?</span>
              <button type="button" onClick={() => { setEmail(emailSuggestion); refs.email.current?.focus(); }}>Sí, corregir</button>
            </div>
          )}
          {shown('email') && <span className="cc-pf-error" id={`${ids.email}-error`}>{errors.email}</span>}
        </div>
      )}

      {visible('phone') && (
        <div className={`cc-pf-field${shown('phone') ? ' has-error' : ''}`}>
          <label htmlFor={ids.phone}>{label('Celular', 'phone')}</label>
          <div className="cc-pf-phone">
            <select id={ids.country} aria-label="Código de país" value={country} onChange={(e) => { setCountry(e.target.value); setNational(''); }} autoComplete="tel-country-code">
              {PHONE_COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{`+${c.dial} ${c.name}`}</option>)}
            </select>
            <span className="cc-pf-dial" aria-hidden="true">+{countryInfo.dial}</span>
            <input
              id={ids.phone} ref={refs.phone} name="tel-national" type="tel" inputMode="tel"
              autoComplete="tel-national" enterKeyHint="next" placeholder={countryInfo.iso === 'PE' ? '987 654 321' : undefined}
              maxLength={countryInfo.max + Math.floor(countryInfo.max / 3)}
              value={groupDigits(national)} onChange={(e) => onPhoneChange(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, phone: true }))} onKeyDown={nextOnEnter('phone')}
              aria-required={required('phone')} aria-invalid={shown('phone') ? true : undefined} aria-describedby={describedBy('phone')}
            />
          </div>
          {shown('phone') && <span className="cc-pf-error" id={`${ids.phone}-error`}>{errors.phone}</span>}
        </div>
      )}

      <div className="cc-pf-field">
        <label htmlFor={ids.message}>¿En qué te ayudamos?<span className="cc-pf-optional"> (opcional)</span></label>
        <textarea
          id={ids.message} ref={messageRef} rows={2} maxLength={4000} enterKeyHint="send"
          value={message} onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
        />
      </div>

      {emailNotices && visible('email') && (
        <label className="cc-pf-check">
          <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
          <span>Avisarme por correo cuando me respondan</span>
        </label>
      )}

      {serverError && <div className="cc-pf-server-error" role="alert">{serverError}</div>}

      <button type="submit" className="cc-pf-submit" disabled={submitting} style={{ background: readableBackground(color) }}>
        {submitting ? 'Un momento…' : 'Empezar chat'}
      </button>
      <p className="cc-pf-privacy">Solo usamos tus datos para atenderte.</p>
    </form>
  );
}

// Paso 2 cuando el correo ya tiene un chat: código de 6 dígitos enviado a ese correo. Un solo
// campo (autocompletado "one-time-code": en el celular el teclado ofrece el código del correo
// o SMS con un toque), acepta pegarlo con espacios y se envía solo al completar los 6 dígitos.
function CodeStep({ color, emailMasked, initialResendIn, busy, serverError, onVerify, onResend, onNewChat, onBack }: {
  color: string;
  emailMasked: string;
  initialResendIn: number;
  busy: boolean;
  serverError: string;
  onVerify: (code: string) => Promise<string | null>;
  onResend: () => Promise<{ error?: string; resendIn?: number }>;
  onNewChat: () => void;
  onBack: () => void;
}) {
  const ids = { code: useId(), help: useId(), error: useId(), title: useId() };
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [checking, setChecking] = useState(false);
  const [resendIn, setResendIn] = useState(initialResendIn);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  // Tras un código incorrecto el campo vuelve a habilitarse: se enfoca para reintentar.
  useEffect(() => { if (!checking && error) inputRef.current?.focus(); }, [checking, error]);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const check = async (value: string) => {
    if (value.length !== 6 || checking) return;
    setChecking(true);
    setError('');
    setInfo('');
    const err = await onVerify(value);
    setChecking(false);
    if (err) {
      setError(err);
      setCode('');
    }
  };

  const onChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void check(digits);
  };

  const resend = async () => {
    setError('');
    setInfo('');
    const res = await onResend();
    if (res.error) setError(res.error);
    else { setInfo(`Te enviamos un código nuevo a ${emailMasked}.`); setResendIn(res.resendIn ?? 60); }
    inputRef.current?.focus();
  };

  const shownError = error || serverError;
  return (
    <form className="cc-prechat cc-code-step" aria-labelledby={ids.title} onSubmit={(e) => { e.preventDefault(); void check(code); }} noValidate style={{ ['--cc-color' as string]: color }}>
      <h2 className="cc-code-title" id={ids.title}>Ya tienes una conversación con nosotros</h2>
      <p className="cc-pf-intro" id={ids.help}>
        Para ver tu historial, escribe el código de 6 dígitos que enviamos a <strong>{emailMasked}</strong>. Revisa también spam.
      </p>
      <div className={`cc-pf-field${shownError ? ' has-error' : ''}`}>
        <label htmlFor={ids.code}>Código</label>
        <input
          id={ids.code} ref={inputRef} className="cc-code-input" name="one-time-code"
          type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7}
          enterKeyHint="done" placeholder="••••••"
          value={code.length > 3 ? `${code.slice(0, 3)} ${code.slice(3)}` : code}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={[ids.help, shownError ? ids.error : ''].filter(Boolean).join(' ')}
          aria-invalid={shownError ? true : undefined}
          disabled={checking}
        />
        {shownError && <span className="cc-pf-error" id={ids.error} role="alert">{shownError}</span>}
        {info && !shownError && <span className="cc-code-info" role="status">{info}</span>}
      </div>
      <button type="submit" className="cc-pf-submit" disabled={checking || code.length !== 6} style={{ background: readableBackground(color) }}>
        {checking ? 'Verificando…' : 'Ver mi conversación'}
      </button>
      <div className="cc-code-links">
        <button type="button" onClick={() => void resend()} disabled={resendIn > 0}>
          {resendIn > 0 ? `Reenviar código en ${resendIn} s` : 'Reenviar código'}
        </button>
        <button type="button" onClick={onBack}>Cambiar correo</button>
      </div>
      <button type="button" className="cc-code-new" onClick={onNewChat} disabled={busy}>
        {busy ? 'Un momento…' : 'Continuar sin ver el historial'}
      </button>
      <p className="cc-code-note">Seguirás en la misma conversación; por seguridad, en este dispositivo solo verás los mensajes nuevos.</p>
    </form>
  );
}
