import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'openid', 'email'];

type StoredTokens = { accessToken: string; refreshToken: string };
type RefreshedTokens = { accessToken: string; expiryDate: Date } | null;

@Injectable()
export class GoogleCalendarService {
  isConfigured() {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  private redirectUri() {
    return process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.API_PORT || 4000}/api/calendar/google/callback`;
  }

  private oauthClient() {
    return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, this.redirectUri());
  }

  // `access_type: offline` + `prompt: consent` guarantees a refresh_token on every
  // authorization (not just the very first one) — otherwise Google only issues it once per
  // user, which breaks "reconnect" after a disconnect.
  buildAuthUrl(state: string) {
    return this.oauthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES, state });
  }

  async exchangeCode(code: string) {
    const client = this.oauthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    let email: string | undefined;
    try {
      const { data } = await google.oauth2({ auth: client, version: 'v2' }).userinfo.get();
      email = data.email || undefined;
    } catch {
      // Non-fatal — the connection still works without a display email, just shows blank.
    }
    return {
      accessToken: tokens.access_token || '',
      refreshToken: tokens.refresh_token || undefined,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3_600_000),
      email,
    };
  }

  // Wires up the client with our stored tokens and captures any refreshed access token
  // Google's SDK issues mid-request, so the caller can persist it back to the DB — without
  // this every future call would burn a refresh round-trip instead of reusing the cache.
  private authorizedClient(tokens: StoredTokens) {
    const client = this.oauthClient();
    client.setCredentials({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
    let refreshed: RefreshedTokens = null;
    client.on('tokens', (t) => {
      if (t.access_token) refreshed = { accessToken: t.access_token, expiryDate: t.expiry_date ? new Date(t.expiry_date) : new Date(Date.now() + 3_600_000) };
    });
    return { client, getRefreshed: () => refreshed };
  }

  async createEvent(
    tokens: StoredTokens,
    calendarId: string,
    event: { title: string; description?: string; location?: string; startAt: Date; endAt: Date },
  ) {
    const { client, getRefreshed } = this.authorizedClient(tokens);
    const calendar = google.calendar({ version: 'v3', auth: client });
    const { data } = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: event.title,
        description: event.description || undefined,
        location: event.location || undefined,
        start: { dateTime: event.startAt.toISOString() },
        end: { dateTime: event.endAt.toISOString() },
      },
    });
    return { googleEventId: data.id as string, htmlLink: data.htmlLink || undefined, refreshedTokens: getRefreshed() };
  }

  // Lists everything on the calendar in range, not just what BrainWSP created — used to
  // render the full shared calendar (other tools/vendors book directly on the same Google
  // account). `singleEvents: true` expands recurring events into concrete instances so we
  // don't have to parse RRULEs ourselves.
  async listEvents(tokens: StoredTokens, calendarId: string, timeMin: Date, timeMax: Date) {
    const { client, getRefreshed } = this.authorizedClient(tokens);
    const calendar = google.calendar({ version: 'v3', auth: client });
    const { data } = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });
    return { events: data.items || [], refreshedTokens: getRefreshed() };
  }

  async deleteEvent(tokens: StoredTokens, calendarId: string, googleEventId: string) {
    const { client, getRefreshed } = this.authorizedClient(tokens);
    const calendar = google.calendar({ version: 'v3', auth: client });
    try {
      await calendar.events.delete({ calendarId, eventId: googleEventId });
    } catch (error) {
      // Already gone on Google's side (deleted from the calendar directly, or the calendar
      // itself was removed) — that's fine, we're deleting our side either way.
      const status = (error as { code?: number; status?: number })?.code ?? (error as { status?: number })?.status;
      if (status !== 404 && status !== 410) throw error;
    }
    return { refreshedTokens: getRefreshed() };
  }

  async revoke(tokens: StoredTokens) {
    const client = this.oauthClient();
    await client.revokeToken(tokens.refreshToken || tokens.accessToken).catch(() => {
      // Best-effort — disconnecting locally must succeed even if Google's revoke call fails
      // (token already invalid, network hiccup, etc).
    });
  }
}
