// Simula una llamada de WhatsApp entrante SIN llamar de verdad (solo para local).
// Requiere que el worker corra con ALLOW_CALL_SIMULATION=1. Nada sale a WhatsApp: el rechazo
// de una llamada simulada no toca el socket y el mensaje automático queda sin enviar.
//
// Uso:
//   node apps/worker/scripts/simulate-call.mjs <instanceId> <telefono> [voz|video] [timeout|accept|terminate|none] [segundos]
// Ejemplos:
//   node apps/worker/scripts/simulate-call.mjs 87ed...a40d 51999888777            # suena y a los 12 s se pierde
//   node apps/worker/scripts/simulate-call.mjs 87ed...a40d 51999888777 video accept 6
//   node apps/worker/scripts/simulate-call.mjs 87ed...a40d 51999888777 voz none   # suena hasta rechazar (máx. 75 s)
import { Queue } from 'bullmq';

const [instanceId, phone, kind = 'voz', end = 'timeout', seconds = '12'] = process.argv.slice(2);
if (!instanceId || !phone) {
  console.error('Uso: node apps/worker/scripts/simulate-call.mjs <instanceId> <telefono> [voz|video] [timeout|accept|terminate|none] [segundos]');
  process.exit(1);
}
const url = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
const queue = new Queue('whatsapp.commands', {
  connection: { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined },
});
await queue.add('simulate-call', { instanceId, phone, isVideo: kind === 'video', end, afterSeconds: Number(seconds) }, { removeOnComplete: 100, removeOnFail: 100 });
console.log(`Llamada simulada encolada (${kind}, termina: ${end} a los ${seconds}s). Mira el panel.`);
await queue.close();
