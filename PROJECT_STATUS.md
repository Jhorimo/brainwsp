# BrainWSP - Estado del proyecto

## Implementado en esta entrega

### Plataforma SaaS / seguridad
- Estructura monorepo TypeScript.
- Multiempresa mediante `companyId`.
- Autenticación del panel con JWT.
- Usuarios con roles: OWNER, ADMIN, SUPERVISOR y AGENT.
- Gestión de agentes y departamentos desde el panel.
- APP KEY + AUTH KEY para integraciones externas.
- AUTH KEY persistido únicamente como hash con pepper.
- Separación entre API, worker de WhatsApp y frontend.

### WhatsApp / Baileys
- Instancias WhatsApp por empresa.
- Vinculación por QR.
- Credenciales y Signal Keys persistidas en PostgreSQL.
- Session Manager independiente del API.
- Reconexión automática con backoff exponencial + jitter.
- Redis lease para evitar que dos workers controlen la misma instancia.
- Tratamiento separado de logout y connection replaced.
- Idempotencia básica para mensajes entrantes reemitidos después de reconectar.
- Estados de conexión enviados al panel en tiempo real.

### API BrainPOS / ERP
- Endpoint legacy `POST /api/create-message`.
- Compatible con `CURLOPT_POSTFIELDS => array(...)` de PHP (multipart/form-data).
- `appkey`, `authkey`, `to`, `message`, `sandbox`.
- API v1 con headers `X-App-Key` y `X-Auth-Key`.
- Texto y documento/PDF por URL.
- Consulta de estado de mensaje.
- BullMQ: la API persiste y encola; no bloquea esperando a WhatsApp.

### Chat en vivo
- Contactos y conversaciones persistidos.
- Bandeja estilo WhatsApp Web.
- Socket.IO para eventos en tiempo real.
- Redis Pub/Sub worker -> API -> navegador.
- Agente puede responder desde el panel.
- Tomar conversación.
- Transferir a otro agente.
- Asignar departamento.
- Contadores de no leídos.
- Estados SENT / DELIVERED / READ cuando WhatsApp los reporta.

### Infraestructura
- PostgreSQL 16.
- Redis 7.
- MinIO preparado.
- Dockerfiles para API, worker y web.
- Docker Compose local.
- Swagger.
- Documentación de arquitectura, seguridad, producción y roadmap.

## Siguiente fase recomendada

1. Descarga y persistencia de multimedia entrante en S3/MinIO.
2. Envío de imagen, audio, video, contacto y ubicación en API v1.
3. Webhooks firmados con reintentos y dead-letter queue.
4. Asignación automática Round Robin / menor carga / por horario.
5. Presencia real de agentes ONLINE / AWAY / OFFLINE.
6. Respuestas rápidas, notas internas, etiquetas y SLA.
7. Perfil 360 integrado con BrainPOS y BrainERP.
8. Meta WhatsApp Cloud API como segundo provider.
9. Agentes IA con handoff a humano y base de conocimiento.
10. Planes, consumo, límites, billing y auditoría ampliada.
11. Pruebas unitarias, integración y E2E en CI/CD.
12. Migraciones Prisma versionadas y despliegue productivo con observabilidad.

## Criterio de producción

Este repositorio es una base funcional y seria para el MVP. Antes de ofrecer SLA comercial se debe completar la batería de pruebas, migraciones versionadas, backups, observabilidad, almacenamiento de multimedia, rate limiting, webhooks e infraestructura redundante descritos en `docs/PRODUCTION.md`.
