// Wave 2 backfill — Tag Taxonomy v2 /plan-eng-review M57 2026-05-31.
// Idempotent: ON CONFLICT skip, checkpoint resume từ tag_backfill_progress.last_row_id.
//
// Sources → Tag + junction:
//   1. ZaloLabel (master) → Tag(scope=friend, source=zalo_real, zaloAccountId, sourceZaloLabelId)
//   2. CrmTagGroup       → TagGroup(scope=crm)
//   3. CrmTag            → Tag(scope=crm, source=manual_crm, slug=slugify(name))
//   4. Contact.tags[]    → Tag(scope=crm, source=manual_crm, autoCreate) + ContactTag
//   5. Friend.zaloLabels[] → resolve Tag từ ZaloLabel → FriendTag(addedVia=zalo_real)
//   6. Friend.crmTagsPerNick[] → Tag(scope=friend, source=manual_per_nick) + FriendTag
//   7. Friend.autoTags[] → Tag(scope=friend, source=auto_detect) + FriendTag
//   8. Contact.leadScore → derive tier (A=80+,B=60-79,C=40-59,D=<40) → Tag(scope=friend, source=auto_score) + FriendTag cho ALL friend
//   9. Contact.engagementPattern → Tag(scope=friend, source=auto_engagement) + FriendTag cho ALL friend
//
// Run: pnpm tsx scripts/backfill-tag-taxonomy.ts
// Resume: cùng command — script đọc tag_backfill_progress để skip đã done.

import { PrismaClient, TagScope, TagSource } from '@prisma/client';
import { slugifyTag } from '../backend/src/shared/tag-slug';

const prisma = new PrismaClient({
  datasources: { db: { url: `${process.env.DATABASE_URL}?connection_limit=1` } },
});

const BATCH_SIZE = 500;
const SLEEP_BETWEEN_BATCH_MS = 100;
const PRIORITY_MAP: Record<TagSource, number> = {
  zalo_real: 1,
  manual_per_nick: 2,
  auto_detect: 3,
  auto_score: 4,
  auto_engagement: 5,
  segment_rule: 6,
  manual_crm: 7,
  ai_suggest: 8,
  status: 9,
  import: 10,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getCheckpoint(source: string): Promise<{ lastRowId: string | null; completed: boolean }> {
  const row = await prisma.$queryRaw<Array<{ last_row_id: string | null; completed_at: Date | null }>>`
    SELECT last_row_id, completed_at FROM tag_backfill_progress WHERE source_table = ${source} LIMIT 1
  `;
  if (row.length === 0) {
    await prisma.$executeRaw`
      INSERT INTO tag_backfill_progress (source_table, processed_count) VALUES (${source}, 0)
      ON CONFLICT (source_table) DO NOTHING
    `;
    return { lastRowId: null, completed: false };
  }
  return { lastRowId: row[0].last_row_id, completed: row[0].completed_at !== null };
}

async function updateCheckpoint(source: string, lastRowId: string | null, processed: number, completed = false) {
  await prisma.$executeRaw`
    UPDATE tag_backfill_progress
    SET last_row_id = ${lastRowId},
        processed_count = processed_count + ${processed},
        completed_at = ${completed ? new Date() : null},
        updated_at = NOW()
    WHERE source_table = ${source}
  `;
}

async function backfillZaloLabels() {
  const source = 'zalo_labels';
  const cp = await getCheckpoint(source);
  if (cp.completed) {
    console.log(`[${source}] already completed, skip`);
    return;
  }

  let cursor = cp.lastRowId;
  let totalProcessed = 0;

  while (true) {
    const labels = await prisma.zaloLabel.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, orgId: true, zaloAccountId: true, zaloLabelId: true, text: true, color: true, emoji: true },
    });
    if (labels.length === 0) break;

    for (const lbl of labels) {
      const slug = slugifyTag(lbl.text);
      if (!slug) continue;
      try {
        await prisma.tag.upsert({
          where: {
            // Sử dụng partial unique cũng cần lookup compound. Dùng raw findFirst để safe.
            // Vì Prisma không expose partial unique trực tiếp, dùng deleteMany+create pattern không ổn.
            // → dùng findFirst + create/update.
            // FIX: dùng raw insert ON CONFLICT
            id: 'dummy-impossible-id',
          },
          create: {
            orgId: lbl.orgId,
            name: lbl.text,
            slug,
            color: lbl.color || '#90A4AE',
            emoji: lbl.emoji || null,
            scope: TagScope.friend,
            source: TagSource.zalo_real,
            priority: PRIORITY_MAP.zalo_real,
            zaloAccountId: lbl.zaloAccountId,
            sourceZaloLabelId: lbl.zaloLabelId,
          },
          update: {},
        }).catch(async (err: unknown) => {
          // Fallback: insert qua raw SQL với ON CONFLICT (partial unique cần raw)
          await prisma.$executeRaw`
            INSERT INTO tags (id, org_id, name, slug, color, emoji, scope, source, priority, zalo_account_id, source_zalo_label_id, created_at, updated_at)
            VALUES (gen_random_uuid(), ${lbl.orgId}, ${lbl.text}, ${slug}, ${lbl.color || '#90A4AE'}, ${lbl.emoji || null}, 'friend', 'zalo_real', ${PRIORITY_MAP.zalo_real}, ${lbl.zaloAccountId}, ${lbl.zaloLabelId}, NOW(), NOW())
            ON CONFLICT DO NOTHING
          `;
        });
      } catch (err) {
        console.error(`  [${source}] error on label ${lbl.id}:`, err);
      }
    }

    cursor = labels[labels.length - 1].id;
    totalProcessed += labels.length;
    await updateCheckpoint(source, cursor, labels.length);
    console.log(`[${source}] processed ${totalProcessed} (cursor=${cursor})`);
    await sleep(SLEEP_BETWEEN_BATCH_MS);
  }

  await updateCheckpoint(source, cursor, 0, true);
  console.log(`[${source}] DONE. Total: ${totalProcessed}`);
}

