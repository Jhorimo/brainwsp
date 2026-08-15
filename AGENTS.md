# BrainWSP - instrucciones para agentes de código

## Objetivo
Mantener una plataforma SaaS multiempresa para WhatsApp: Gateway API compatible con BrainPOS/ERP, bandeja de agentes, Session Manager Baileys, colas y realtime.

## Reglas de arquitectura
- No llamar Baileys directamente desde el frontend ni desde controladores HTTP.
- Todo mensaje saliente debe persistirse primero y pasar por `whatsapp.outbound` (BullMQ).
- Toda operación de conexión/desconexión debe pasar por `whatsapp.commands`.
- Filtrar siempre consultas de negocio por `companyId`.
- Nunca guardar `AUTH KEY` en texto plano. Solo `authHash`.
- Nunca almacenar credenciales Baileys en archivos locales en producción. Usar `WhatsAppAuthCredential` y `WhatsAppAuthKey`.
- No arrancar dos sockets para la misma instancia: respetar el lease Redis del Session Manager.
- Los cambios del worker al panel deben publicarse por `brainwsp.realtime` y Socket.IO.
- Los endpoints legacy deben conservar compatibilidad con `multipart/form-data` de PHP/cURL.

## Áreas del repositorio
- `apps/api`: NestJS, autenticación, API pública, panel API, Socket.IO.
- `apps/worker`: Baileys, reconexión, sesiones, procesamiento de colas.
- `apps/web`: Next.js, panel operativo y bandeja de conversaciones.
- `packages/database`: Prisma schema y seed.

## Seguridad
- No imprimir JWT, AUTH KEY ni credenciales Baileys en logs.
- Validar pertenencia `companyId` antes de modificar recursos.
- Cualquier endpoint nuevo del panel debe usar `JwtAuthGuard`.
- Cualquier endpoint público de integración debe usar `ApiCredentialGuard`.
- Secretos de producción solo por variables de entorno / secret manager.

## Antes de fusionar cambios
1. `npm run db:generate`
2. `npm run build`
3. Probar login.
4. Probar creación/conexión de instancia.
5. Probar `/api/create-message` con multipart form.
6. Probar `/api/v1/messages/text` con JSON/headers.
7. Validar reconexión sin volver a escanear QR ante una caída transitoria.
