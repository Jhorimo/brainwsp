import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';

const SCOPES = ['openid', 'email', 'profile'];

@Injectable()
export class GoogleAuthService {
  isConfigured() {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  private redirectUri() {
    return process.env.GOOGLE_AUTH_REDIRECT_URI || `http://localhost:${process.env.API_PORT || 4000}/api/auth/google/callback`;
  }

  private oauthClient() {
    return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, this.redirectUri());
  }

  // Separate OAuth purpose from GoogleCalendarService: this only ever needs to confirm
  // who's signing in (openid/email/profile), never `access_type: offline` — we don't keep
  // these tokens around past the login exchange, unlike the Calendar integration's tokens.
  buildAuthUrl() {
    return this.oauthClient().generateAuthUrl({ scope: SCOPES, prompt: 'select_account' });
  }

  async exchangeCode(code: string) {
    const client = this.oauthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const { data } = await google.oauth2({ auth: client, version: 'v2' }).userinfo.get();
    if (!data.id || !data.email) throw new Error('Google no devolvió un perfil válido');
    return { googleId: data.id, email: data.email.toLowerCase(), name: data.name || data.email };
  }
}