async function backfillCrmTagGroups() {
  const source = 'crm_tag_groups';
  const cp = await getCheckpoint(source);
  if (cp.completed) return console.log(`[${source}] skip`);

  let cursor = cp.lastRowId;
  let total = 0;
  while (true) {
    const groups = await prisma.crmTagGroup.findMany({
      where: cursor ? { id: { gt: cursor } } : { archivedAt: null },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });
    if (groups.length === 0) break;

    for (const g of groups) {
      await prisma.tagGroup.upsert({
        where: { orgId_scope_name: { orgId: g.orgId, scope: TagScope.crm, name: g.name } },
        create: { orgId: g.orgId, scope: TagScope.crm, name: g.name, order: g.order ?? 0 },
        update: {},
      });
    }
    cursor = groups[groups.length - 1].id;
    total += groups.length;
    await updateCheckpoint(source, cursor, groups.length);
    await sleep(SLEEP_BETWEEN_BATCH_MS);
  }
  await updateCheckpoint(source, cursor, 0, true);
  console.log(`[${source}] DONE. Total: ${total}`);
}

async function backfillCrmTags() {
  const source = 'crm_tags';
  const cp = await getCheckpoint(source);
  if (cp.completed) return console.log(`[${source}] skip`);

  let cursor = cp.lastRowId;
  let total = 0;
  while (true) {
    const tags = await prisma.crmTag.findMany({
      where: cursor ? { id: { gt: cursor } } : { archivedAt: null },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });
    if (tags.length === 0) break;

    for (const t of tags) {
      const slug = slugifyTag(t.name);
      if (!slug) continue;
      // Map CrmTag.groupId → TagGroup.id qua tên (cả 2 cùng scope=crm).
      let groupId: string | null = null;
      if (t.groupId) {
        const grp = await prisma.crmTagGroup.findUnique({ where: { id: t.groupId }, select: { name: true, orgId: true } });
        if (grp) {
          const newGroup = await prisma.tagGroup.findUnique({
            where: { orgId_scope_name: { orgId: grp.orgId, scope: TagScope.crm, name: grp.name } },
          });
          groupId = newGroup?.id ?? null;
        }
      }
      await prisma.$executeRaw`
        INSERT INTO tags (id, org_id, name, slug, color, emoji, scope, source, priority, group_id, usage_count, created_at, updated_at)
        VALUES (gen_random_uuid(), ${t.orgId}, ${t.name}, ${slug}, ${t.color}, ${t.emoji}, 'crm', 'manual_crm', ${PRIORITY_MAP.manual_crm}, ${groupId}, ${t.usageCount ?? 0}, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `;
    }
    cursor = tags[tags.length - 1].id;
    total += tags.length;
    await updateCheckpoint(source, cursor, tags.length);
    await sleep(SLEEP_BETWEEN_BATCH_MS);
  }
  await updateCheckpoint(source, cursor, 0, true);
  console.log(`[${source}] DONE. Total: ${total}`);
}

