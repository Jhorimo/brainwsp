import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { decryptApiSecret, encryptApiSecret } from '../common/utils/secret';
import { PrismaService } from '../prisma/prisma.service';

const SETTINGS_ROW_ID = 1;

export type MailSettingsPatch = {
  smtpEnabled?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean;
  smtpUser?: string | null;
  // undefined = no cambiar; '' = borrar; texto = reemplazar.
  smtpPass?: string;
  mailFromEmail?: string | null;
  mailFromName?: string | null;
};

export type OutgoingMail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

// Servidor de correo de toda la plataforma (ej. Mailtrap), configurado por el superadmin en
// el panel — no por variables de entorno. Mientras no esté activo y completo no se envía
// nada. La contraseña vive cifrada en SystemSettings.smtpPassEnc y nunca sale al navegador
// ni a los logs. Pensado para reutilizarse en otros avisos (ej. recuperar contraseña).
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private cached: { key: string; transporter: Transporter } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async row() {
    return this.prisma.systemSettings.upsert({ where: { id: SETTINGS_ROW_ID }, update: {}, create: { id: SETTINGS_ROW_ID } });
  }

  // Lo que ve el superadmin: nunca la contraseña, solo si hay una guardada.
  async getSettings() {
    const s = await this.row();
    return {
      smtpEnabled: s.smtpEnabled,
      smtpHost: s.smtpHost,
      smtpPort: s.smtpPort,
      smtpSecure: s.smtpSecure,
      smtpUser: s.smtpUser,
      hasPassword: Boolean(s.smtpPassEnc),
      mailFromEmail: s.mailFromEmail,
      mailFromName: s.mailFromName,
      ready: this.isComplete(s),
    };
  }

  async updateSettings(patch: MailSettingsPatch) {
    const { smtpPass, ...rest } = patch;
    const data: Record<string, unknown> = { ...rest };
    for (const key of ['smtpHost', 'smtpUser', 'mailFromEmail', 'mailFromName'] as const) {
      if (typeof data[key] === 'string') data[key] = (data[key] as string).trim() || null;
    }
    if (smtpPass !== undefined) data.smtpPassEnc = smtpPass ? encryptApiSecret(smtpPass) : null;
    const next = await this.prisma.systemSettings.upsert({
      where: { id: SETTINGS_ROW_ID },
      update: data,
      create: { id: SETTINGS_ROW_ID, ...data },
    });
    if (next.smtpEnabled && !this.isComplete(next)) {
      // Se guarda igual (para completar después), pero queda claro por qué no enviará.
      this.logger.warn('correo: activado pero incompleto (falta servidor, puerto o remitente)');
    }
    this.cached = null;
    return this.getSettings();
  }

  // Para el panel de las empresas: solo si los avisos por correo funcionan, sin detalles.
  async status() {
    const s = await this.row();
    return { enabled: s.smtpEnabled && this.isComplete(s) };
  }

  private isComplete(s: { smtpHost: string | null; smtpPort: number | null; mailFromEmail: string | null }) {
    return Boolean(s.smtpHost && s.smtpPort && s.mailFromEmail);
  }

  private async transporter() {
    const s = await this.row();
    if (!s.smtpEnabled || !this.isComplete(s)) return null;
    const key = `${s.updatedAt.toISOString()}`;
    if (this.cached?.key === key) return { transporter: this.cached.transporter, settings: s };
    let pass: string | undefined;
    if (s.smtpPassEnc) {
      try { pass = decryptApiSecret(s.smtpPassEnc); } catch {
        this.logger.error('correo: no se pudo descifrar la contraseña SMTP (¿cambió CREDENTIAL_ENCRYPTION_KEY?)');
        return null;
      }
    }
    const transporter = nodemailer.createTransport({
      host: s.smtpHost!,
      port: s.smtpPort!,
      secure: s.smtpSecure,
      auth: s.smtpUser ? { user: s.smtpUser, pass } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    this.cached = { key, transporter };
    return { transporter, settings: s };
  }

  // Devuelve false si el correo no está configurado (no es un error: simplemente no se envía).
  async send(mail: OutgoingMail): Promise<boolean> {
    const ready = await this.transporter();
    if (!ready) return false;
    const { transporter, settings } = ready;
    const fromName = (mail.fromName || settings.mailFromName || 'Clienera').replace(/["<>]/g, '');
    await transporter.sendMail({
      from: `"${fromName}" <${settings.mailFromEmail}>`,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: mail.replyTo,
      headers: mail.headers,
    });
    return true;
  }

  // Botón «Enviar correo de prueba» del superadmin: muestra el error real del servidor SMTP
  // (sin la contraseña) para poder corregir la configuración.
  async sendTest(to: string) {
    const ready = await this.transporter();
    if (!ready) throw new BadRequestException('Activa el correo y completa servidor, puerto y remitente antes de probar');
    try {
      await this.send({
        to,
        subject: 'Prueba de correo de BrainWSP',
        text: 'Si lees esto, el servidor de correo está bien configurado.',
        html: '<p style="font-family:Arial,sans-serif;font-size:15px">Si lees esto, el servidor de correo está bien configurado. ✅</p>',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`El servidor de correo respondió: ${message.slice(0, 300)}`);
    }
    return { ok: true };
  }
}
