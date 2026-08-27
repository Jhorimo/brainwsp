// Parsea WEB_ORIGIN (lista separada por comas) en un validador de CORS que además de
// coincidencia exacta admite comodines de subdominio: "https://*.tuefact.com" acepta
// "https://tuefact.com" y cualquier subdominio de un solo nivel ("https://app.tuefact.com"),
// pero no "https://evil-tuefact.com" ni "https://a.b.tuefact.com".
//
// Se usa tanto en el CORS HTTP (main.ts) como en el CORS del WebSocket
// (realtime/realtime.gateway.ts) para que ambos queden sincronizados con una sola fuente
// de verdad.

const DEFAULT_WEB_ORIGIN = 'http://localhost:3000';

type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;
export type CorsOriginValidator = (requestOrigin: string | undefined, callback: CorsOriginCallback) => void;

interface ExactOrigin {
  kind: 'exact';
  raw: string;
}

interface WildcardOrigin {
  kind: 'wildcard';
  raw: string;
  rootDomain: string;
  // Ancla ^...$: exige exactamente una etiqueta opcional + el dominio raíz, nada más
  // (ni sufijos tipo "evil-tuefact.com" ni subdominios de más de un nivel).
  regex: RegExp;
}

type ParsedOrigin = ExactOrigin | WildcardOrigin;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLocalhostDevOrigin(value: string): boolean {
  // Único caso permitido en http://: localhost/127.0.0.1, para desarrollo.
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value);
}

function parseOriginEntry(entry: string): ParsedOrigin | null {
  const value = entry.trim();
  if (!value) return null;

  const wildcardMatch = value.match(/^https:\/\/\*\.([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i);
  if (wildcardMatch) {
    const rootDomain = wildcardMatch[1];
    const escapedRootDomain = escapeRegExp(rootDomain);
    return {
      kind: 'wildcard',
      raw: value,
      rootDomain,
      regex: new RegExp(`^https:\\/\\/([a-z0-9-]+\\.)?${escapedRootDomain}$`, 'i'),
    };
  }

  if (/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(value) || isLocalhostDevOrigin(value)) {
    return { kind: 'exact', raw: value };
  }

  console.warn(`[cors-origin] Entrada ignorada en WEB_ORIGIN (formato inválido): "${value}"`);
  return null;
}

function parseWebOrigin(webOrigin: string): ParsedOrigin[] {
  return webOrigin
    .split(',')
    .map((entry) => parseOriginEntry(entry))
    .filter((entry): entry is ParsedOrigin => entry !== null);
}

/**
 * Construye el validador de origin a pasar a enableCors({ origin }) o a
 * @WebSocketGateway({ cors: { origin } }). Sin header Origin (server-to-server,
 * healthchecks) siempre se permite: esos clientes no envían Origin y no hay nada que
 * validar contra un frontend.
 */
export function createCorsOriginValidator(webOrigin: string = process.env.WEB_ORIGIN || DEFAULT_WEB_ORIGIN): CorsOriginValidator {
  const parsedOrigins = parseWebOrigin(webOrigin);

  return (requestOrigin, callback) => {
    if (!requestOrigin) {
      callback(null, true);
      return;
    }

    const allowed = parsedOrigins.some((entry) =>
      entry.kind === 'exact' ? entry.raw === requestOrigin : entry.regex.test(requestOrigin),
    );

    callback(null, allowed);
  };
}

/**
 * El origen "canónico" para construir URLs de redirect (ej. callbacks de OAuth), donde se
 * necesita un único dominio concreto y no un patrón. Toma el primer origen exacto de
 * WEB_ORIGIN, ignorando entradas con comodín (un comodín no es una URL válida a la que
 * redirigir). Si todo lo que hay son comodines, cae al dominio raíz del primero.
 */
export function getPrimaryWebOrigin(webOrigin: string = process.env.WEB_ORIGIN || DEFAULT_WEB_ORIGIN): string {
  const parsedOrigins = parseWebOrigin(webOrigin);

  const firstExact = parsedOrigins.find((entry): entry is ExactOrigin => entry.kind === 'exact');
  if (firstExact) return firstExact.raw;

  const firstWildcard = parsedOrigins.find((entry): entry is WildcardOrigin => entry.kind === 'wildcard');
  if (firstWildcard) return `https://${firstWildcard.rootDomain}`;

  return DEFAULT_WEB_ORIGIN;
}
