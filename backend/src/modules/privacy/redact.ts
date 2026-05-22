/**
 * redact.ts — Phase Riêng Tư 2026-05-22
 *
 * Server-side redaction helpers. Áp dụng cho mọi endpoint trả KH content/PII
 * khi viewer KHÔNG own nick main + chưa unlock PIN.
 *
 * Anh chốt Q4: avatar KH blur CHỈ ở conv nick main (conv sub vẫn hiện đầy đủ).
 * Anh chốt Q6: nick name/avatar (sale) KHÔNG blur.
 * Anh chốt: metadata (count, score, KPI aggregate) KHÔNG blur, chỉ content.
 */
import { prisma } from '../../shared/database/prisma-client.js';

const BLUR_TOKEN = '▒'.repeat(8);

export interface PrivacyContext {
  /** Current user (viewer) — null = anonymous (shouldn't happen post-auth) */
  viewerUserId: string | null;
  /** True nếu viewer đã unlock PIN trong session hiện tại */
  privacyUnlocked: boolean;
}

/**
 * Decide: viewer có quyền xem content của 1 conv không?
 * - Sub-nick conv → always show.
 * - Main-nick conv → only owner + unlocked.
 */
export function canSeeConversationContent(
  conv: { zaloAccount: { privacyMode: string; ownerUserId: string } },
  ctx: PrivacyContext,
): boolean {
  if (conv.zaloAccount.privacyMode !== 'main') return true;
  const isOwner = conv.zaloAccount.ownerUserId === ctx.viewerUserId;
  return isOwner && ctx.privacyUnlocked;
}

/**
 * Redact 1 message (chat content + attachments) nếu thuộc main-nick conv không owned.
 */
export function redactMessage<T extends {
  content?: string | null;
  attachments?: any;
  quote?: any;
}>(
  msg: T,
  conv: { zaloAccount: { privacyMode: string; ownerUserId: string } },
  ctx: PrivacyContext,
): T & { redacted?: boolean } {
  if (canSeeConversationContent(conv, ctx)) return msg;
  return {
    ...msg,
    content: BLUR_TOKEN,
    attachments: [],
    quote: null,
    redacted: true,
  } as any;
}

/**
 * Redact conversation row (list view) — main-nick: blur preview text + lastMessage.
 */
export function redactConversationRow<T extends {
  lastMessageContent?: string | null;
  unreadCount?: number;
}>(
  conv: T & { zaloAccount: { privacyMode: string; ownerUserId: string } },
  ctx: PrivacyContext,
): T & { redacted?: boolean } {
  if (canSeeConversationContent(conv, ctx)) return conv;
  return {
    ...conv,
    lastMessageContent: BLUR_TOKEN,
    // unreadCount giữ — metadata, không leak content
    redacted: true,
  } as any;
}

/**
 * Decide: viewer có quyền xem PII của 1 Contact không?
 *
 * Anh chốt Q4: contact PII blur NẾU có ít nhất 1 friend row thuộc main-nick
 * mà viewer không own (và viewer chưa unlock).
 *
 * Logic: query friends của contact, check existence của main-nick row không-own.
 * Performance: 1 EXISTS query per contact. Có thể cache nếu hot.
 */
export async function shouldRedactContactPii(
  contactId: string,
  ctx: PrivacyContext,
): Promise<boolean> {
  // Nếu unlocked, vẫn có thể không own → cần check riêng
  const offending = await prisma.friend.findFirst({
    where: {
      contactId,
      zaloAccount: {
        privacyMode: 'main',
        ownerUserId: ctx.viewerUserId ? { not: ctx.viewerUserId } : undefined,
      },
    },
    select: { id: true },
  });
  if (!offending) return false; // không có main-nick non-owned → safe
  // Có main-nick non-owned. Viewer có thể là owner nick khác (cũng main) → vẫn có nick non-owned của viewer
  // → redact (paranoid theo Q4).
  // Nếu viewer đang unlock + OWN ít nhất 1 main-nick contact này tương tác → vẫn redact những phần
  // thuộc main-nick non-owned. Đơn giản hoá: cứ blur khi có bất kỳ main-nick non-owned, kể cả unlocked.
  // Reason: ngay cả khi unlock, viewer vẫn không phải owner của main-nick "kia" → không nên xem.
  return true;
}

/**
 * Redact Contact object — strip PII, giữ ID + score aggregate.
 */
export function redactContact<T extends {
  fullName?: string | null;
  zaloUid?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}>(
  contact: T,
): T & { redacted: true } {
  return {
    ...contact,
    fullName: BLUR_TOKEN,
    zaloUid: null,
    avatarUrl: null,
    phone: null,
    email: null,
    notes: null,
    redacted: true,
  } as any;
}

/**
 * Redact Friend row — blur display name + alias nếu thuộc main-nick non-owned.
 */
export function redactFriend<T extends {
  aliasInNick?: string | null;
  zaloUidInNick?: string | null;
}>(
  friend: T & { zaloAccount: { privacyMode: string; ownerUserId: string } },
  ctx: PrivacyContext,
): T & { redacted?: boolean } {
  if (friend.zaloAccount.privacyMode !== 'main') return friend;
  const isOwner = friend.zaloAccount.ownerUserId === ctx.viewerUserId;
  if (isOwner && ctx.privacyUnlocked) return friend;
  return {
    ...friend,
    aliasInNick: BLUR_TOKEN,
    zaloUidInNick: null,
    redacted: true,
  } as any;
}

/**
 * Build PrivacyContext từ Fastify request — đọc cookie + resolve session.
 * Inject as preHandler hoặc gọi inline trong handler.
 */
export async function buildPrivacyContext(request: any): Promise<PrivacyContext> {
  const user = request.user;
  if (!user) return { viewerUserId: null, privacyUnlocked: false };

  const cookies = parseCookies(request.headers.cookie);
  const token = cookies.priv_session;
  if (!token) return { viewerUserId: user.userId ?? user.id, privacyUnlocked: false };

  const { resolveSession } = await import('./pin-service.js');
  const session = await resolveSession(token);
  return {
    viewerUserId: user.userId ?? user.id,
    privacyUnlocked: !!session && session.userId === (user.userId ?? user.id),
  };
}

function parseCookies(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  return Object.fromEntries(
    raw.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    }),
  );
}

/** Hằng số export cho test + frontend reference */
export const PRIVACY_BLUR_TOKEN = BLUR_TOKEN;
