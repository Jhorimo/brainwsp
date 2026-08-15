# Roadmap

## Fase 1 - incluida en esta entrega
- Gateway API.
- APP KEY / AUTH KEY.
- Endpoint legacy compatible con BrainPOS/ERP en PHP multipart/form-data.
- Baileys Session Manager.
- Auth state de Baileys en PostgreSQL.
- Redis lease para evitar sockets duplicados.
- Reconexión automática con backoff + jitter.
- Cola outbound BullMQ.
- Texto + PDF por URL.
- Bandeja en tiempo real.
- Instancias y QR.
- Usuarios/agentes CRUD.
- Roles OWNER / ADMIN / SUPERVISOR / AGENT.
- Departamentos y membresías.
- Tomar y transferir conversaciones manualmente.
- Dashboard base.

## Fase 2 - operación avanzada
- Round Robin / menor carga / reglas por horario.
- Presencia ONLINE / AWAY / OFFLINE de agentes.
- Respuestas rápidas.
- Notas internas.
- Etiquetas y prioridades.
- Imágenes, audio, video y archivos subidos a MinIO/S3.
- Webhooks firmados + reintentos + DLQ.
- Importación de contactos.
- Búsqueda y paginación avanzada de conversaciones.

## Fase 3 - ecosistema Brain Tech
- Conector nativo BrainPOS/BrainERP por cliente/teléfono.
- Perfil 360: ventas, comprobantes, deuda, soporte.
- Botones Enviar comprobante / Crear cotización.
- Reportes operativos y SLA.
- Plantillas de mensajes por evento de negocio.

## Fase 4 - IA
- Agentes IA y base de conocimiento.
- Handoff IA -> humano.
- Resumen automático de conversación.
- Clasificación y prioridad.
- Sugerencias de respuesta para agentes.

## Fase 5 - canal oficial y SaaS comercial
- Meta WhatsApp Cloud API.
- Embedded Signup.
- Planes, cuotas, billing y consumo.
- Workers autoscalables y scheduler de sesiones.
- Observabilidad completa, alertas y SLA.
