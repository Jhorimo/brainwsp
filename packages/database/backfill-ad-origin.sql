-- Rellena el anuncio de origen (Conversation.ad*) de los chats anteriores a que el worker lo
-- guardara, leyendo externalAdReply del mensaje crudo (metadata.rawContent). Se corre UNA vez,
-- a mano, después del deploy de la migración 20261021190000_add_conversation_ad_origin:
--
--   docker compose -f docker-compose.prod.yml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backfill-ad-origin.sql
--
-- Es idempotente (solo toca chats con adAt vacío) y usa el ÚLTIMO mensaje de anuncio de cada
-- chat, igual que el worker.
SET statement_timeout = '10min';

WITH ad AS (
  SELECT DISTINCT ON ("conversationId") "conversationId", "createdAt",
         jsonb_path_query_first((metadata->>'rawContent')::jsonb, '$.**.externalAdReply') AS info
  FROM "Message"
  WHERE direction = 'INBOUND' AND metadata->>'rawContent' LIKE '%externalAdReply%'
  ORDER BY "conversationId", "createdAt" DESC
)
UPDATE "Conversation" c
SET "adSourceUrl" = ad.info->>'sourceUrl',
    "adSourceId"  = ad.info->>'sourceId',
    "adTitle"     = left(ad.info->>'title', 200),
    "adAt"        = ad."createdAt"
FROM ad
WHERE c.id = ad."conversationId"
  AND c."adAt" IS NULL
  AND ad.info->>'sourceType' = 'ad';