async function backfillContactTags() {
  const source = 'contact_tags_json';
  const cp = await getCheckpoint(source);
  if (cp.completed) return console.log(`[${source}] skip`);

  let cursor = cp.lastRowId;
  let total = 0;
  while (true) {
    const contacts = await prisma.contact.findMany({
      where: { ...(cursor ? { id: { gt: cursor } } : {}), tags: { not: [] } },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, orgId: true, tags: true },
    });
    if (contacts.length === 0) break;

    for (const c of contacts) {
      const tags = (c.tags as string[]) ?? [];
      for (const rawTag of tags) {
        if (!rawTag || typeof rawTag !== 'string') continue;
        const slug = slugifyTag(rawTag);
        if (!slug) continue;
        const cleanName = rawTag.trim();
        // Upsert Tag (scope=crm, manual_crm) qua raw — partial unique cần raw INSERT ON CONFLICT
        await prisma.$executeRaw`
          INSERT INTO tags (id, org_id, name, slug, color, scope, source, priority, created_at, updated_at)
          VALUES (gen_random_uuid(), ${c.orgId}, ${cleanName}, ${slug}, '#90A4AE', 'crm', 'manual_crm', ${PRIORITY_MAP.manual_crm}, NOW(), NOW())
          ON CONFLICT DO NOTHING
        `;
        // Lookup Tag id
        const tagRow = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM tags WHERE org_id = ${c.orgId} AND scope = 'crm' AND slug = ${slug} AND zalo_account_id IS NULL LIMIT 1
        `;
        if (tagRow.length === 0) continue;
        await prisma.$executeRaw`
          INSERT INTO contact_tags (id, contact_id, tag_id, added_via, added_at)
          VALUES (gen_random_uuid(), ${c.id}, ${tagRow[0].id}, 'manual_crm', NOW())
          ON CONFLICT DO NOTHING
        `;
      }
    }
    cursor = contacts[contacts.length - 1].id;
    total += contacts.length;
    await updateCheckpoint(source, cursor, contacts.length);
    console.log(`[${source}] processed ${total} contacts (cursor=${cursor})`);
    await sleep(SLEEP_BETWEEN_BATCH_MS);
  }
  await updateCheckpoint(source, cursor, 0, true);
  console.log(`[${source}] DONE. Total: ${total}`);
}

async function backfillFriendTagsFromLegacyCols() {
  const source = 'friend_legacy_cols';
  const cp = await getCheckpoint(source);
  if (cp.completed) return console.log(`[${source}] skip`);

  let cursor = cp.lastRowId;
  let total = 0;

  while (true) {
    const friends = await prisma.friend.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        orgId: true,
        contactId: true,
        zaloAccountId: true,
        zaloLabels: true,
        crmTagsPerNick: true,
        autoTags: true,
      },
    });
    if (friends.length === 0) break;

    for (const f of friends) {
      // (a) zaloLabels[] → resolve Tag(zalo_real, account) → FriendTag
      const zLabels = (f.zaloLabels as Array<{ id?: number; name?: string }>) ?? [];
      for (const z of zLabels) {
        if (!z || typeof z !== 'object' || !z.id) continue;
        const tagRow = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM tags WHERE org_id = ${f.orgId} AND zalo_account_id = ${f.zaloAccountId} AND source_zalo_label_id = ${z.id} LIMIT 1
        `;
        if (tagRow.length === 0) continue;
        await prisma.$executeRaw`
          INSERT INTO friend_tags (id, friend_id, tag_id, added_via, added_at)
          VALUES (gen_random_uuid(), ${f.id}, ${tagRow[0].id}, 'zalo_real', NOW())
          ON CONFLICT DO NOTHING
        `;
      }

      // (b) crmTagsPerNick[] → Tag(scope=friend, source=manual_per_nick, zaloAccountId=NULL) + FriendTag
      const manualPerNick = (f.crmTagsPerNick as string[]) ?? [];
      for (const raw of manualPerNick) {
        if (!raw || typeof raw !== 'string') continue;
        const slug = slugifyTag(raw);
        if (!slug) continue;
        await prisma.$executeRaw`
          INSERT INTO tags (id, org_id, name, slug, color, scope, source, priority, created_at, updated_at)
          VALUES (gen_random_uuid(), ${f.orgId}, ${raw.trim()}, ${slug}, '#90A4AE', 'friend', 'manual_per_nick', ${PRIORITY_MAP.manual_per_nick}, NOW(), NOW())
          ON CONFLICT DO NOTHING
        `;
        const tagRow = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM tags WHERE org_id = ${f.orgId} AND scope = 'friend' AND slug = ${slug} AND zalo_account_id IS NULL LIMIT 1
        `;
        if (tagRow.length === 0) continue;
        await prisma.$executeRaw`
          INSERT INTO friend_tags (id, friend_id, tag_id, added_via, added_at)
          VALUES (gen_random_uuid(), ${f.id}, ${tagRow[0].id}, 'manual_per_nick', NOW())
          ON CONFLICT DO NOTHING
        `;
      }

      // (c) autoTags[] → Tag(scope=friend, source=auto_detect) + FriendTag
      const autoTags = (f.autoTags as string[]) ?? [];
      for (const raw of autoTags) {
        if (!raw || typeof raw !== 'string') continue;
        const slug = slugifyTag(raw);
        if (!slug) continue;
        await prisma.$executeRaw`
          INSERT INTO tags (id, org_id, name, slug, color, scope, source, priority, created_at, updated_at)
          VALUES (gen_random_uuid(), ${f.orgId}, ${raw.trim()}, ${slug}, '#90A4AE', 'friend', 'auto_detect', ${PRIORITY_MAP.auto_detect}, NOW(), NOW())
          ON CONFLICT DO NOTHING
        `;
        const tagRow = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM tags WHERE org_id = ${f.orgId} AND scope = 'friend' AND slug = ${slug} AND zalo_account_id IS NULL LIMIT 1
        `;
        if (tagRow.length === 0) continue;
        await prisma.$executeRaw`
          INSERT INTO friend_tags (id, friend_id, tag_id, added_via, added_at)
          VALUES (gen_random_uuid(), ${f.id}, ${tagRow[0].id}, 'auto_detect', NOW())
          ON CONFLICT DO NOTHING
        `;
      }
    }

    cursor = friends[friends.length - 1].id;
    total += friends.length;
    await updateCheckpoint(source, cursor, friends.length);
    console.log(`[${source}] processed ${total} friends (cursor=${cursor})`);
    await sleep(SLEEP_BETWEEN_BATCH_MS);
  }
  await updateCheckpoint(source, cursor, 0, true);
  console.log(`[${source}] DONE. Total: ${total}`);
}

