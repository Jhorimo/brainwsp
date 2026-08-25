import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { GoogleCalendarIntegration } from '@prisma/client';
import { decryptApiSecret, encryptApiSecret } from '../common/utils/secret';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarService } from './google-calendar.service';

const appointmentInclude = {
  conversation: { select: { id: true, contact: { select: { id: true, name: true, pushName: true, phone: true, waId: true } } } },
  createdByUser: { select: { id: true, name: true } },
} as const;

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleCalendarService,
    private readonly jwt: JwtService,
  ) {}

  async status(companyId: string) {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({ where: { companyId } });
    return {
      configured: this.google.isConfigured(),
      connected: !!integration,
      googleEmail: integration?.googleEmail || null,
    };
  }

  async buildConnectUrl(companyId: string, userId: string) {
    if (!this.google.isConfigured()) {
      throw new BadRequestException('Google Calendar no está configurado en el servidor (faltan GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)');
    }
    // `state` carries who's connecting — Google's redirect back to /callback has no
    // Authorization header, this is how that request learns which company/user to attach
    // the tokens to. Short-lived since it's only meant to survive one consent-screen trip.
    const state = await this.jwt.signAsync({ companyId, userId }, { expiresIn: '10m' });
    return this.google.buildAuthUrl(state);
  }

  // Returns the companyId on success so the controller can build a friendly redirect;
  // throws (caught by the controller) on any failure.
  async handleCallback(code: string, state: string) {
    let payload: { companyId: string; userId: string };
    try {
      payload = await this.jwt.verifyAsync<{ companyId: string; userId: string }>(state);
    } catch {
      throw new BadRequestException('Enlace de conexión inválido o vencido');
    }

    const tokens = await this.google.exchangeCode(code);
    if (!tokens.refreshToken) throw new BadRequestException('Google no otorgó acceso permanente; inténtalo de nuevo');

    await this.prisma.googleCalendarIntegration.upsert({
      where: { companyId: payload.companyId },
      update: {
        accessToken: encryptApiSecret(tokens.accessToken),
        refreshToken: encryptApiSecret(tokens.refreshToken),
        tokenExpiresAt: tokens.expiryDate,
        googleEmail: tokens.email || null,
        connectedByUserId: payload.userId,
      },
      create: {
        companyId: payload.companyId,
        accessToken: encryptApiSecret(tokens.accessToken),
        refreshToken: encryptApiSecret(tokens.refreshToken),
        tokenExpiresAt: tokens.expiryDate,
        googleEmail: tokens.email || null,
        connectedByUserId: payload.userId,
      },
    });

    return payload.companyId;
  }

  async disconnect(companyId: string) {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({ where: { companyId } });
    if (integration) await this.google.revoke(this.tokensOf(integration));
    await this.prisma.googleCalendarIntegration.deleteMany({ where: { companyId } });
    return { success: true };
  }

  listAppointments(companyId: string) {
    return this.prisma.calendarEvent.findMany({
      where: { companyId },
      orderBy: { startAt: 'asc' },
      include: appointmentInclude,
    });
  }

  // Full view of the shared Google Calendar for a date range — not just what BrainWSP
  // created. Other tools/vendors book directly on the same account, so the calendar page
  // reads the calendar itself and cross-references our own rows by googleEventId to tell
  // which ones we can show contact/agent details for and let the user cancel.
  async listRange(companyId: string, from: Date, to: Date) {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({ where: { companyId } });
    if (!integration) return [];

    const { events, refreshedTokens } = await this.google.listEvents(this.tokensOf(integration), integration.calendarId, from, to);
    await this.persistRefresh(companyId, refreshedTokens);

    const ours = await this.prisma.calendarEvent.findMany({
      where: { companyId, startAt: { gte: from, lt: to } },
      include: appointmentInclude,
    });
    const byGoogleId = new Map(ours.map((a) => [a.googleEventId, a]));

    return events
      .filter((e) => e.start?.dateTime && e.end?.dateTime)
      .map((e) => {
        const match = byGoogleId.get(e.id!);
        const startAt = e.start!.dateTime!;
        const endAt = e.end!.dateTime!;
        if (match) {
          return {
            id: match.id,
            title: match.title,
            description: match.description,
            location: match.location,
            startAt,
            endAt,
            conversation: match.conversation,
            createdByUser: match.createdByUser,
            creatorEmail: null as string | null,
            source: 'brainwsp' as const,
            cancellable: true,
          };
        }
        return {
          id: `google:${e.id}`,
          title: e.summary || '(Sin título)',
          description: e.description || null,
          location: e.location || null,
          startAt,
          endAt,
          conversation: null,
          createdByUser: null,
          creatorEmail: e.creator?.email || e.organizer?.email || null,
          source: 'google' as const,
          cancellable: false,
        };
      });
  }

  async createAppointment(
    companyId: string,
    userId: string,
    input: { conversationId: string; title: string; description?: string; location?: string; startAt: string; endAt: string },
  ) {
    const integration = await this.getIntegration(companyId);
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: input.conversationId, companyId },
      include: { contact: true },
    });
    if (!conversation) throw new NotFoundException('Conversación no encontrada');

    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      throw new BadRequestException('El rango de fechas de la cita es inválido');
    }

    const contactLabel = conversation.contact.name || conversation.contact.pushName || conversation.contact.phone || conversation.contact.waId;
    const description = [
      input.description?.trim(),
      `Contacto: ${contactLabel}${conversation.contact.phone ? ` · ${conversation.contact.phone}` : ''}`,
    ].filter(Boolean).join('\n\n');

    const result = await this.google.createEvent(this.tokensOf(integration), integration.calendarId, {
      title: input.title.trim(),
      description,
      location: input.location?.trim(),
      startAt,
      endAt,
    });
    await this.persistRefresh(companyId, result.refreshedTokens);

    return this.prisma.calendarEvent.create({
      data: {
        companyId,
        conversationId: conversation.id,
        contactId: conversation.contactId,
        googleEventId: result.googleEventId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        location: input.location?.trim() || null,
        startAt,
        endAt,
        createdByUserId: userId,
      },
      include: appointmentInclude,
    });
  }

  async deleteAppointment(companyId: string, id: string) {
    const appointment = await this.prisma.calendarEvent.findFirst({ where: { id, companyId } });
    if (!appointment) throw new NotFoundException('Cita no encontrada');

    const integration = await this.prisma.googleCalendarIntegration.findUnique({ where: { companyId } });
    if (integration) {
      const result = await this.google.deleteEvent(this.tokensOf(integration), integration.calendarId, appointment.googleEventId);
      await this.persistRefresh(companyId, result.refreshedTokens);
    }

    await this.prisma.calendarEvent.delete({ where: { id } });
    return { success: true };
  }

  private async getIntegration(companyId: string) {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({ where: { companyId } });
    if (!integration) throw new BadRequestException('Conecta Google Calendar primero desde el módulo Calendario');
    return integration;
  }

  private tokensOf(integration: GoogleCalendarIntegration) {
    return { accessToken: decryptApiSecret(integration.accessToken), refreshToken: decryptApiSecret(integration.refreshToken) };
  }

  private async persistRefresh(companyId: string, refreshed: { accessToken: string; expiryDate: Date } | null) {
    if (!refreshed) return;
    await this.prisma.googleCalendarIntegration.update({
      where: { companyId },
      data: { accessToken: encryptApiSecret(refreshed.accessToken), tokenExpiresAt: refreshed.expiryDate },
    });
  }
}
