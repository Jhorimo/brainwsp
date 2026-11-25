// Sugerencias para escribir el correo lo más rápido y sin errores posible en el formulario
// del enlace público de Clienera Chat: completar el dominio con un toque y detectar los
// errores típicos ("gmial.com", "hotmial.com", "gmail.con").
export const COMMON_EMAIL_DOMAINS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com', 'outlook.es', 'hotmail.es', 'yahoo.es'];

// Atajos que se muestran mientras todavía no hay "@".
export const QUICK_EMAIL_DOMAINS = ['gmail.com', 'hotmail.com', 'outlook.com'];

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      // Transposición ("gmial" ↔ "gmail") cuenta como un solo error.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  }
  return dp[a.length][b.length];
}

// Devuelve el correo corregido si el dominio parece un error de tipeo de uno común, o null.
export function suggestEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return null;
  const user = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (COMMON_EMAIL_DOMAINS.includes(domain)) return null;
  let best: { domain: string; d: number } | null = null;
  for (const candidate of COMMON_EMAIL_DOMAINS) {
    const d = distance(domain, candidate);
    if (d > 0 && d <= 2 && (!best || d < best.d)) best = { domain: candidate, d };
  }
  // Dominios cortos (ej. "uni.pe") no se "corrigen" a gmail por estar a 2 letras.
  if (!best || (best.d === 2 && domain.length < 7)) return null;
  return `${user}@${best.domain}`;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
