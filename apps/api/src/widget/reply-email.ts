// Correo "Te respondieron" de Clienera Chat. Función pura (sin Prisma ni SMTP) para poder
// probarla. HTML simple con tablas y estilos en línea: es lo que mejor se ve en Gmail,
// Outlook y los clientes del celular. Todo texto que viene del chat se escapa.

export type ReplyEmailInput = {
  companyName: string;
  color: string;
  visitorName?: string | null;
  messages: Array<{ text: string; at: Date }>;
  continueUrl: string;
  unsubscribeUrl: string;
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function safeColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#3554d1';
}

// Igual que en el formulario: si el color de marca con texto blanco no llega a 4.5:1, se
// oscurece para el botón.
function readableButton(hex: string) {
  let rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (c: number[]) => {
    const [r, g, b] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (let i = 0; i < 20 && 1.05 / (lum(rgb) + 0.05) < 4.5; i++) rgb = rgb.map((v) => Math.round(v * 0.9));
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(date);
}

export function buildReplyEmail(input: ReplyEmailInput) {
  const company = input.companyName.trim() || 'Nuestro equipo';
  const button = readableButton(safeColor(input.color));
  const greeting = input.visitorName?.trim() ? `Hola ${input.visitorName.trim().split(/\s+/)[0]},` : 'Hola,';
  const count = input.messages.length;
  const subject = count > 1 ? `${company} te respondió (${count} mensajes)` : `${company} te respondió`;
  const shown = input.messages.slice(-3);

  const text = [
    greeting,
    '',
    `${company} respondió a tu consulta:`,
    '',
    ...shown.map((m) => `— ${m.text}`),
    '',
    `Continúa la conversación aquí: ${input.continueUrl}`,
    '',
    `Para no recibir más estos avisos: ${input.unsubscribeUrl}`,
  ].join('\n');

  const bubbles = shown.map((m) => `
          <tr><td style="padding:0 0 10px">
            <div style="background:#f3f5f9;border-radius:12px;padding:12px 14px;font-size:15px;line-height:1.5;color:#1a1f2b;white-space:pre-wrap;word-break:break-word">${escapeHtml(m.text)}</div>
            <div style="font-size:12px;color:#5f6678;padding:4px 2px 0">${escapeHtml(formatTime(m.at))}</div>
          </td></tr>`).join('');

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef1f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
        <tr><td style="background:${safeColor(input.color)};height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>
        <tr><td style="padding:26px 26px 6px">
          <div style="font-size:13px;color:#5f6678;font-weight:bold;text-transform:uppercase;letter-spacing:.5px">${escapeHtml(company)}</div>
          <h1 style="margin:8px 0 4px;font-size:22px;line-height:1.3;color:#1a1f2b">${escapeHtml(greeting)} te respondimos</h1>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#3d4557">${count > 1 ? `Tienes ${count} mensajes nuevos` : 'Tienes un mensaje nuevo'} en tu conversación con ${escapeHtml(company)}.</p>
        </td></tr>
        <tr><td style="padding:0 26px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bubbles}
          </table>
          ${count > shown.length ? `<p style="margin:0 0 12px;font-size:13px;color:#5f6678">y ${count - shown.length} mensaje(s) más en el chat.</p>` : ''}
        </td></tr>
        <tr><td align="center" style="padding:10px 26px 28px">
          <a href="${escapeHtml(input.continueUrl)}" style="display:inline-block;background:${button};color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 26px;border-radius:12px">Continuar la conversación</a>
          <p style="margin:14px 0 0;font-size:13px;color:#5f6678;line-height:1.5">El botón abre tu chat directamente, desde cualquier celular o computadora.</p>
        </td></tr>
        <tr><td style="padding:16px 26px 22px;border-top:1px solid #e6e9f0;font-size:12px;line-height:1.5;color:#5f6678">
          Recibes este aviso porque escribiste a ${escapeHtml(company)} por su chat web.
          <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#3d4557">No quiero recibir más avisos</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html, text };
}