async function backfillScoreTier() {
  const source = 'contact_score_tier';
  const cp = await getCheckpoint(source);
  if (cp.completed) return console.log(`[${source}] skip`);

  const TIER_RULES: Array<{ slug: string; name: string; min: number; max: number }> = [
    { slug: 'tier-a', name: 'Tier A (80+)', min: 80, max: 100 },
    { slug: 'tier-b', name: 'Tier B (60-79)', min: 60, max: 79 },
    { slug: 'tier-c', name: 'Tier C (40-59)', min: 40, max: 59 },
    { slug: 'tier-d', name: 'Tier D (<40)', min: 0, max: 39 },
  ];

  let cursor = cp.lastRowId;
  let total = 0;
  while (true) {
    const contacts = await prisma.contact.findMany({
      where: { ...(cursor ? { id: { gt: cursor } } : {}), leadScore: { not: null } },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, orgId: true, leadScore: true },
    });
    if (contacts.length === 0) break;

    for (const c of contacts) {
      const score = c.leadScore ?? 0;
      const tier = TIER_RULES.find((r) => score >= r.min && score <= r.max);
      if (!tier) continue;
      // Tag once per org (scope=friend, source=auto_score, slug=tier-X)
      await prisma.$executeRaw`
        INSERT INTO tags (id, org_id, name, slug, color, scope, source, priority, created_at, updated_at)
        VALUES (gen_random_uuid(), ${c.orgId}, ${tier.name}, ${tier.slug}, '#FFA726', 'friend', 'auto_score', ${PRIORITY_MAP.auto_score}, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `;
      const tagRow = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM tags WHERE org_id = ${c.orgId} AND scope = 'friend' AND slug = ${tier.slug} AND zalo_account_id IS NULL LIMIT 1
      `;
      if (tagRow.length === 0) continue;
      // FriendTag cho ALL friend của contact
      const friends = await prisma.friend.findMany({ where: { contactId: c.id }, select: { id: true } });
      for (const f of friends) {
        await prisma.$executeRaw`
          INSERT INTO friend_tags (id, friend_id, tag_id, added_via, added_at)
          VALUES (gen_random_uuid(), ${f.id}, ${tagRow[0].id}, 'auto_score', NOW())
          ON CONFLICT DO NOTHING
        `;
      }
    }
    cursor = contacts[contacts.length - 1].id;
    total += contacts.length;
    await updateCheckpoint(source, cursor, contacts.length);
    await sleep(SLEEP_BETWEEN_BATCH_MS);
  }
  await updateCheckpoint(source, cursor, 0, true);
  console.log(`[${source}] DONE. Total: ${total}`);
}

async function backfillEngagementPattern() {
  const source = 'contact_engagement';
  const cp = await getCheckpoint(source);
  if (cp.completed) return console.log(`[${source}] skip`);

  const PATTERN_NAMES: Record<string, string> = {
    hot: '🔥 Hot',
    champion: '🏆 Champion',
    stable: '✅ Stable',
    cooling: '❄️ Cooling',
    cold: '🧊 Cold',
    noise: '🔇 Noise',
  };

  let cursor = cp.lastRowId;
  let total = 0;
  while (true) {
    const contacts = await prisma.contact.findMany({
      where: { ...(cursor ? { id: { gt: cursor } } : {}), engagementPattern: { not: null } },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, orgId: true, engagementPattern: true },
    });
    if (contacts.length === 0) break;

    for (const c of contacts) {
      const p = c.engagementPattern;
      if (!p || !PATTERN_NAMES[p]) continue;
      const slug = `engagement-${p}`;
      await prisma.$executeRaw`
        INSERT INTO tags (id, org_id, name, slug, color, scope, source, priority, created_at, updated_at)
        VALUES (gen_random_uuid(), ${c.orgId}, ${PATTERN_NAMES[p]}, ${slug}, '#F44336', 'friend', 'auto_engagement', ${PRIORITY_MAP.auto_engagement}, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `;
      const tagRow = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM tags WHERE org_id = ${c.orgId} AND scope = 'friend' AND slug = ${slug} AND zalo_account_id IS NULL LIMIT 1
      `;
      if (tagRow.length === 0) continue;
      const friends = await prisma.friend.findMany({ where: { contactId: c.id }, select: { id: true } });
      for (const f of friends) {
        await prisma.$executeRaw`
          INSERT INTO friend_tags (id, friend_id, tag_id, added_via, added_at)
          VALUES (gen_random_uuid(), ${f.id}, ${tagRow[0].id}, 'auto_engagement', NOW())
          ON CONFLICT DO NOTHING
        `;
      }
    }
    cursor = contacts[contacts.length - 1].id;
    total += contacts.length;
    await updateCheckpoint(source, cursor, contacts.length);
    await sleep(SLEEP_BETWEEN_BATCH_MS);
  }
  await updateCheckpoint(source, cursor, 0, true);
  console.log(`[${source}] DONE. Total: ${total}`);
}

async function main() {
  console.log('═══ Wave 2 Tag Taxonomy Backfill ═══');
  console.log(`Batch size: ${BATCH_SIZE}, sleep between: ${SLEEP_BETWEEN_BATCH_MS}ms`);
  console.log('');

  await backfillZaloLabels();
  await backfillCrmTagGroups();
  await backfillCrmTags();
  await backfillContactTags();
  await backfillFriendTagsFromLegacyCols();
  await backfillScoreTier();
  await backfillEngagementPattern();

  // Verification
  const [tagCount] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint FROM tags`;
  const [crmCount] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint FROM crm_tags WHERE archived_at IS NULL`;
  const [friendTagCount] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint FROM friend_tags`;
  const [contactTagCount] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint FROM contact_tags`;

  console.log('');
  console.log('═══ Verification ═══');
  console.log(`Tag total:        ${tagCount.count}`);
  console.log(`CrmTag legacy:    ${crmCount.count}`);
  console.log(`FriendTag rows:   ${friendTagCount.count}`);
  console.log(`ContactTag rows:  ${contactTagCount.count}`);
  console.log('');
  console.log('Done. Run scripts/backfill-collision-report.ts to verify slug collisions.');
}

main()
  .catch((err) => {
    console.error('[backfill] FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
