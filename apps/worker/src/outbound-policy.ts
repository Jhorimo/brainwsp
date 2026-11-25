// Reglas de reintento y orden de los envíos (outbound-worker). Puras para poder probarlas.
//
// Problemas que resuelven (reporte de Kelmer y Wendy, 25-26/11/2026):
//  - Durante un deploy el worker se reinicia y las líneas tardan ~20 s en reconectar; los
//    envíos de ese momento agotaban sus 5 reintentos en ~45 s y quedaban fallidos ("!").
//    Ahora esperan la reconexión hasta 10 min sin gastar intentos.
//  - Una línea que pide QR nunca se va a reconectar sola: se falla al instante con un
//    motivo claro (antes reintentaba 45 s y el aviso decía "será reintentado").
//  - Con 20 envíos en paralelo, un mensaje posterior del mismo chat podía salir antes que
//    uno anterior más lento (foto, audio) o que estaba reintentando: ahora espera su turno.

export const RECONNECT_WAIT_MS = 10 * 60 * 1000;
export const RECONNECT_RETRY_DELAY_MS = 10 * 1000;
export const ORDER_WAIT_MAX_MS = 10 * 60 * 1000;
export const ORDER_RETRY_DELAY_MS = 2 * 1000;

export type SendErrorKind = 'reconnecting' | 'needs-qr' | 'other';

export function classifySendError(message: string): SendErrorKind {
  if (/requiere escanear el QR|sesión de WhatsApp fue cerrada|genera un QR nuevo/i.test(message)) return 'needs-qr';
  if (/aún no está conectado|Connection Closed|Connection Terminated|not connected|Timed Out/i.test(message)) return 'reconnecting';
  return 'other';
}

// Textos que ve el agente en el mensaje fallido (Message.error).
export const SEND_ERROR_TEXT = {
  waitingReconnect: 'Esperando que la línea se reconecte para enviar',
  reconnectTimeout: 'La línea no se reconectó en 10 minutos',
  needsQr: 'La línea está desconectada: hay que escanear el QR en WhatsApp → líneas',
} as const;

// ¿Sigue esperando la reconexión o ya pasó el tope? Se mide desde que se creó el mensaje.
export function shouldKeepWaiting(createdAt: Date, now = Date.now()) {
  return now - createdAt.getTime() < RECONNECT_WAIT_MS;
}
