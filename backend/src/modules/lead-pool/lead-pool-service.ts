/**
 * lead-pool-service.ts — Phase Lead Pool 2026-05-24.
 *
 * Sale rảnh → /lead-pool/request → backend tự pick top priority lead bị bỏ rơi
 * → lock Contact.assignedUserId trong transaction → trả full payload.
 * Force note để xin lead tiếp. Cron auto-return quá hạn.
 *
 * Spec đầy đủ: docs/DESIGN-LEAD-POOL.md
 *
 * Sources:
 *   - 'forgotten'      : Contact.lastActivity > forgottenThresholdDays
 *   - 'customer_list'  : CustomerListEntry trong list.shareableToPool=true
 *   - 'external_sync'  : future (Getfly sync)
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export type LeadSource = 'forgotten' | 'customer_list' | 'external_sync';
export type ReleaseReason = 'completed' | 'auto_return' | 'manual_return';

export class LeadPoolError extends Error {
  constructor(public statusCode: number, public errorCode: string, message: string) {
    super(message);
  }
}

interface PoolConfig {
  enabled: boolean;
  maxRequestsPerDay: number;
  cooldownMinutes: number;
  forgottenThresholdDays: number;
  excludedStatuses: string[];
  // Phase v2: granular minutes (30 → 10080 = 7 ngày). Deprecated `autoReturnAfterDays` removed from interface.
  autoReturnAfterMinutes: number;
  // Phase v2: filter lead chỉ-có-UID-không-có-phone (sale mới không liên lạc được vì UID per-viewer).
  requirePhoneInPool: boolean;
  forceNoteBeforeNext: boolean;
  enabledSources: LeadSource[];
  noteMinLength: number;
}

// Bounds cho auto-return: 30 phút (rotate nhanh) → 7 ngày (10080 phút)
const AUTO_RETURN_MIN = 30;
const AUTO_RETURN_MAX = 10080;

const DEFAULT_CONFIG: PoolConfig = {
  enabled: true,
  maxRequestsPerDay: 10,
  cooldownMinutes: 15,
  forgottenThresholdDays: 30,
  excludedStatuses: ['hot', 'potential', 'won'],
  autoReturnAfterMinutes: 1440, // 1 ngày
  requirePhoneInPool: true,
  forceNoteBeforeNext: true,
  enabledSources: ['forgotten', 'customer_list'],
  noteMinLength: 20,
};

// Codex MEDIUM-2 fix: validate JSON config — Array.isArray + filter known enum.
const VALID_SOURCES: LeadSource[] = ['forgotten', 'customer_list', 'external_sync'];
const VALID_STATUS_KEYS = ['hot', 'potential', 'won', 'interested', 'contacted', 'cold', 'lost', 'dormant', 'silent_30d', 'new'];

function safeStringArray(raw: unknown, fallback: string[], allowed?: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  const filtered = raw.filter((s): s is string => typeof s === 'string');
  if (allowed) return filtered.filter((s) => allowed.includes(s));
  return filtered;
}

export async function getOrCreateConfig(orgId: string): Promise<PoolConfig> {
  const existing = await prisma.leadPoolConfig.findUnique({ where: { orgId } });
  if (existing) {
    return {
      enabled: Boolean(existing.enabled),
      maxRequestsPerDay: Math.max(1, Math.min(100, existing.maxRequestsPerDay)),
      cooldownMinutes: Math.max(0, Math.min(180, existing.cooldownMinutes)),
      forgottenThresholdDays: Math.max(1, Math.min(365, existing.forgottenThresholdDays)),
      excludedStatuses: safeStringArray(existing.excludedStatuses, DEFAULT_CONFIG.excludedStatuses, VALID_STATUS_KEYS),
      autoReturnAfterMinutes: Math.max(AUTO_RETURN_MIN, Math.min(AUTO_RETURN_MAX, existing.autoReturnAfterMinutes)),
      requirePhoneInPool: Boolean(existing.requirePhoneInPool),
      forceNoteBeforeNext: Boolean(existing.forceNoteBeforeNext),
      enabledSources: safeStringArray(existing.enabledSources, DEFAULT_CONFIG.enabledSources, VALID_SOURCES) as LeadSource[],
      noteMinLength: Math.max(5, Math.min(500, existing.noteMinLength)),
    };
  }
  await prisma.leadPoolConfig.create({
    data: {
      id: randomUUID(),
      orgId,
      enabled: DEFAULT_CONFIG.enabled,
      maxRequestsPerDay: DEFAULT_CONFIG.maxRequestsPerDay,
      cooldownMinutes: DEFAULT_CONFIG.cooldownMinutes,
      forgottenThresholdDays: DEFAULT_CONFIG.forgottenThresholdDays,
      excludedStatuses: DEFAULT_CONFIG.excludedStatuses,
      autoReturnAfterMinutes: DEFAULT_CONFIG.autoReturnAfterMinutes,
      requirePhoneInPool: DEFAULT_CONFIG.requirePhoneInPool,
      forceNoteBeforeNext: DEFAULT_CONFIG.forceNoteBeforeNext,
      enabledSources: DEFAULT_CONFIG.enabledSources,
      noteMinLength: DEFAULT_CONFIG.noteMinLength,
    },
  });
  return { ...DEFAULT_CONFIG };
}

// Codex MEDIUM-1 fix: whitelist allowed PATCH fields + per-field validation.
// Reject extraneous keys (vd orgId, id, timestamps) để admin không bypass schema.
export async function updateConfig(orgId: string, patch: Partial<PoolConfig>): Promise<PoolConfig> {
  await getOrCreateConfig(orgId); // ensure exists

  const data: Record<string, unknown> = {};
  if (typeof patch.enabled === 'boolean') data.enabled = patch.enabled;
  if (typeof patch.maxRequestsPerDay === 'number' && Number.isInteger(patch.maxRequestsPerDay)) {
    data.maxRequestsPerDay = Math.max(1, Math.min(100, patch.maxRequestsPerDay));
  }
  if (typeof patch.cooldownMinutes === 'number' && Number.isInteger(patch.cooldownMinutes)) {
    data.cooldownMinutes = Math.max(0, Math.min(180, patch.cooldownMinutes));
  }
  if (typeof patch.forgottenThresholdDays === 'number' && Number.isInteger(patch.forgottenThresholdDays)) {
    data.forgottenThresholdDays = Math.max(1, Math.min(365, patch.forgottenThresholdDays));
  }
  if (typeof patch.autoReturnAfterMinutes === 'number' && Number.isInteger(patch.autoReturnAfterMinutes)) {
    data.autoReturnAfterMinutes = Math.max(AUTO_RETURN_MIN, Math.min(AUTO_RETURN_MAX, patch.autoReturnAfterMinutes));
  }
  if (typeof patch.requirePhoneInPool === 'boolean') data.requirePhoneInPool = patch.requirePhoneInPool;
  if (typeof patch.forceNoteBeforeNext === 'boolean') data.forceNoteBeforeNext = patch.forceNoteBeforeNext;
  if (typeof patch.noteMinLength === 'number' && Number.isInteger(patch.noteMinLength)) {
    data.noteMinLength = Math.max(5, Math.min(500, patch.noteMinLength));
  }
  if (Array.isArray(patch.excludedStatuses)) {
    data.excludedStatuses = safeStringArray(patch.excludedStatuses, [], VALID_STATUS_KEYS);
  }
  if (Array.isArray(patch.enabledSources)) {
    data.enabledSources = safeStringArray(patch.enabledSources, [], VALID_SOURCES);
  }

  await prisma.leadPoolConfig.update({ where: { orgId }, data });
  return getOrCreateConfig(orgId);
}

interface EligibilityResult {
  canRequest: boolean;
  reason?: 'cooldown' | 'daily_cap' | 'unsubmitted_note' | 'disabled' | 'no_leads';
  remainingToday: number;
  pendingNoteLead?: { leadRequestId: string; contactId: string; contactName: string | null; contactPhone?: string | null; requestedAt: Date; expiresAt?: Date | string | null };
  nextAvailableAt?: Date;
  config: PoolConfig;
}

export async function checkEligibility(orgId: string, userId: string): Promise<EligibilityResult> {
  const config = await getOrCreateConfig(orgId);

  if (!config.enabled) {
    return { canRequest: false, reason: 'disabled', remainingToday: 0, config };
  }

  // 1. Daily cap
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const todayCount = await prisma.leadRequest.count({
    where: { requestedByUserId: userId, requestedAt: { gte: since24h } },
  });
  const remainingToday = Math.max(0, config.maxRequestsPerDay - todayCount);
  if (remainingToday === 0) {
    return { canRequest: false, reason: 'daily_cap', remainingToday: 0, config };
  }

  // 2. Cooldown
  const lastRequest = await prisma.leadRequest.findFirst({
    where: { requestedByUserId: userId },
    orderBy: { requestedAt: 'desc' },
    select: { requestedAt: true, id: true, contactId: true, noteSubmittedAt: true, releaseReason: true, contact: { select: { fullName: true, crmName: true } } },
  });
  if (lastRequest) {
    const cooldownMs = config.cooldownMinutes * 60 * 1000;
    const elapsed = Date.now() - lastRequest.requestedAt.getTime();

    // Phase v2 2026-05-27: unsubmitted_note ưu tiên HƠN cooldown — sale phải note xong mới
    // được làm gì tiếp, kể cả khi hết cooldown. UI cần phone + expiresAt để render text dynamic.
    if (
      config.forceNoteBeforeNext &&
      lastRequest.noteSubmittedAt === null &&
      lastRequest.releaseReason === null
    ) {
      // Lấy thêm expiresAt + phone từ DB cho FE countdown thu hồi + render text
      const fullLead = await prisma.leadRequest.findUnique({
        where: { id: lastRequest.id },
        select: { expiresAt: true, contact: { select: { phone: true, phoneNormalized: true } } },
      });
      return {
        canRequest: false,
        reason: 'unsubmitted_note',
        remainingToday,
        pendingNoteLead: {
          leadRequestId: lastRequest.id,
          contactId: lastRequest.contactId,
          contactName: lastRequest.contact?.crmName ?? lastRequest.contact?.fullName ?? null,
          contactPhone: fullLead?.contact?.phone ?? null,
          requestedAt: lastRequest.requestedAt,
          expiresAt: fullLead?.expiresAt ?? null,
        },
        config,
      };
    }

    if (elapsed < cooldownMs) {
      return {
        canRequest: false,
        reason: 'cooldown',
        remainingToday,
        nextAvailableAt: new Date(lastRequest.requestedAt.getTime() + cooldownMs),
        config,
      };
    }
  }

  return { canRequest: true, remainingToday, config };
}

interface PriorityCandidate {
  contactId: string;
  source: LeadSource;
  priorityScore: number;
}

/**
 * Pool A — forgotten: Contact bị bỏ rơi (lastActivity > threshold)
 * Filter:
 *   - cùng org
 *   - status NOT IN excludedStatuses
 *   - consent_status != 'revoked'
 *   - chưa có active LeadRequest
 *   - assignedUserId KHÁC current user (sale không tự xin lại lead của mình)
 *
 * Priority: daysIdle×2 + phone×5 + zalo×10 + noShow×15 + wasHot×30 − attempts×3
 */
