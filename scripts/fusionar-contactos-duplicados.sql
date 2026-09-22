-- Fusiona contactos duplicados de un mismo numero dentro de una misma empresa.
--
-- Por que existe: la unicidad de Contact es (companyId, waId), no el telefono, asi que
-- la misma persona puede quedar guardada dos veces -- una bajo su JID de telefono
-- (51923096887@s.whatsapp.net) y otra bajo el JID opaco de privacidad de WhatsApp
-- (248631512842461@lid). La base no lo puede impedir por si sola.
--
-- NO borra nada sin antes mover: Contact tiene onDelete: Cascade, asi que un DELETE
-- directo del duplicado se llevaria sus mensajes por delante.
--
-- Sobreviviente = el contacto MAS ANTIGUO del grupo, que es el que carga el historial.
-- Se excluyen las filas @broadcast: una lista de difusion comparte telefono con un
-- contacto de forma legitima y no es un duplicado.
--
-- USO -- primero en seco (imprime y revierte):
--   docker exec -i brainwsp-postgres-1 psql -U brainwsp -d brainwsp -v aplicar=0 < fusionar-contactos-duplicados.sql
-- y cuando el resultado convenza:
--   docker exec -i brainwsp-postgres-1 psql -U brainwsp -d brainwsp -v aplicar=1 < fusionar-contactos-duplicados.sql

\set ON_ERROR_STOP on
\if :{?aplicar} \else \set aplicar 0 \endif

BEGIN;

CREATE TEMP TABLE pares ON COMMIT DROP AS
SELECT
    c.id                                                                   AS perdedor,
    first_value(c.id) OVER (PARTITION BY c."companyId", c.phone
                            ORDER BY c."createdAt")                        AS superviviente
FROM "Contact" c
JOIN (
    SELECT "companyId", phone
    FROM "Contact"
    WHERE phone IS NOT NULL AND "waId" NOT LIKE '%@broadcast'
    GROUP BY "companyId", phone
    HAVING count(*) > 1
) d ON d."companyId" = c."companyId" AND d.phone = c.phone
WHERE c.phone IS NOT NULL AND c."waId" NOT LIKE '%@broadcast';

DELETE FROM pares WHERE perdedor = superviviente;

\echo '--- contactos que se van a fusionar ---'
SELECT p.superviviente, s."waId" AS waid_superviviente,
       p.perdedor,      l."waId" AS waid_perdedor,
       (SELECT count(*) FROM "Message" m WHERE m."contactId" = p.perdedor) AS msgs_a_mover
FROM pares p
JOIN "Contact" s ON s.id = p.superviviente
JOIN "Contact" l ON l.id = p.perdedor
ORDER BY s."companyId", s.phone;

-- 1. Conversaciones. Conversation es unica por (instanceId, contactId), asi que si el
--    superviviente ya tiene una conversacion en esa misma instancia no se puede
--    repuntar la del perdedor: hay que vaciarla y borrarla.
CREATE TEMP TABLE conv_colision ON COMMIT DROP AS
SELECT cp.id AS conv_perdedora, cs.id AS conv_superviviente
FROM pares p
JOIN "Conversation" cp ON cp."contactId" = p.perdedor
JOIN "Conversation" cs ON cs."contactId" = p.superviviente AND cs."instanceId" = cp."instanceId";

UPDATE "Message" m SET "conversationId" = k.conv_superviviente
FROM conv_colision k WHERE m."conversationId" = k.conv_perdedora;

UPDATE "Incident" i SET "conversationId" = k.conv_superviviente
FROM conv_colision k WHERE i."conversationId" = k.conv_perdedora;

UPDATE "FlowExecution" f SET "conversationId" = k.conv_superviviente
FROM conv_colision k WHERE f."conversationId" = k.conv_perdedora;

UPDATE "Lead" x SET "conversationId" = k.conv_superviviente
FROM conv_colision k WHERE x."conversationId" = k.conv_perdedora;

UPDATE "Deal" x SET "conversationId" = k.conv_superviviente
FROM conv_colision k WHERE x."conversationId" = k.conv_perdedora;

