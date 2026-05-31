// Wave 0 collision report — /plan-eng-review M57 2026-05-31 (T-F Codex).
// Dry-run Wave 2 backfill, output JSON list duplicate slug across nguồn:
//   - CrmTag.name → slug
//   - Contact.tags[] string entries → slug
//   - ZaloLabel.text per zaloAccountId → slug
// Admin review file collision-report-YYYYMMDD.json TRƯỚC khi commit Wave 2.
//
// Usage: pnpm tsx scripts/backfill-collision-report.ts

import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { slugifyTag } from '../backend/src/shared/tag-slug';

const prisma = new PrismaClient({
  datasources: { db: { url: `${process.env.DATABASE_URL}?connection_limit=1` } },
});

interface SlugBucket {
  slug: string;
  sources: Array<{
    origin: 'CrmTag' | 'Contact.tags' | 'ZaloLabel';
    raw_name: string;
    org_id: string;
    zalo_account_id?: string | null;
    count: number;
  }>;
}

async function main() {
  const buckets = new Map<string, SlugBucket>();

  function add(slug: string, source: SlugBucket['sources'][0]) {
    if (!buckets.has(slug)) buckets.set(slug, { slug, sources: [] });
    buckets.get(slug)!.sources.push(source);
  }

  console.log('[collision-report] Scanning CrmTag...');
  const crmTags = await prisma.crmTag.findMany({ select: { name: true, orgId: true } });
  for (const t of crmTags) {
    const s = slugifyTag(t.name);
    if (!s) continue;
    add(s, { origin: 'CrmTag', raw_name: t.name, org_id: t.orgId, count: 1 });
  }
  console.log(`[collision-report]   ${crmTags.length} CrmTag scanned`);

  console.log('[collision-report] Scanning Contact.tags...');
  const contactRows = await prisma.contact.findMany({
    select: { id: true, orgId: true, tags: true },
    where: { tags: { not: [] } },
  });
  let contactTagCount = 0;
  for (const c of contactRows) {
    const tags = (c.tags as string[]) ?? [];
    for (const raw of tags) {
      if (!raw || typeof raw !== 'string') continue;
      const s = slugifyTag(raw);
      if (!s) continue;
      contactTagCount += 1;
      add(s, { origin: 'Contact.tags', raw_name: raw, org_id: c.orgId, count: 1 });
    }
  }
  console.log(`[collision-report]   ${contactTagCount} Contact.tags entries scanned`);

  console.log('[collision-report] Scanning ZaloLabel...');
  const zaloLabels = await prisma.zaloLabel.findMany({
    select: { text: true, orgId: true, zaloAccountId: true },
  });
  for (const z of zaloLabels) {
    const s = slugifyTag(z.text);
    if (!s) continue;
    add(s, {
      origin: 'ZaloLabel',
      raw_name: z.text,
      org_id: z.orgId,
      zalo_account_id: z.zaloAccountId,
      count: 1,
    });
  }
  console.log(`[collision-report]   ${zaloLabels.length} ZaloLabel scanned`);

  // Filter collisions: slug có >1 source khác nhau (origin OR raw_name khác)
  const collisions = Array.from(buckets.values()).filter((b) => {
    if (b.sources.length < 2) return false;
    const uniqueOrigins = new Set(b.sources.map((s) => `${s.origin}:${s.raw_name}`));
    return uniqueOrigins.size > 1;
  });

  const out = {
    generated_at: new Date().toISOString(),
    total_slugs: buckets.size,
    total_collisions: collisions.length,
    collisions: collisions.sort((a, b) => b.sources.length - a.sources.length),
  };

  const path = `collision-report-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(path, JSON.stringify(out, null, 2));

  console.log('');
  console.log('[collision-report] DONE.');
  console.log(`[collision-report] Total unique slug: ${buckets.size}`);
  console.log(`[collision-report] Collision groups: ${collisions.length}`);
  console.log(`[collision-report] Output: ${path}`);
  console.log('[collision-report] Admin review TRƯỚC khi chạy Wave 2 backfill.');
}

main()
  .catch((err) => {
    console.error('[collision-report] FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