async function queryForgottenCandidates(orgId: string, userId: string, config: PoolConfig, limit = 50): Promise<PriorityCandidate[]> {
  const thresholdDate = new Date(Date.now() - config.forgottenThresholdDays * 24 * 60 * 60 * 1000);
  const excludedStatuses = config.excludedStatuses;
  // Phase v2 — filter UID-only lead nếu config requirePhoneInPool=true (default).
  // Lý do: UID là per-viewer của sale cũ, sale mới không dùng được. Cần phone để
  // sale mới gọi findUser qua nick mình tìm UID per-viewer của họ.
  const phoneFilter = config.requirePhoneInPool ? `AND c.phone_normalized IS NOT NULL` : '';

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; priority_score: number }>>(
    `
    SELECT c.id,
      (
        EXTRACT(EPOCH FROM (NOW() - c.last_activity)) / 86400 * 2
        + CASE WHEN c.phone_normalized IS NOT NULL THEN 5 ELSE 0 END
        + CASE WHEN c.has_zalo = true THEN 10 ELSE 0 END
        - c.zalo_lookup_attempts * 3
      )::INTEGER AS priority_score
    FROM contacts c
    WHERE c.org_id = $1
      AND c.last_activity IS NOT NULL
      AND c.last_activity < $2
      AND c.consent_status != 'revoked'
      AND (c.status IS NULL OR c.status != ALL($3::text[]))
      AND (c.assigned_user_id IS NULL OR c.assigned_user_id != $4)
      AND c.merged_into IS NULL
      ${phoneFilter}
      AND NOT EXISTS (
        SELECT 1 FROM lead_requests lr
        WHERE lr.contact_id = c.id
          AND lr.note_submitted_at IS NULL
          AND lr.release_reason IS NULL
          AND lr.auto_returned_at IS NULL
      )
    ORDER BY priority_score DESC
    LIMIT $5
    `,
    orgId,
    thresholdDate,
    excludedStatuses,
    userId,
    limit,
  );

  return rows.map((r) => ({ contactId: r.id, source: 'forgotten' as const, priorityScore: r.priority_score }));
}

/**
 * Pool B — customer_list: CustomerListEntry trong list.shareableToPool=true.
 * Convert sang Contact: nếu entry.contactId đã link → dùng Contact đó; nếu chưa →
 * tạo Contact stub (no Zalo, phone từ entry).
 *
 * Priority đơn giản: daysInList + (matchedContact ? 10 : 0).
 */
