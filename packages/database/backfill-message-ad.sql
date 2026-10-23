-- Rellena metadata.ad de los mensajes de anuncio anteriores al 21-10-2026 (cuando el worker empezó
-- a guardarlo), leyendo externalAdReply del mensaje crudo (metadata.rawContent). Con eso el panel
-- muestra la tarjeta del anuncio dentro del mensaje también en los chats viejos. Se corre UNA vez,
-- a mano:
--
--   docker compose -f docker-compose.prod.yml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backfill-message-ad.sql
--
-- Es idempotente (solo toca mensajes sin metadata.ad) y solo marca anuncios reales
-- (sourceType 'ad'), igual que backfill-ad-origin.sql.
SET statement_timeout = '10min';

WITH ad AS (
  SELECT id,
         jsonb_path_query_first((metadata->>'rawContent')::jsonb, '$.**.externalAdReply') AS info,
         jsonb_path_query_first((metadata->>'rawContent')::jsonb, '$.**.entryPointConversionSource') #>> '{}' AS conversion_source,
         jsonb_path_query_first((metadata->>'rawContent')::jsonb, '$.**.entryPointConversionApp') #>> '{}' AS conversion_app
  FROM "Message"
  WHERE direction = 'INBOUND'
    AND metadata->>'rawContent' LIKE '%externalAdReply%'
    AND metadata->'ad' IS NULL
)
UPDATE "Message" m
SET metadata = m.metadata || jsonb_build_object('ad', jsonb_strip_nulls(jsonb_build_object(
  'title', ad.info->>'title',
  'body', ad.info->>'body',
  'sourceType', ad.info->>'sourceType',
  'sourceId', ad.info->>'sourceId',
  'sourceUrl', ad.info->>'sourceUrl',
  'mediaUrl', ad.info->>'mediaUrl',
  'thumbnailUrl', ad.info->>'thumbnailUrl',
  'ctwaClid', ad.info->>'ctwaClid',
  'conversionSource', ad.conversion_source,
  'conversionApp', ad.conversion_app
)))
FROM ad
WHERE m.id = ad.id
  AND ad.info->>'sourceType' = 'ad';
