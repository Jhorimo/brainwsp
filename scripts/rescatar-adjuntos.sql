-- Rescate de adjuntos entrantes que quedaron sin archivo ("Imagen no disponible") ANTES del
-- arreglo de recuperación (ver apps/worker/src/media-recovery.ts). No descarga nada por sí
-- mismo: marca los mensajes para que el worker los reintente solo (25 cada 2 min) con el
-- mismo camino del botón "Reintentar descarga".
--
-- Alcance: últimos 14 días (después WhatsApp suele borrar el archivo), con los datos para
-- volver a descargar (rawContent), no eliminados y sin marca previa. Se excluyen archivos de
-- más de 20 MB por si alguno fue borrado a propósito desde "archivos más pesados".
--
-- Uso: primero el conteo (solo lectura); después el UPDATE.

-- 1) Conteo
SELECT m.type, (m.metadata->>'remoteJid') LIKE '%@newsletter' AS canal, count(*)
FROM "Message" m
WHERE m."mediaUrl" IS NULL AND m.deleted = false
  AND m.type IN ('IMAGE','VIDEO','AUDIO','DOCUMENT','STICKER')
  AND m."createdAt" > now() - interval '14 days'
  AND m.metadata ? 'rawContent' AND NOT (m.metadata ? 'mediaError')
  AND coalesce(m."fileSize", 0) <= 20 * 1024 * 1024
GROUP BY 1, 2 ORDER BY 3 DESC;

-- 2) Marcar para reintento
-- UPDATE "Message" m
-- SET metadata = m.metadata || jsonb_build_object('mediaError', 'rescate de adjuntos anteriores', 'mediaRetries', 0, 'mediaRetryAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
-- WHERE m."mediaUrl" IS NULL AND m.deleted = false
--   AND m.type IN ('IMAGE','VIDEO','AUDIO','DOCUMENT','STICKER')
--   AND m."createdAt" > now() - interval '14 days'
--   AND m.metadata ? 'rawContent' AND NOT (m.metadata ? 'mediaError')
--   AND coalesce(m."fileSize", 0) <= 20 * 1024 * 1024;