async function queryCustomerListCandidates(orgId: string, userId: string, limit = 50): Promise<PriorityCandidate[]> {
  // CustomerListEntry uses customer_list_id (not list_id) + phone_e164/phone_local (not phone).
  // status='validated' or 'enriched' OK cho pool.
  const entries = await prisma.$queryRawUnsafe<Array<{ contact_id: string | null; phone_e164: string | null; phone_local: string | null; name_raw: string | null; days_in_list: number; entry_id: string }>>(
    `
    SELECT cle.id AS entry_id, cle.contact_id, cle.phone_e164, cle.phone_local, cle.name_raw,
      EXTRACT(EPOCH FROM (NOW() - cle.created_at)) / 86400 AS days_in_list
    FROM customer_list_entries cle
    JOIN customer_lists cl ON cl.id = cle.customer_list_id
    WHERE cl.org_id = $1
      AND cl.shareable_to_pool = true
      AND cl.archived_at IS NULL
      AND cle.status IN ('validated', 'enriched')
      AND cle.phone_valid = true
      AND (
        cle.contact_id IS NULL
        OR EXISTS (
          SELECT 1 FROM contacts cc
          WHERE cc.id = cle.contact_id
            AND (cc.assigned_user_id IS NULL OR cc.assigned_user_id != $2)
            AND NOT EXISTS (
              SELECT 1 FROM lead_requests lr
              WHERE lr.contact_id = cc.id
                AND lr.note_submitted_at IS NULL
                AND lr.release_reason IS NULL
                AND lr.auto_returned_at IS NULL
            )
        )
      )
    ORDER BY days_in_list DESC
    LIMIT $3
    `,
    orgId,
    userId,
    limit,
  );

  const result: PriorityCandidate[] = [];
  for (const row of entries) {
    let contactId = row.contact_id;
    if (!contactId) {
      // Stub Contact: dùng phone_e164 (84xxx) làm canonical, name_raw nếu có
      const canonicalPhone = (row.phone_e164 ?? row.phone_local ?? '').replace(/[^\d]/g, '');
      if (!canonicalPhone) continue;
      const stub = await prisma.contact.create({
        data: {
          id: randomUUID(),
          orgId,
          phone: row.phone_local ?? row.phone_e164 ?? canonicalPhone,
          phoneNormalized: canonicalPhone.startsWith('84') ? canonicalPhone : `84${canonicalPhone.replace(/^0/, '')}`,
          fullName: row.name_raw,
          crmName: row.name_raw,
          source: 'customer_list',
          hasZalo: false,
          status: 'new',
          lastActivity: new Date(),
        },
        select: { id: true },
      });
      contactId = stub.id;
      await prisma.customerListEntry.update({
        where: { id: row.entry_id },
        data: { contactId: stub.id },
      });
    }
    result.push({
      contactId,
      source: 'customer_list',
      priorityScore: Math.round(Number(row.days_in_list) + 10),
    });
  }
  return result;
}

/**
 * Pick 1 candidate trong top 10 priority (random nhẹ để 2 sale không nhận giống nhau).
 */
function pickTopRandom(candidates: PriorityCandidate[]): PriorityCandidate | null {
  if (candidates.length === 0) return null;
  const top = candidates.slice(0, 10);
  return top[Math.floor(Math.random() * top.length)];
}

/**
 * Build full payload sale thấy khi nhận lead — hoành tráng theo design.
 */
async function buildLeadPayload(contactId: string) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      assignedUser: { select: { id: true, fullName: true, email: true, isActive: true } },
      statusRef: { select: { id: true, name: true, color: true, isTerminal: true } },
      friends: {
        select: {
          id: true,
          zaloAccountId: true,
          zaloUidInNick: true,
          friendshipStatus: true,
          relationshipKind: true,
          becameFriendAt: true,
          zaloAccount: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      },
      contactNotes: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, body: true, createdAt: true, author: { select: { fullName: true } } },
      },
      appointments: {
        take: 5,
        orderBy: { appointmentDate: 'desc' },
        select: { id: true, appointmentDate: true, status: true, title: true },
      },
    },
  });
  if (!contact) return null;

  // Insights derive
  const daysIdle = contact.lastActivity ? Math.floor((Date.now() - contact.lastActivity.getTime()) / 86400000) : null;
  const noShowCount = contact.appointments.filter((a) => a.status === 'no_show').length;
  const acceptedFriendCount = contact.friends.filter((f) => f.friendshipStatus === 'accepted').length;

  return {
    contact: {
      id: contact.id,
      fullName: contact.fullName,
      crmName: contact.crmName,
      phone: contact.phone,
      phoneNormalized: contact.phoneNormalized,
      email: contact.email,
      avatarUrl: contact.avatarUrl,
      source: contact.source,
      sourceDate: contact.sourceDate,
      firstContactDate: contact.firstContactDate,
      status: contact.statusRef ?? { name: contact.status, color: null, isTerminal: false },
      tags: contact.tags,
      hasZalo: contact.hasZalo,
      leadScore: contact.leadScore,
      lastActivity: contact.lastActivity,
      daysIdle,
      province: contact.province,
      district: contact.district,
      ward: contact.ward,
      addressLine: contact.addressLine,
      notes: contact.notes,
      acceptedNicksCount: contact.acceptedNicksCount,
      totalInbound: contact.totalInbound,
      totalOutbound: contact.totalOutbound,
      totalAppointments: contact.totalAppointments,
    },
    previousAssignee: contact.assignedUser ?? null,
    friends: contact.friends,
    recentNotes: contact.contactNotes,
    recentAppointments: contact.appointments,
    insights: {
      daysIdle,
      noShowCount,
      acceptedFriendCount,
      totalMessages: contact.totalInbound + contact.totalOutbound,
      hadHotMoment: false, // TODO: derive từ historical status timeline (phase 2)
    },
    suggestedOpenings: buildSuggestedOpenings(contact),
  };
}

function buildSuggestedOpenings(contact: { crmName: string | null; fullName: string | null }): string[] {
  const name = contact.crmName ?? contact.fullName ?? 'anh/chị';
  return [
    `Chào ${name}, em là sale chăm sóc tiếp tài khoản này. Em đọc lại lịch sử thấy mình đã quan tâm dự án trước đây, không biết hiện tại anh/chị còn nhu cầu không ạ?`,
    `Chào ${name}, lâu rồi mình chưa nói chuyện. Em mới có thông tin cập nhật về dự án mà mình từng quan tâm, em gửi để anh/chị tham khảo nhé?`,
    `Chào ${name}, em phụ trách CSKH tài khoản này. Bên em đang có ưu đãi mới, không biết anh/chị có thuận tiện 5 phút để em chia sẻ không ạ?`,
  ];
}

/**
 * Hash userId → int32 cho pg_advisory_xact_lock (Codex HIGH-1 fix).
 * Postgres advisory lock dùng để serialize requestLead per user.
 */
function userLockKey(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  // Postgres advisory_lock_key thường dùng 2 int32 — em dùng [123, hash] để tránh va chạm
  // với module khác. 123 là namespace 'lead-pool'.
  return hash;
}

/**
 * Main: yêu cầu nhận lead. Race-safe full transaction.
 * Codex review fixes:
 *   - CRITICAL: SELECT FOR UPDATE SKIP LOCKED + partial unique index
 *   - HIGH-1: pg_advisory_xact_lock per user (serialize same-user concurrent POSTs)
 *   - HIGH-3: re-check eligibility inside TX
 *   - LOW: buildLeadPayload null path throws thay vì partial
 */