UPDATE "CalendarEvent" x SET "conversationId" = k.conv_superviviente
FROM conv_colision k WHERE x."conversationId" = k.conv_perdedora;

-- El contador de no leidos y la fecha del ultimo mensaje se suman/toman del mas reciente.
UPDATE "Conversation" cs
SET "unreadCount"   = cs."unreadCount" + agg.unread,
    "lastMessageAt" = GREATEST(cs."lastMessageAt", agg.ultimo)
FROM (
    SELECT k.conv_superviviente AS id,
           sum(cp."unreadCount") AS unread,
           max(cp."lastMessageAt") AS ultimo
    FROM conv_colision k JOIN "Conversation" cp ON cp.id = k.conv_perdedora
    GROUP BY k.conv_superviviente
) agg
WHERE cs.id = agg.id;

DELETE FROM "Conversation" c USING conv_colision k WHERE c.id = k.conv_perdedora;

-- Las conversaciones del perdedor que quedan (instancias donde el superviviente no
-- tenia ninguna) se repuntan sin conflicto.
UPDATE "Conversation" c SET "contactId" = p.superviviente
FROM pares p WHERE c."contactId" = p.perdedor;

-- 2. Mensajes y todo lo que apunta al contacto.
UPDATE "Message" m SET "contactId" = p.superviviente
FROM pares p WHERE m."contactId" = p.perdedor;

UPDATE "Message" m SET "authorContactId" = p.superviviente
FROM pares p WHERE m."authorContactId" = p.perdedor;

UPDATE "MessageReaction" r SET "contactId" = p.superviviente
FROM pares p WHERE r."contactId" = p.perdedor;

UPDATE "Lead" x SET "contactId" = p.superviviente
FROM pares p WHERE x."contactId" = p.perdedor;

UPDATE "Deal" x SET "contactId" = p.superviviente
FROM pares p WHERE x."contactId" = p.perdedor;

UPDATE "CalendarEvent" x SET "contactId" = p.superviviente
FROM pares p WHERE x."contactId" = p.perdedor;

-- ContactTag tiene clave primaria (contactId, tagId): copiar las etiquetas que falten
-- y descartar las repetidas en vez de chocar.
INSERT INTO "ContactTag" ("contactId", "tagId", "createdAt")
SELECT p.superviviente, ct."tagId", ct."createdAt"
FROM pares p JOIN "ContactTag" ct ON ct."contactId" = p.perdedor
ON CONFLICT DO NOTHING;

DELETE FROM "ContactTag" ct USING pares p WHERE ct."contactId" = p.perdedor;

-- 3. Rellenar en el superviviente los campos que solo tenga el perdedor. El @lid suele
--    traer pushName y avatar pero no name, y al reves.
UPDATE "Contact" s
SET name       = COALESCE(s.name, agg.name),
    "pushName" = COALESCE(s."pushName", agg.push),
    "avatarUrl"= COALESCE(s."avatarUrl", agg.avatar),
    email      = COALESCE(s.email, agg.email),
    "lastSeenAt" = GREATEST(s."lastSeenAt", agg.visto)
FROM (
    SELECT p.superviviente AS id,
           max(l.name) AS name, max(l."pushName") AS push,
           max(l."avatarUrl") AS avatar, max(l.email) AS email,
           max(l."lastSeenAt") AS visto
    FROM pares p JOIN "Contact" l ON l.id = p.perdedor
    GROUP BY p.superviviente
) agg
WHERE s.id = agg.id;

-- 4. Recien ahora, cuando ya no cuelga nada de ellos, se borran.
DELETE FROM "Contact" c USING pares p WHERE c.id = p.perdedor;

\echo '--- duplicados restantes (debe ser 0) ---'
SELECT count(*) AS pares_restantes FROM (
    SELECT "companyId", phone FROM "Contact"
    WHERE phone IS NOT NULL AND "waId" NOT LIKE '%@broadcast'
    GROUP BY "companyId", phone HAVING count(*) > 1
) t;

\if :aplicar
  \echo '>>> APLICANDO (COMMIT)'
  COMMIT;
\else
  \echo '>>> SIMULACION: se revierte todo (ROLLBACK). Usa -v aplicar=1 para aplicar.'
  ROLLBACK;
\endif
