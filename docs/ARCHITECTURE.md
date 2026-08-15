# Arquitectura BrainWSP

## Principios

1. **API desacoplada de WhatsApp.** Reiniciar NestJS no debe tumbar sockets Baileys.
2. **Persistir antes de enviar.** Ningún mensaje sale directamente desde una petición HTTP.
3. **Multi-tenant estricto.** Toda entidad de negocio pertenece a `companyId`.
4. **Una instancia, un dueño.** Redis lease evita sockets duplicados al escalar workers.
5. **Eventos desacoplados.** Worker publica a Redis; API retransmite a Socket.IO.
6. **Compatibilidad legacy sin contaminar el core.** `/api/create-message` traduce la entrada antigua al mismo Message Engine.

## Flujo saliente

```text
BrainPOS
  -> POST /api/create-message
  -> ApiCredentialGuard
  -> PostgreSQL: Message QUEUED
  -> BullMQ whatsapp.outbound
  -> Worker
  -> SessionManager
  -> Baileys
  -> WhatsApp
  -> Message SENT/DELIVERED/READ
  -> Redis Pub/Sub
  -> Socket.IO
  -> Panel
```

## Flujo entrante

```text
WhatsApp
  -> Baileys messages.upsert
  -> Contact upsert
  -> Conversation upsert
  -> Message RECEIVED
  -> Redis Pub/Sub
  -> Socket.IO
  -> Agente
```

## Escalamiento

En una sola máquina puede ejecutarse un worker. Para escalar, inicia N workers con `WORKER_ID` distinto. El lease Redis decide qué proceso mantiene cada sesión.

```text
               Redis leases
              /     |      \
Worker A ----+      |       +---- Worker C
Worker B -----------+

WA-01 -> A
WA-02 -> B
WA-03 -> C
```

La siguiente evolución es agregar un scheduler de afinidad para repartir instancias según CPU/memoria y limitar sesiones por worker.