export async function requestLead(args: { orgId: string; userId: string }) {
  // Pre-check ngoài TX để fail nhanh + trả full meta cho FE (cooldown/daily_cap/etc)
  const preCheck = await checkEligibility(args.orgId, args.userId);
  if (!preCheck.canRequest) {
    const err = new LeadPoolError(429, preCheck.reason ?? 'blocked', eligibilityMessage(preCheck));
    (err as any).meta = preCheck;
    throw err;
  }

  const config = preCheck.config;
  const expiresAt = new Date(Date.now() + config.autoReturnAfterMinutes * 60 * 1000);

  // Full transaction: advisory lock user → re-validate → query candidates → lock contact → create LeadRequest
  const result = await prisma.$transaction(async (tx) => {
    // 1. Advisory lock per user — chỉ 1 requestLead/user tại 1 thời điểm
    const lockKey = userLockKey(args.userId);
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(123::int, ${lockKey}::int)`);

    // 2. Re-validate eligibility INSIDE TX (Codex HIGH-1)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayCount = await tx.leadRequest.count({
      where: { requestedByUserId: args.userId, requestedAt: { gte: since24h } },
    });
    if (todayCount >= config.maxRequestsPerDay) {
      throw new LeadPoolError(429, 'daily_cap', `Hết quota ${config.maxRequestsPerDay} lead hôm nay`);
    }
    const lastRequest = await tx.leadRequest.findFirst({
      where: { requestedByUserId: args.userId },
      orderBy: { requestedAt: 'desc' },
      select: { requestedAt: true, noteSubmittedAt: true, releaseReason: true },
    });
    if (lastRequest) {
      const cooldownMs = config.cooldownMinutes * 60 * 1000;
      if (Date.now() - lastRequest.requestedAt.getTime() < cooldownMs) {
        throw new LeadPoolError(429, 'cooldown', 'Đang trong cooldown');
      }
      if (
        config.forceNoteBeforeNext &&
        lastRequest.noteSubmittedAt === null &&
        lastRequest.releaseReason === null
      ) {
        throw new LeadPoolError(429, 'unsubmitted_note', 'Cần note lead trước rồi mới xin tiếp');
      }
    }

    // 3. Gather candidates (queryForgotten/CustomerList chạy ngoài tx vì stub Contact tự tạo cần own commit)
    // — em pass `tx` cho query và move stub create vào TX scope
    const [forgottenList, customerListList] = await Promise.all([
      config.enabledSources.includes('forgotten')
        ? queryForgottenCandidates(args.orgId, args.userId, config, 50)
        : Promise.resolve([] as PriorityCandidate[]),
      config.enabledSources.includes('customer_list')
        ? queryCustomerListCandidatesTx(tx, args.orgId, args.userId)
        : Promise.resolve([] as PriorityCandidate[]),
    ]);

    const all = [...forgottenList, ...customerListList].sort((a, b) => b.priorityScore - a.priorityScore);
    if (all.length === 0) {
      throw new LeadPoolError(404, 'no_leads', 'Hiện không có lead phù hợp trong pool. Quay lại sau ít phút.');
    }

    // 4. Iterate top-N với SELECT FOR UPDATE SKIP LOCKED — pick first row em lock được
    // Đảm bảo 2 sale clicking đồng thời không nhận cùng contact.
    const topN = all.slice(0, 10);
    let lockedContact: { id: string; assignedUserId: string | null; pickedScore: number; pickedSource: LeadSource } | null = null;

    // Shuffle top N để random trong các sale concurrent
    for (let i = topN.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [topN[i], topN[j]] = [topN[j], topN[i]];
    }

    for (const candidate of topN) {
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; assigned_user_id: string | null }>>(
        `SELECT id, assigned_user_id FROM contacts WHERE id = $1 FOR UPDATE SKIP LOCKED`,
        candidate.contactId,
      );
      if (rows.length === 0) continue; // contact đang bị sale khác lock → thử contact tiếp
      // Đảm bảo contact không có active lead_request khác (race với cron / cùng user mở 2 tab)
      const activeReq = await tx.leadRequest.findFirst({
        where: {
          contactId: candidate.contactId,
          noteSubmittedAt: null,
          releaseReason: null,
          autoReturnedAt: null,
        },
        select: { id: true },
      });
      if (activeReq) continue;

      lockedContact = {
        id: rows[0].id,
        assignedUserId: rows[0].assigned_user_id,
        pickedScore: candidate.priorityScore,
        pickedSource: candidate.source,
      };
      break;
    }

    if (!lockedContact) {
      throw new LeadPoolError(409, 'all_locked', 'Tất cả lead top đang được sale khác xem. Thử lại sau vài giây.');
    }

    // 5. Reassign contact + create LeadRequest. Partial unique index trên (contact_id WHERE active)
    // chống mọi race còn lại (Postgres reject INSERT thứ 2).
    await tx.contact.update({
      where: { id: lockedContact.id },
      data: { assignedUserId: args.userId },
    });

    const lr = await tx.leadRequest.create({
      data: {
        id: randomUUID(),
        orgId: args.orgId,
        requestedByUserId: args.userId,
        contactId: lockedContact.id,
        source: lockedContact.pickedSource,
        priorityScore: lockedContact.pickedScore,
        expiresAt,
        previousAssigneeId: lockedContact.assignedUserId,
      },
    });

    return {
      leadRequestId: lr.id,
      contactId: lockedContact.id,
      source: lockedContact.pickedSource,
      priorityScore: lockedContact.pickedScore,
    };
  }, { timeout: 15000 });

  const payload = await buildLeadPayload(result.contactId);
  if (!payload) {
    // Contact bị xoá trong khoảnh khắc giữa TX và buildPayload — Codex LOW fix.
    // Rollback assignment để không leak contact bị orphan.
    await prisma.contact.update({
      where: { id: result.contactId },
      data: { assignedUserId: null },
    }).catch(() => { /* contact may not exist */ });
    throw new LeadPoolError(500, 'payload_build_failed', 'Lead vừa lấy bị xoá. Vui lòng thử lại.');
  }

  logger.info(`[lead-pool] user=${args.userId} got lead contact=${result.contactId} source=${result.source} score=${result.priorityScore}`);

  return {
    leadRequestId: result.leadRequestId,
    source: result.source,
    priorityScore: result.priorityScore,
    expiresAt,
    ...payload,
  };
}

/**
 * Variant của queryCustomerListCandidates dùng tx của caller.
 * Codex HIGH-2 fix: contact stub upsert by (orgId, phoneNormalized) — chống race
 * 2 sale cùng pick entry chưa link → tạo 2 Contact stub trùng phone.
 */
// TS note: Prisma's tx callback type has internal generics that don't match Prisma.TransactionClient
// when prisma-client-js is configured with adapter. Em dùng any an toàn vì callsite chỉ trong TX
// của requestLead.
type Tx = any;
async function queryCustomerListCandidatesTx(
  tx: Tx,
  orgId: string,
  userId: string,
  limit = 50,
): Promise<PriorityCandidate[]> {
  const entries = (await tx.$queryRawUnsafe(
    `
    SELECT cle.id AS entry_id, cle.contact_id, cle.phone_e164, cle.phone_local, cle.name_raw,
      EXTRACT(EPOCH FROM (NOW() - cle.created_at)) / 86400 AS days_in_list
    FROM customer_list_entries cle
    JOIN customer_lists cl ON cl.id = cle.customer_list_id
    WHERE cl.org_id = $1
      AND cl.shareable_to_pool = true
      AND cl.archived_at IS NULL
      AND cle.status IN ('validated', 'enriched')
      AND cle.phone_valid = true
      AND (
        cle.contact_id IS NULL
        OR EXISTS (
          SELECT 1 FROM contacts cc
          WHERE cc.id = cle.contact_id
            AND (cc.assigned_user_id IS NULL OR cc.assigned_user_id != $2)
            AND NOT EXISTS (
              SELECT 1 FROM lead_requests lr
              WHERE lr.contact_id = cc.id
                AND lr.note_submitted_at IS NULL
                AND lr.release_reason IS NULL
                AND lr.auto_returned_at IS NULL
            )
        )
      )
    ORDER BY days_in_list DESC
    LIMIT $3
    `,
    orgId, userId, limit,
  )) as Array<{ contact_id: string | null; phone_e164: string | null; phone_local: string | null; name_raw: string | null; days_in_list: number; entry_id: string }>;

  const result: PriorityCandidate[] = [];
  for (const row of entries) {
    let contactId = row.contact_id;
    if (!contactId) {
      const canonicalPhone = (row.phone_e164 ?? row.phone_local ?? '').replace(/[^\d]/g, '');
      if (!canonicalPhone) continue;
      const phoneNormalized = canonicalPhone.startsWith('84')
        ? canonicalPhone
        : `84${canonicalPhone.replace(/^0/, '')}`;

      // Upsert by (orgId, phoneNormalized) — nếu Contact đã tồn tại trùng SĐT → reuse
      const existing = await tx.contact.findFirst({
        where: { orgId, phoneNormalized },
        select: { id: true },
      });
      if (existing) {
        contactId = existing.id;
      } else {
        const stub = await tx.contact.create({
          data: {
            id: randomUUID(),
            orgId,
            phone: row.phone_local ?? row.phone_e164 ?? canonicalPhone,
            phoneNormalized,
            fullName: row.name_raw,
            crmName: row.name_raw,
            source: 'customer_list',
            hasZalo: false,
            status: 'new',
            lastActivity: new Date(),
          },
          select: { id: true },
        });
        contactId = stub.id;
      }
      await tx.customerListEntry.update({
        where: { id: row.entry_id },
        data: { contactId },
      });
    }
    if (!contactId) continue;
    result.push({
      contactId,
      source: 'customer_list',
      priorityScore: Math.round(Number(row.days_in_list) + 10),
    });
  }
  return result;
}

function eligibilityMessage(e: EligibilityResult): string {
  if (e.reason === 'disabled') return 'Tính năng Nhận Lead đang tắt';
  if (e.reason === 'daily_cap') return `Bạn đã xin đủ ${e.config.maxRequestsPerDay} lead hôm nay. Quay lại ngày mai.`;
  if (e.reason === 'cooldown') {
    const sec = e.nextAvailableAt ? Math.ceil((e.nextAvailableAt.getTime() - Date.now()) / 1000) : 0;
    const min = Math.ceil(sec / 60);
    return `Vui lòng đợi ${min} phút nữa để xin lead tiếp.`;
  }
  if (e.reason === 'unsubmitted_note') {
    return `Bạn cần ghi note cho lead "${e.pendingNoteLead?.contactName || 'trước đó'}" rồi mới xin được lead mới.`;
  }
  return 'Không thể xin lead';
}

/**
 * Submit note cho LeadRequest → unlock xin tiếp.
 */
export async function submitNote(args: { userId: string; leadRequestId: string; noteContent: string }) {
  const lr = await prisma.leadRequest.findUnique({
    where: { id: args.leadRequestId },
    include: {
      contact: { select: { id: true, orgId: true } },
    },
  });
  if (!lr) throw new LeadPoolError(404, 'lead_not_found', 'Lead request không tồn tại');
  if (lr.requestedByUserId !== args.userId) {
    throw new LeadPoolError(403, 'not_owner', 'Bạn không phải người nhận lead này');
  }
  if (lr.noteSubmittedAt !== null) {
    throw new LeadPoolError(400, 'already_noted', 'Lead này đã có note rồi');
  }
  if (lr.releaseReason !== null) {
    throw new LeadPoolError(400, 'already_released', 'Lead này đã được trả về pool');
  }

  const config = await getOrCreateConfig(lr.contact.orgId);
  const trimmed = args.noteContent.trim();
  if (trimmed.length < config.noteMinLength) {
    throw new LeadPoolError(400, 'note_too_short', `Note phải dài ít nhất ${config.noteMinLength} ký tự (hiện ${trimmed.length}).`);
  }

  const now = new Date();
  // Codex MEDIUM-3 fix: conditional update để chống double-submit race.
  // updateMany với where note_submitted_at IS NULL — chỉ row đầu tiên success;
  // count=0 = race lose, abort tạo Note để tránh duplicate.
  await prisma.$transaction(async (tx) => {
    const updated = await tx.leadRequest.updateMany({
      where: { id: lr.id, noteSubmittedAt: null, releaseReason: null },
      data: { noteContent: trimmed, noteSubmittedAt: now },
    });
    if (updated.count === 0) {
      throw new LeadPoolError(409, 'race_lost', 'Lead đã được note hoặc trả ở request khác');
    }
    await tx.note.create({
      data: {
        id: randomUUID(),
        orgId: lr.contact.orgId,
        contactId: lr.contactId,
        authorUserId: args.userId,
        body: `[Lead Pool] ${trimmed}`,
      },
    });
    await tx.contact.update({
      where: { id: lr.contactId },
      data: { lastActivity: now },
    });
  });

  return { ok: true };
}

/**
 * Sale trả lại lead về pool. Codex HIGH-3 fix: chỉ rollback Contact.assignedUserId
 * nếu CURRENT owner = requestedByUserId (sale chưa được reassign sau khi nhận).
 * Nếu đã reassign khác → không ghi đè (admin/sale khác có thể đã sửa).
 */
export async function returnLead(args: { userId: string; leadRequestId: string; reason?: string }) {
  const lr = await prisma.leadRequest.findUnique({
    where: { id: args.leadRequestId },
    include: { contact: { select: { orgId: true } } },
  });
  if (!lr) throw new LeadPoolError(404, 'lead_not_found', 'Lead không tồn tại');
  if (lr.requestedByUserId !== args.userId) throw new LeadPoolError(403, 'not_owner', 'Không phải lead của bạn');
  if (lr.releaseReason !== null) throw new LeadPoolError(400, 'already_released', 'Đã trả lại rồi');

  await prisma.$transaction(async (tx) => {
    // Conditional update — chỉ rollback nếu sale vẫn là current owner
    await tx.contact.updateMany({
      where: { id: lr.contactId, assignedUserId: args.userId },
      data: { assignedUserId: lr.previousAssigneeId },
    });
    await tx.leadRequest.update({
      where: { id: lr.id },
      data: {
        releaseReason: 'manual_return',
        noteSubmittedAt: lr.noteSubmittedAt ?? new Date(),
        noteContent: lr.noteContent ?? (args.reason ?? 'Sale trả lại pool'),
      },
    });
  });

  return { ok: true };
}

/**
 * Lịch sử lead của user.
 */
export async function getMyHistory(args: { userId: string; limit?: number }) {
  const limit = Math.min(args.limit ?? 30, 100);
  return prisma.leadRequest.findMany({
    where: { requestedByUserId: args.userId },
    orderBy: { requestedAt: 'desc' },
    take: limit,
    include: {
      contact: {
        select: { id: true, fullName: true, crmName: true, phone: true, status: true },
      },
    },
  });
}

/**
 * Cron auto-return: LeadRequest quá expiresAt mà chưa note + chưa release.
 * Chạy 2am daily.
 */
export async function autoReturnExpiredLeads() {
  const now = new Date();
  const expired = await prisma.leadRequest.findMany({
    where: {
      noteSubmittedAt: null,
      releaseReason: null,
      autoReturnedAt: null,
      expiresAt: { lt: now },
    },
    select: { id: true, contactId: true, previousAssigneeId: true, requestedByUserId: true },
  });

  // Codex HIGH-3 fix: chỉ rollback Contact.assignedUserId nếu CURRENT owner =
  // requestedByUserId. Nếu sale đã được reassign manually (admin/sale khác) trong 7
  // ngày chờ → không ghi đè.
  for (const lr of expired) {
    await prisma.$transaction(async (tx) => {
      await tx.contact.updateMany({
        where: { id: lr.contactId, assignedUserId: lr.requestedByUserId },
        data: { assignedUserId: lr.previousAssigneeId },
      });
      await tx.leadRequest.update({
        where: { id: lr.id },
        data: {
          releaseReason: 'auto_return',
          autoReturnedAt: now,
          noteContent: 'Sale không note quá hạn — auto trả về pool',
        },
      });
    });
  }

  if (expired.length > 0) {
    logger.info(`[lead-pool-cron] auto-returned ${expired.length} expired leads`);
  }
  return expired.length;
}

/**
 * Sale dùng nick OWN gọi findUser(phone) tìm Zalo của lead chưa rõ.
 * Nếu thấy UID → update Contact.zaloUid + hasZalo=true → sale tiếp tục gửi friend request.
 * Nếu không → cập nhật hasZalo=false để skip cho lần sau.
 */
export async function findZaloForLead(args: { userId: string; orgId: string; leadRequestId: string }) {
  const lr = await prisma.leadRequest.findUnique({
    where: { id: args.leadRequestId },
    include: { contact: { select: { id: true, orgId: true, phone: true, phoneNormalized: true, hasZalo: true, zaloLookupAttempts: true } } },
  });
  if (!lr) throw new LeadPoolError(404, 'lead_not_found', 'Lead không tồn tại');
  if (lr.requestedByUserId !== args.userId) {
    throw new LeadPoolError(403, 'not_owner', 'Không phải lead của bạn');
  }
  const phone = lr.contact.phoneNormalized || lr.contact.phone;
  if (!phone) {
    throw new LeadPoolError(400, 'no_phone', 'Lead này không có SĐT — không tìm được Zalo. Gọi điện trước hoặc bổ sung SĐT.');
  }
  if (lr.contact.hasZalo === true) {
    throw new LeadPoolError(400, 'already_found', 'KH này đã có Zalo trong CRM');
  }

  // Sale's nick OWN connected
  const myNick = await prisma.zaloAccount.findFirst({
    where: { ownerUserId: args.userId, orgId: args.orgId, status: 'connected' },
    orderBy: { lastConnectedAt: 'desc' },
    select: { id: true, displayName: true },
  });
  if (!myNick) {
    throw new LeadPoolError(400, 'no_own_nick', 'Bạn cần kết nối ít nhất 1 nick Zalo trong "Quản lý nick" để tìm Zalo của KH.');
  }

  const { zaloOps } = await import('../../shared/zalo-operations.js');
  let foundUid: string | null = null;
  let extra: { zaloName?: string | null; avatar?: string | null; globalId?: string | null } = {};
  try {
    const res = await zaloOps.findUser(myNick.id, phone) as any;
    const u = res || {};
    foundUid = String(u.uid || u.userId || '') || null;
    extra = {
      zaloName: u.zaloName || u.zalo_name || u.displayName || u.display_name || null,
      avatar: u.avatar || null,
      globalId: u.globalId || null,
    };
  } catch (err: any) {
    logger.warn(`[lead-pool find-zalo] findUser fail: ${err?.message || err}`);
  }

  // Bump zaloLookupAttempts để tránh thử lại liên tục.
  // BUG FIX 2026-05-27: zalo_global_id UNIQUE per org → nếu Zalo trả globalId đã tồn tại
  // ở Contact KHÁC trong CRM → Prisma reject. Check trước khi update.
  let duplicateContact: { id: string; fullName: string | null; assignedUser: { fullName: string | null } | null } | null = null;
  if (extra.globalId) {
    const existing = await prisma.contact.findFirst({
      where: {
        orgId: args.orgId,
        zaloGlobalId: extra.globalId,
        id: { not: lr.contact.id },
      },
      select: { id: true, fullName: true, assignedUser: { select: { fullName: true } } },
    });
    if (existing) duplicateContact = existing;
  }

  // Update Contact: nếu có duplicate globalId → KHÔNG update field đó (giữ nguyên).
  // Chỉ update zaloUid (per-viewer của nick sale này — không UNIQUE) + hasZalo + avatar.
  await prisma.contact.update({
    where: { id: lr.contact.id },
    data: {
      zaloLookupAt: new Date(),
      zaloLookupAttempts: lr.contact.zaloLookupAttempts + 1,
      hasZalo: foundUid ? true : false,
      zaloUid: foundUid ?? undefined,
      // Chỉ set globalId nếu KHÔNG trùng — tránh unique constraint crash
      zaloGlobalId: duplicateContact ? undefined : (extra.globalId ?? undefined),
      avatarUrl: extra.avatar ?? undefined,
    },
  });

  return {
    found: Boolean(foundUid),
    uid: foundUid,
    zaloName: extra.zaloName,
    nickUsed: myNick.displayName,
    suggestSendRequest: Boolean(foundUid),
    duplicateWarning: duplicateContact
      ? `Cảnh báo: SĐT này khớp Zalo với KH "${duplicateContact.fullName || 'không tên'}" đã có trong CRM (sale chăm: ${duplicateContact.assignedUser?.fullName || 'chưa gán'}). Có thể là cùng 1 người dưới 2 row riêng — cân nhắc trả lead về pool.`
      : null,
  };
}

/**
 * Stats theo role cho tooltip:
 *   - sale (member): quota còn lại + lịch sử lead hôm nay của chính sale + size pool
 *   - leader (deptRole='leader'/'deputy'): + summary leads team mình quản lý
 *   - admin/owner: + nick rảnh trong org + sale nào nhận nhiều nhất
 */
export async function getLeadPoolStats(args: { orgId: string; userId: string; role: string }) {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const config = await getOrCreateConfig(args.orgId);

  // ── My stats (mọi role đều có) ──
  const myToday = await prisma.leadRequest.findMany({
    where: { requestedByUserId: args.userId, requestedAt: { gte: since24h } },
    orderBy: { requestedAt: 'desc' },
    select: {
      id: true,
      requestedAt: true,
      noteSubmittedAt: true,
      releaseReason: true,
      priorityScore: true,
      source: true,
      contact: { select: { fullName: true, crmName: true, phone: true } },
    },
  });
  const myStats = {
    requestedToday: myToday.length,
    remainingToday: Math.max(0, config.maxRequestsPerDay - myToday.length),
    noted: myToday.filter((r) => r.noteSubmittedAt !== null).length,
    pending: myToday.filter((r) => r.noteSubmittedAt === null && r.releaseReason === null).length,
    returned: myToday.filter((r) => r.releaseReason !== null).length,
    history: myToday.slice(0, 10).map((r) => ({
      id: r.id,
      contactName: r.contact?.crmName || r.contact?.fullName || r.contact?.phone || 'KH',
      requestedAt: r.requestedAt,
      noted: r.noteSubmittedAt !== null,
      returned: r.releaseReason !== null,
      source: r.source,
    })),
  };

  // ── Pool size (ai cũng xem được — giúp sale biết còn lead không) ──
  const thresholdDate = new Date(Date.now() - config.forgottenThresholdDays * 24 * 60 * 60 * 1000);
  const poolAvailable = await prisma.contact.count({
    where: {
      orgId: args.orgId,
      lastActivity: { lt: thresholdDate },
      status: { notIn: config.excludedStatuses },
      consentStatus: { not: 'revoked' },
      mergedInto: null,
      OR: [{ assignedUserId: null }, { assignedUserId: { not: args.userId } }],
    },
  });

  const baseResult: any = {
    role: args.role,
    config: { maxPerDay: config.maxRequestsPerDay, cooldownMinutes: config.cooldownMinutes },
    my: myStats,
    poolAvailable,
  };

  // ── LEADER ── (deptRole='leader'|'deputy') — summary team
  const membership = await prisma.departmentMember.findFirst({
    where: { userId: args.userId, deptRole: { in: ['leader', 'deputy'] } },
    select: { departmentId: true, department: { select: { id: true, name: true, path: true } } },
  });

  if (membership) {
    // Cascade: lấy mọi user trong dept tree dưới mình
    const subDepts = await prisma.department.findMany({
      where: { orgId: args.orgId, path: { startsWith: membership.department.path } },
      select: { id: true },
    });
    const subDeptIds = subDepts.map((d) => d.id);
    const teamMembers = await prisma.departmentMember.findMany({
      where: { departmentId: { in: subDeptIds }, userId: { not: args.userId } },
      select: { userId: true, user: { select: { id: true, fullName: true, email: true } } },
    });

    const teamUserIds = teamMembers.map((m) => m.userId);
    if (teamUserIds.length > 0) {
      const teamLeads = await prisma.leadRequest.groupBy({
        by: ['requestedByUserId'],
        where: { requestedByUserId: { in: teamUserIds }, requestedAt: { gte: since24h } },
        _count: true,
      });
      const notedCounts = await prisma.leadRequest.groupBy({
        by: ['requestedByUserId'],
        where: {
          requestedByUserId: { in: teamUserIds },
          requestedAt: { gte: since24h },
          noteSubmittedAt: { not: null },
        },
        _count: true,
      });
      const notedMap = Object.fromEntries(notedCounts.map((g) => [g.requestedByUserId, g._count]));

      baseResult.team = {
        departmentName: membership.department.name,
        memberCount: teamMembers.length,
        totalLeadsToday: teamLeads.reduce((sum, g) => sum + g._count, 0),
        members: teamMembers.map((m) => {
          const requested = teamLeads.find((g) => g.requestedByUserId === m.userId)?._count ?? 0;
          const noted = notedMap[m.userId] ?? 0;
          return {
            userId: m.userId,
            fullName: m.user.fullName,
            email: m.user.email,
            requestedToday: requested,
            notedToday: noted,
            pendingNote: requested - noted,
          };
        }).sort((a, b) => b.requestedToday - a.requestedToday),
      };
    }
  }

  // ── ADMIN/OWNER — org-wide ──
  if (args.role === 'admin' || args.role === 'owner') {
    // Org-wide: tất cả sale hôm nay
    const allLeadsToday = await prisma.leadRequest.groupBy({
      by: ['requestedByUserId'],
      where: { orgId: args.orgId, requestedAt: { gte: since24h } },
      _count: true,
      orderBy: { _count: { requestedByUserId: 'desc' } },
      take: 5,
    });
    const topUserIds = allLeadsToday.map((g) => g.requestedByUserId);
    const topUsers = topUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: topUserIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];
    const userMap = Object.fromEntries(topUsers.map((u) => [u.id, u]));

    // Nick rảnh = nick OWN connected, không gửi tin trong 1h gần đây
    const idleNicks = await prisma.zaloAccount.findMany({
      where: {
        orgId: args.orgId,
        status: 'connected',
        OR: [
          { lastMessageSentAt: null },
          { lastMessageSentAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
        ],
      },
      select: { id: true, displayName: true, ownerUserId: true, owner: { select: { fullName: true } } },
      take: 20,
    });

    const totalToday = await prisma.leadRequest.count({
      where: { orgId: args.orgId, requestedAt: { gte: since24h } },
    });

    baseResult.org = {
      totalLeadsToday: totalToday,
      idleNickCount: idleNicks.length,
      idleNicks: idleNicks.slice(0, 8).map((n) => ({
        id: n.id,
        displayName: n.displayName,
        ownerName: n.owner?.fullName,
      })),
      topSales: allLeadsToday.map((g) => ({
        userId: g.requestedByUserId,
        fullName: userMap[g.requestedByUserId]?.fullName || 'Unknown',
        email: userMap[g.requestedByUserId]?.email,
        requestedToday: g._count,
      })),
    };
  }

  return baseResult;
}

/**
 * Preview top N candidate đang trong pool — admin/owner xem queue robin.
 * KHÔNG lock, KHÔNG mutate. Pure read.
 */
export async function previewPool(args: { orgId: string; userId: string; limit?: number }) {
  const config = await getOrCreateConfig(args.orgId);
  const limit = Math.min(args.limit ?? 50, 200);

  // Lấy top candidate forgotten + customer_list (KHÔNG random, sort thuần theo score)
  const [forgottenList, customerListList] = await Promise.all([
    config.enabledSources.includes('forgotten')
      ? queryForgottenCandidates(args.orgId, args.userId, config, limit)
      : Promise.resolve([] as PriorityCandidate[]),
    config.enabledSources.includes('customer_list')
      ? queryCustomerListPreview(args.orgId, args.userId, limit)
      : Promise.resolve([] as PriorityCandidate[]),
  ]);

  const merged = [...forgottenList, ...customerListList].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, limit);

  // Enrich từng candidate với Contact info để render UI
  if (merged.length === 0) {
    return { items: [], total: 0, config: { forgottenThresholdDays: config.forgottenThresholdDays, autoReturnAfterMinutes: config.autoReturnAfterMinutes, requirePhoneInPool: config.requirePhoneInPool } };
  }

  const contactIds = merged.map((m) => m.contactId);
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    select: {
      id: true,
      fullName: true,
      crmName: true,
      phone: true,
      phoneNormalized: true,
      hasZalo: true,
      status: true,
      lastActivity: true,
      assignedUser: { select: { id: true, fullName: true, email: true } },
      statusRef: { select: { name: true, color: true } },
      _count: { select: { friends: { where: { friendshipStatus: 'accepted' } }, contactNotes: true } },
    },
  });
  const cMap = Object.fromEntries(contacts.map((c) => [c.id, c]));

  const items = merged.map((m) => {
    const c = cMap[m.contactId];
    if (!c) return null;
    const daysIdle = c.lastActivity ? Math.floor((Date.now() - c.lastActivity.getTime()) / 86400000) : null;
    return {
      contactId: c.id,
      priorityScore: m.priorityScore,
      source: m.source,
      name: c.crmName || c.fullName || c.phone || 'KH chưa đặt tên',
      phone: c.phone,
      hasPhone: !!c.phoneNormalized,
      hasZalo: c.hasZalo,
      acceptedNickCount: c._count.friends,
      noteCount: c._count.contactNotes,
      status: c.statusRef?.name ?? c.status,
      statusColor: c.statusRef?.color,
      daysIdle,
      lastActivity: c.lastActivity,
      previousAssignee: c.assignedUser ? { id: c.assignedUser.id, fullName: c.assignedUser.fullName } : null,
    };
  }).filter(Boolean);

  return {
    items,
    total: items.length,
    config: {
      forgottenThresholdDays: config.forgottenThresholdDays,
      autoReturnAfterMinutes: config.autoReturnAfterMinutes,
      requirePhoneInPool: config.requirePhoneInPool,
    },
  };
}

// Variant non-tx của queryCustomerListCandidates cho preview (không tạo stub).
async function queryCustomerListPreview(orgId: string, userId: string, limit = 50): Promise<PriorityCandidate[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ contact_id: string; days_in_list: number }>>(
    `
    SELECT cle.contact_id, EXTRACT(EPOCH FROM (NOW() - cle.created_at)) / 86400 AS days_in_list
    FROM customer_list_entries cle
    JOIN customer_lists cl ON cl.id = cle.customer_list_id
    WHERE cl.org_id = $1
      AND cl.shareable_to_pool = true
      AND cl.archived_at IS NULL
      AND cle.status IN ('validated', 'enriched')
      AND cle.phone_valid = true
      AND cle.contact_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM contacts cc
        WHERE cc.id = cle.contact_id
          AND (cc.assigned_user_id IS NULL OR cc.assigned_user_id != $2)
      )
    ORDER BY days_in_list DESC
    LIMIT $3
    `,
    orgId, userId, limit,
  );
  return rows.map((r) => ({
    contactId: r.contact_id,
    source: 'customer_list' as const,
    priorityScore: Math.round(Number(r.days_in_list) + 10),
  }));
}

/**
 * Tìm conversation phù hợp để sale mở chat với KH.
 * Workflow:
 *   1. Nếu Contact có Friend accepted với nick của sale → tìm Conversation tương ứng
 *   2. Nếu chưa có conv nhưng có Friend → trả về thông tin để FE mở chat tạo mới
 *   3. Nếu chưa có Friend (chưa rõ Zalo) → trả về { canChat: false, reason: 'no_zalo' }
 *      → FE sẽ hiện toast "KH chưa bật tìm kiếm Zalo, hãy gọi điện ngay"
 */
export async function openChatForLead(args: { userId: string; orgId: string; leadRequestId: string }) {
  const lr = await prisma.leadRequest.findUnique({
    where: { id: args.leadRequestId },
    include: {
      contact: {
        select: {
          id: true, phone: true, phoneNormalized: true, hasZalo: true,
          friends: {
            where: { friendshipStatus: 'accepted' },
            select: {
              id: true, zaloAccountId: true, zaloUidInNick: true,
              zaloAccount: { select: { id: true, ownerUserId: true, displayName: true } },
            },
          },
        },
      },
    },
  });
  if (!lr) throw new LeadPoolError(404, 'lead_not_found', 'Lead không tồn tại');
  if (lr.requestedByUserId !== args.userId) {
    throw new LeadPoolError(403, 'not_owner', 'Không phải lead của bạn');
  }

  // Ưu tiên Friend của chính sale này (nick OWN của sale)
  const myFriend = lr.contact.friends.find((f) => f.zaloAccount.ownerUserId === args.userId);
  // Fallback: bất kỳ Friend accepted nào trong org (cross-nick)
  const anyFriend = myFriend ?? lr.contact.friends[0];

  if (!anyFriend) {
    // Chưa có friend → cần check hasZalo
    if (lr.contact.hasZalo === false) {
      return {
        canChat: false,
        reason: 'no_zalo',
        message: 'KH chưa bật tìm kiếm Zalo. Hãy gọi cho khách bằng điện thoại ngay bạn nhé!',
        phone: lr.contact.phone,
      };
    }
    return {
      canChat: false,
      reason: 'not_friended',
      message: 'KH chưa kết bạn với nick nào của org. Bấm "Tìm Zalo qua SĐT" trước.',
      phone: lr.contact.phone,
    };
  }

  // Tìm conversation tương ứng (Friend đã accept → conv có thể tồn tại sẵn)
  const conv = await prisma.conversation.findFirst({
    where: {
      orgId: args.orgId,
      zaloAccountId: anyFriend.zaloAccountId,
      externalThreadId: anyFriend.zaloUidInNick,
      threadType: 'user',
    },
    select: { id: true, lastMessageAt: true },
  });

  return {
    canChat: true,
    conversationId: conv?.id ?? null,
    zaloAccountId: anyFriend.zaloAccountId,
    nickDisplayName: anyFriend.zaloAccount.displayName,
    threadId: anyFriend.zaloUidInNick,
    contactId: lr.contact.id,
  };
}

export function startLeadPoolCron() {
  function scheduleNext() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(2, 0, 0, 0); // 2am local
    if (next <= now) next.setDate(next.getDate() + 1);
    const delayMs = next.getTime() - now.getTime();
    setTimeout(async () => {
      try {
        await autoReturnExpiredLeads();
      } catch (err) {
        logger.error('[lead-pool-cron] failed:', err);
      } finally {
        scheduleNext();
      }
    }, delayMs);
  }
  scheduleNext();
  logger.info('[lead-pool-cron] scheduled (daily 2am)');
}
