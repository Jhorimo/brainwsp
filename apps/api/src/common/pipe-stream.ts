import type { Response } from 'express';
import type { Readable } from 'node:stream';

/**
 * Envía un stream de MinIO al cliente cerrando SIEMPRE el origen.
 *
 * `stream.pipe(res)` por sí solo no destruye el origen cuando el cliente corta la
 * descarga a media (cerrar la pestaña, cancelar un audio, perder la conexión móvil):
 * MinIO sigue empujando bytes hacia un socket que ya nadie lee y esos datos se
 * acumulan en el búfer del kernel. Cada descarga abortada deja un socket huérfano
 * reteniendo su búfer hasta que el proceso muere.
 *
 * El 31-08-2026 eso llenó los 2,8 GB de `net.ipv4.tcp_mem` del servidor con solo 28
 * sockets vivos (~100 MB cada uno) y tumbó los cinco sistemas de mipse a la vez: la
 * memoria TCP es del kernel y se comparte entre todos los contenedores.
 *
 * `res.on('close')` cubre tanto el final normal como el corte prematuro; destruir un
 * stream ya terminado no hace nada, así que es seguro en ambos casos.
 */
export function pipeToResponse(stream: Readable, res: Response): void {
  const cerrarOrigen = () => {
    if (!stream.destroyed) stream.destroy();
  };

  stream.on('error', () => {
    cerrarOrigen();
    res.destroy();
  });
  res.on('close', cerrarOrigen);

  stream.pipe(res);
}
