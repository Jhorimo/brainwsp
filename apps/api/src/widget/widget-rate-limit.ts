// Límite de tasa mínimo para el endpoint público del widget (sin JWT ni APP KEY) — evita
// que un script le pegue en bucle al endpoint de mensajes. Deliberadamente simple
// (ventana fija en memoria): alcanza para una sola instancia de API, que es el único
// despliegue que existe hoy. Si se escalan varias instancias de `api`, esto deja de
// compartir estado entre ellas y hay que moverlo a Redis (ver AGENTS.md: Redis ya está
// disponible para todo lo demás) — marcado como pendiente de Fase 2 en el roadmap.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

const hits = new Map<string, { count: number; resetAt: number }>();

// Limpieza perezosa: se purgan entradas vencidas en cada llamada en vez de un setInterval
// aparte, así no hay un timer más que gestionar en el ciclo de vida del proceso.
function purgeExpired(now: number) {
  for (const [key, entry] of hits) {
    if (entry.resetAt <= now) hits.delete(key);
  }
}

export function checkWidgetRateLimit(key: string): boolean {
  const now = Date.now();
  purgeExpired(now);
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_PER_WINDOW) return false;
  entry.count += 1;
  return true;
}
