import { createDecipheriv, createHmac } from 'node:crypto';

// Los WhatsApp recientes ya no mandan la edicion de un mensaje como `protocolMessage`
// sino cifrada dentro de `secretEncryptedMessage` (secretEncType MESSAGE_EDIT). Baileys
// 7.0.0-rc14 -- la ultima version publicada -- no tiene ni una linea que la maneje, asi
// que el evento `messages.update` nunca se emite y hay que descifrarla aqui.
//
// El esquema es el MISMO que Baileys usa para votos de encuesta y respuestas de evento
// (`decryptPollVote` en Utils/process-message.js): la clave sale del `messageSecret` del
// mensaje ORIGINAL, y solo cambia la etiqueta de uso. Es HKDF-SHA256 escrito a mano con
// dos HMAC, y el cifrado es AES-256-GCM con el tag pegado al final del payload.

const GCM_TAG_LENGTH = 16;

// Verificado con una edicion real capturada en produccion (2026-09-23), probando miles de
// variantes offline: la etiqueta es "Message Edit", la clave se deriva igual que en las
// encuestas, y el AAD de GCM va VACIO -- no `idOriginal\0emisor` como en los votos de
// encuesta. El emisor del mensaje original y el de la edicion fueron ambos el @lid del
// cliente, pero segun la conversacion podria ser la forma de telefono, por eso se prueban
// todas las que la conversacion permite (ver `descifrarEdicion`).
const ETIQUETA = 'Message Edit';
const AAD_VACIO = Buffer.alloc(0);

function derivarClave(secreto: Uint8Array, info: Buffer): Buffer {
  const prk = createHmac('sha256', Buffer.alloc(32)).update(secreto).digest();
  return createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest();
}

function gcmDescifrar(payload: Buffer, clave: Buffer, iv: Buffer, aad: Buffer): Buffer {
  const cifrado = payload.subarray(0, payload.length - GCM_TAG_LENGTH);
  const tag = payload.subarray(payload.length - GCM_TAG_LENGTH);
  const d = createDecipheriv('aes-256-gcm', clave, iv);
  d.setAAD(aad);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(cifrado), d.final()]);
}

export type EdicionDescifrada = {
  plano: Buffer;
  etiqueta: string;
  emisorOriginal: string;
  emisorEdicion: string;
};

// El JID con el que WhatsApp derivo la clave puede ser la forma @lid o la de telefono, y
// con o sin sufijo de dispositivo. En vez de adivinar una, se prueban todas las que la
// conversacion permite: son pocas, el descifrado es barato y el tag garantiza que solo
// una combinacion correcta puede tener exito.
export function descifrarEdicion(args: {
  encPayload: Uint8Array;
  encIv: Uint8Array;
  secreto: Uint8Array;
  idOriginal: string;
  emisoresOriginal: string[];
  emisoresEdicion: string[];
}): EdicionDescifrada | null {
  const payload = Buffer.from(args.encPayload);
  const iv = Buffer.from(args.encIv);
  if (payload.length <= GCM_TAG_LENGTH) return null;

  for (const emisorOriginal of args.emisoresOriginal) {
    for (const emisorEdicion of args.emisoresEdicion) {
      const info = Buffer.concat([
        Buffer.from(args.idOriginal),
        Buffer.from(emisorOriginal),
        Buffer.from(emisorEdicion),
        Buffer.from(ETIQUETA),
      ]);
      try {
        return { plano: gcmDescifrar(payload, derivarClave(args.secreto, info), iv, AAD_VACIO), etiqueta: ETIQUETA, emisorOriginal, emisorEdicion };
      } catch {
        // tag invalido: esta combinacion de JID no era; se sigue con la siguiente
      }
    }
  }
  return null;
}

// Quita el sufijo de dispositivo (":22") de un JID. Devuelve null si no es un JID valido.
export function sinDispositivo(jid?: string | null): string | null {
  if (!jid || !jid.includes('@')) return null;
  const [usuario, servidor] = jid.split('@');
  return `${usuario.split(':')[0]}@${servidor}`;
}

// El messageSecret llega como base64 plano (JSON.stringify de un proto) o como el
// {type:'Buffer',data} de BufferJSON, segun como se guardara el rawContent.
export function aBuffer(valor: unknown): Buffer | null {
  if (!valor) return null;
  if (typeof valor === 'string') return Buffer.from(valor, 'base64');
  if (Buffer.isBuffer(valor)) return valor;
  if (valor instanceof Uint8Array) return Buffer.from(valor);
  if (typeof valor === 'object' && 'data' in (valor as Record<string, unknown>)) {
    const data = (valor as { data: unknown }).data;
    if (typeof data === 'string') return Buffer.from(data, 'base64');
    if (Array.isArray(data)) return Buffer.from(data as number[]);
  }
  return null;
}
