// One-off cleanup for the `@lid` contact-splitting bug: WhatsApp can route the same
// real 1:1 contact through either the classic phone JID or an opaque `@lid` JID
// depending on the message, and the worker used to key Contact/Conversation by
// whichever one arrived first — silently forking one client into two threads with
// separate history, leads and deals. apps/worker/src/session-manager.ts now resolves
// both to the same identity going forward; this script consolidates contacts that
// already split before that fix, so each phone number keeps exactly one thread.
//
// Dry-run by default — prints what it would do without touching the database.
// Run for real with: MERGE_APPLY=1 npx tsx merge-duplicate-contacts.ts
// Optionally scope to one company: MERGE_COMPANY_ID=<id> ... (recommended on first run)
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.env.MERGE_APPLY === '1';
const COMPANY_ID = process.env.MERGE_COMPANY_ID || undefined;

async function main() {
  const contacts = await prisma.contact.findMany({
    where: { phone: { not: null }, ...(COMPANY_ID ? { companyId: COMPANY_ID } : {}) },
    select: {
      id: true, companyId: true, phone: true, waId: true, name: true, pushName: true, createdAt: true,
      _count: { select: { messages: true, conversations: true } },
    },
  });

  const groups = new Map<string, typeof contacts>();
  for (const contact of contacts) {
    const key = `${contact.companyId}:${contact.phone}`;
    const list = groups.get(key) || [];
    list.push(contact);
    groups.set(key, list);
  }

  const duplicateGroups = [...groups.values()].filter((list) => list.length > 1);
  console.log(`Found ${duplicateGroups.length} phone number(s) with duplicate contacts.\n`);

  let totalMerged = 0;
  for (const group of duplicateGroups) {
    // Keep whichever contact has the most message history (the "real", actively used
    // thread); ties go to whichever was created first.
    const sorted = [...group].sort((a, b) =>
      b._count.messages - a._count.messages || a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const [primary, ...duplicates] = sorted;

    console.log(`Phone ${primary.phone} (company ${primary.companyId}):`);
    console.log(`  KEEP    ${primary.id}  waId=${primary.waId}  name="${primary.name || primary.pushName || ''}"  messages=${primary._count.messages}  conversations=${primary._count.conversations}`);
    for (const dup of duplicates) {
      console.log(`  MERGE   ${dup.id}  waId=${dup.waId}  name="${dup.name || dup.pushName || ''}"  messages=${dup._count.messages}  conversations=${dup._count.conversations}`);
    }

    if (APPLY) {
      await mergeContacts(primary.id, duplicates.map((d) => d.id));
      console.log('  -> merged.');
    }
    console.log('');
    totalMerged += duplicates.length;
  }

  console.log(`${APPLY ? 'Merged' : 'Would merge'} ${totalMerged} duplicate contact(s) across ${duplicateGroups.length} phone number(s).`);
  if (!APPLY && duplicateGroups.length > 0) {
    console.log('\nThis was a dry run — nothing was changed. Re-run with MERGE_APPLY=1 to apply.');
  }
}

async function mergeContacts(primaryId: string, duplicateIds: string[]) {
  for (const duplicateId of duplicateIds) {
    await prisma.$transaction(async (tx) => {
      const duplicateConversations = await tx.conversation.findMany({
        where: { contactId: duplicateId },
        select: { id: true, instanceId: true },
      });

      for (const conv of duplicateConversations) {
        const primaryConv = await tx.conversation.findUnique({
          where: { instanceId_contactId: { instanceId: conv.instanceId, contactId: primaryId } },
          select: { id: true },
        });

        if (primaryConv) {
          // Primary already has a thread on this same WhatsApp instance — fold the
          // duplicate's messages/leads/deals/calendar events into it, then drop the
          // now-empty duplicate conversation.
          await tx.message.updateMany({ where: { conversationId: conv.id }, data: { conversationId: primaryConv.id, contactId: primaryId } });
          await tx.incident.updateMany({ where: { conversationId: conv.id }, data: { conversationId: primaryConv.id } });
          await tx.lead.updateMany({ where: { conversationId: conv.id }, data: { conversationId: primaryConv.id, contactId: primaryId } });
          await tx.deal.updateMany({ where: { conversationId: conv.id }, data: { conversationId: primaryConv.id, contactId: primaryId } });
          await tx.calendarEvent.updateMany({ where: { conversationId: conv.id }, data: { conversationId: primaryConv.id, contactId: primaryId } });
          await tx.conversation.delete({ where: { id: conv.id } });
          // Bring the merged thread's activity timestamp/unread count forward if the
          // duplicate was actually the more recently active one.
          const merged = await tx.conversation.findUnique({ where: { id: primaryConv.id }, select: { lastMessageAt: true } });
          const latest = await tx.message.findFirst({ where: { conversationId: primaryConv.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
          if (latest && merged && latest.createdAt > merged.lastMessageAt) {
            await tx.conversation.update({ where: { id: primaryConv.id }, data: { lastMessageAt: latest.createdAt } });
          }
        } else {
          // No thread on this instance yet for the primary contact — just re-point the
          // duplicate's own conversation at the primary contact, keeping its history intact.
          await tx.conversation.update({ where: { id: conv.id }, data: { contactId: primaryId } });
        }
      }

      // Anything left referencing the duplicate contact directly (not through a
      // conversation that just got merged/repointed above) moves over too.
      await tx.message.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } });
      await tx.message.updateMany({ where: { authorContactId: duplicateId }, data: { authorContactId: primaryId } });
      await tx.messageReaction.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } });
      await tx.lead.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } });
      await tx.deal.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } });
      await tx.calendarEvent.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } });

      // Tags: copy any the duplicate had that the primary doesn't, then let the
      // contact delete below cascade-clean the duplicate's own ContactTag rows.
      const duplicateTags = await tx.contactTag.findMany({ where: { contactId: duplicateId }, select: { tagId: true } });
      for (const { tagId } of duplicateTags) {
        await tx.contactTag.upsert({
          where: { contactId_tagId: { contactId: primaryId, tagId } },
          update: {},
          create: { contactId: primaryId, tagId },
        });
      }

      await tx.contact.delete({ where: { id: duplicateId } });
    });
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
