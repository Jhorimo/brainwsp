'use client';

import { Check, Copy, Download, ExternalLink, PenLine, QrCode, Share2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useEffect, useId, useRef, useState } from 'react';
import { buildShareLink, LINK_SOURCE_PRESETS, normalizeLinkSource } from '@/lib/link-sources';

const CUSTOM = '__custom__';

// "Enlaces para compartir" del canal Clienera Chat: un enlace por red o campaña
// (/c/<empresa>/<origen>) para pegarlo donde sea; en la conversación se ve por dónde llegó
// el cliente. No tiene nada que ver con el widget embebido en un ERP (script aparte).
export function ShareLinks({ siteUrl, companySlug, companyName }: { siteUrl: string; companySlug: string; companyName?: string }) {
  const [choice, setChoice] = useState('');
  const [customRaw, setCustomRaw] = useState('');
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const qrRef = useRef<HTMLCanvasElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ids = { title: useId(), custom: useId(), customHint: useId(), url: useId() };

  useEffect(() => { setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'); }, []);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  const isCustom = choice === CUSTOM;
  const src = isCustom ? normalizeLinkSource(customRaw) : choice;
  const link = buildShareLink(siteUrl, companySlug, src);
  const missingCustom = isCustom && !src;
  const preset = LINK_SOURCE_PRESETS.find((p) => p.id === choice);
  const fileTag = src || 'general';

  const pick = (value: string) => {
    setChoice(value);
    setCopied(false);
    if (value === CUSTOM) setTimeout(() => customInputRef.current?.focus(), 0);
  };

  const copy = async () => {
    if (missingCustom) { customInputRef.current?.focus(); return; }
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Navegadores sin permiso de portapapeles: se selecciona el texto para Ctrl+C.
      const range = document.createRange();
      const node = document.getElementById(ids.url);
      if (node) { range.selectNodeContents(node); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range); }
      return;
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2500);
  };

  const share = async () => {
    if (missingCustom) { customInputRef.current?.focus(); return; }
    try { await navigator.share({ title: companyName ? `Chatea con ${companyName}` : 'Chatea con nosotros', url: link }); } catch { /* cancelado */ }
  };

  const downloadQr = () => {
    const canvas = qrRef.current;
    if (!canvas || missingCustom) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `qr-chat-${companySlug}-${fileTag}.png`;
    a.click();
  };

  return (
    <section className="share-links" aria-labelledby={ids.title}>
      <div className="share-links-head">
        <h2 id={ids.title}>Enlaces para compartir</h2>
        <p>Pega el enlace donde quieras: tu bio, un mensaje de Messenger, un volante. En el chat verás por dónde llegó cada cliente.</p>
      </div>

      <fieldset className="share-chips">
        <legend>¿Dónde lo vas a compartir?</legend>
        {LINK_SOURCE_PRESETS.map((p) => {
          const Icon = p.icon;
          return (
            <label key={p.id || 'general'} className={`share-chip${choice === p.id ? ' active' : ''}`} title={p.hint}>
              <input type="radio" name="share-src" value={p.id} checked={choice === p.id} onChange={() => pick(p.id)} />
              <Icon size={15} aria-hidden="true" />
              <span>{p.label}</span>
            </label>
          );
        })}
        <label className={`share-chip${isCustom ? ' active' : ''}`} title="Campañas, anuncios, firmas…">
          <input type="radio" name="share-src" value={CUSTOM} checked={isCustom} onChange={() => pick(CUSTOM)} />
          <PenLine size={15} aria-hidden="true" />
          <span>Otro…</span>
        </label>
      </fieldset>

      {isCustom && (
        <div className="field share-custom">
          <label htmlFor={ids.custom}>Nombre del origen</label>
          <input
            id={ids.custom}
            ref={customInputRef}
            value={customRaw}
            onChange={(e) => { setCustomRaw(e.target.value); setCopied(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void copy(); } }}
            placeholder="Ej.: volante noviembre"
            maxLength={40}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="done"
            aria-describedby={ids.customHint}
            aria-invalid={missingCustom && customRaw.length > 0 ? true : undefined}
          />
          <small id={ids.customHint}>
            {src ? <>Se verá como <strong>{src}</strong> en el chat. Enter copia el enlace.</> : 'Escribe una palabra corta: letras y números, sin tildes ni espacios (se ajusta solo).'}
          </small>
        </div>
      )}

      <div className={`share-result${missingCustom ? ' disabled' : ''}`}>
        <div className="share-url" id={ids.url} aria-label="Enlace para compartir">
          {missingCustom ? `${buildShareLink(siteUrl, companySlug, '')}/…` : link}
        </div>
        <div className="share-actions">
          <button type="button" className={`button small primary share-copy${copied ? ' copied' : ''}`} onClick={() => void copy()} disabled={missingCustom}>
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? 'Copiado' : 'Copiar enlace'}
          </button>
          {canShare && (
            <button type="button" className="button small" onClick={() => void share()} disabled={missingCustom}>
              <Share2 size={14} aria-hidden="true" />Compartir
            </button>
          )}
          <a className={`button small${missingCustom ? ' disabled' : ''}`} href={missingCustom ? undefined : link} target="_blank" rel="noreferrer" aria-disabled={missingCustom || undefined}>
            <ExternalLink size={14} aria-hidden="true" />Abrir
          </a>
          <button type="button" className="button small" aria-expanded={qrOpen} onClick={() => setQrOpen((v) => !v)}>
            <QrCode size={14} aria-hidden="true" />{qrOpen ? 'Ocultar QR' : 'QR'}
          </button>
        </div>
        <span className="sr-only" role="status" aria-live="polite">{copied ? 'Enlace copiado al portapapeles' : ''}</span>
      </div>

      {qrOpen && !missingCustom && (
        <div className="share-qr">
          <QRCodeCanvas ref={qrRef} value={link} size={480} marginSize={2} level="M" bgColor="#ffffff" fgColor="#111827" title={`Código QR del enlace ${preset?.label || src || 'general'}`} />
          <div className="share-qr-copy">
            <strong>Código QR {isCustom ? `· ${src}` : preset && preset.id ? `· ${preset.label}` : ''}</strong>
            <span>Para volantes, el mostrador o tarjetas. Al escanearlo se abre el chat.</span>
            <button type="button" className="button small" onClick={downloadQr}><Download size={14} aria-hidden="true" />Descargar PNG</button>
          </div>
        </div>
      )}
    </section>
  );
}
