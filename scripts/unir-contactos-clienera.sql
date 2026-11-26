-- Une los contactos de Clienera Chat (enlace público) que quedaron duplicados por el MISMO
-- correo antes de que "el correo identifica a la persona" (ver WidgetService.saveProfile).
-- Por cada empresa y correo se conserva el contacto MÁS ANTIGUO que tiene chat, y a su chat
-- se mueven los mensajes, sesiones, prospectos, tratos, citas, incidencias, flujos,
-- reacciones, etiquetas y avisos de los duplicados; después se borran los duplicados.
--
-- Uso:
--   1) Vista previa (solo lectura): la consulta de abajo.
--   2) Unir: el bloque DO (todo en una transacción; si algo falla no se cambia nada).

-- 1) Vista previa: grupos con más de un contacto por correo
SELECT c."companyId", lower(c.email) AS correo, count(*) AS contactos,
       string_agg(coalesce(c.name, '(sin nombre)') || ' [' || to_char(c."createdAt", 'DD/MM HH24:MI') || ']', ' | ' ORDER BY c."createdAt") AS detalle
FROM "Contact" c
WHERE c.email IS NOT NULL AND c."visitorId" IS NOT NULL AND (c.source = 'link' OR c.source LIKE 'link:%')
GROUP BY 1, 2 HAVING count(*) > 1
ORDER BY 3 DESC;

-- 2) Unir
-- BEGIN;
-- DO $$
-- DECLARE
--   grp record; keep_id text; keep_conv text; dup record; dup_conv text; merged int := 0;
-- BEGIN
--   FOR grp IN
--     SELECT c."companyId" AS company_id, lower(c.email) AS email
--     FROM "Contact" c
--     WHERE c.email IS NOT NULL AND c."visitorId" IS NOT NULL AND (c.source = 'link' OR c.source LIKE 'link:%')
--     GROUP BY 1, 2 HAVING count(*) > 1
--   LOOP
--     -- El que se queda: el más antiguo con chat (o el más antiguo, si ninguno tiene chat)
--     SELECT c.id INTO keep_id FROM "Contact" c
--     WHERE c."companyId" = grp.company_id AND lower(c.email) = grp.email AND c."visitorId" IS NOT NULL AND (c.source = 'link' OR c.source LIKE 'link:%')
--     ORDER BY (EXISTS (SELECT 1 FROM "Conversation" v WHERE v."contactId" = c.id)) DESC, c."createdAt" ASC LIMIT 1;
--
--     FOR dup IN
--       SELECT c.id FROM "Contact" c
--       WHERE c."companyId" = grp.company_id AND lower(c.email) = grp.email AND c."visitorId" IS NOT NULL AND (c.source = 'link' OR c.source LIKE 'link:%') AND c.id <> keep_id
--     LOOP
--       FOR dup_conv IN SELECT v.id FROM "Conversation" v WHERE v."contactId" = dup.id LOOP
--         SELECT v.id INTO keep_conv FROM "Conversation" v
--         WHERE v."contactId" = keep_id AND v."instanceId" = (SELECT "instanceId" FROM "Conversation" WHERE id = dup_conv);
--         IF keep_conv IS NULL THEN
--           -- El que se queda no tiene chat en esa línea: el chat del duplicado pasa a ser suyo.
--           UPDATE "Conversation" SET "contactId" = keep_id WHERE id = dup_conv;
--         ELSE
--           UPDATE "Message" SET "conversationId" = keep_conv WHERE "conversationId" = dup_conv;
--           UPDATE "Incident" SET "conversationId" = keep_conv WHERE "conversationId" = dup_conv;
--           UPDATE "CalendarEvent" SET "conversationId" = keep_conv WHERE "conversationId" = dup_conv;
--           UPDATE "Lead" SET "conversationId" = keep_conv WHERE "conversationId" = dup_conv;
--           UPDATE "Deal" SET "conversationId" = keep_conv WHERE "conversationId" = dup_conv;
--           UPDATE "FlowExecution" SET "conversationId" = keep_conv WHERE "conversationId" = dup_conv;
--           UPDATE "ConversationEvent" SET "conversationId" = keep_conv WHERE "conversationId" = dup_conv;
--           UPDATE "Conversation" k SET
--             "lastMessageAt" = GREATEST(k."lastMessageAt", d."lastMessageAt"),
--             "unreadCount" = k."unreadCount" + d."unreadCount"
--           FROM "Conversation" d WHERE k.id = keep_conv AND d.id = dup_conv;
--           DELETE FROM "Conversation" WHERE id = dup_conv;
--         END IF;
--         keep_conv := NULL;
--       END LOOP;
--       UPDATE "Message" SET "contactId" = keep_id WHERE "contactId" = dup.id;
--       UPDATE "Message" SET "authorContactId" = keep_id WHERE "authorContactId" = dup.id;
--       UPDATE "MessageReaction" SET "contactId" = keep_id WHERE "contactId" = dup.id;
--       UPDATE "CalendarEvent" SET "contactId" = keep_id WHERE "contactId" = dup.id;
--       UPDATE "Lead" SET "contactId" = keep_id WHERE "contactId" = dup.id;
--       UPDATE "Deal" SET "contactId" = keep_id WHERE "contactId" = dup.id;
--       UPDATE "VisitorSession" SET "contactId" = keep_id WHERE "contactId" = dup.id;
--       INSERT INTO "ContactTag" ("contactId", "tagId") SELECT keep_id, t."tagId" FROM "ContactTag" t WHERE t."contactId" = dup.id ON CONFLICT DO NOTHING;
--       DELETE FROM "Contact" WHERE id = dup.id;
--       merged := merged + 1;
--     END LOOP;
--   END LOOP;
--   RAISE NOTICE 'contactos duplicados unidos: %', merged;
-- END $$;
-- COMMIT;
