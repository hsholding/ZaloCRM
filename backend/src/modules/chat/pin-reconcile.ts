// Pin reconcile — 2-chiều Zalo ↔ CRM cho ghim hội thoại (anh chốt 2026-05-28).
//
// Bối cảnh: zca-js Listener KHÔNG emit event khi user pin/unpin trên Zalo Web/App
// → chiều ngược Zalo→CRM phải dùng polling/sync. Approach: gọi getPinConversations
// mỗi lần nick reconnect (event 'connected') để reset state khớp Zalo native.
//
// Side đối xứng vs chiều xuôi (CRM→Zalo via chat-operations-routes.ts:680-720):
//   - Zalo có mà CRM thiếu → INSERT vào CRM + emit socket 'chat:pinned'
//   - CRM có mà Zalo không → DELETE từ CRM + emit socket 'chat:unpinned'
//
// CHỈ chạy 1 lần per reconnect (không cron periodic) — tránh load nhiều cho SDK.
// Sale switch giữa Zalo native ↔ CRM hiếm khi cần realtime sync pin.

import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloOps } from '../../shared/zalo-operations.js';

export async function reconcilePinsOnReconnect(
  accountId: string,
  io: Server | null,
): Promise<{ added: number; removed: number; total: number }> {
  try {
    // 1. Lấy list pin từ Zalo native
    const result: any = await zaloOps.getPinConversations(accountId);
    const zaloThreadIds: string[] = Array.isArray(result?.conversations) ? result.conversations : [];

    // 2. Resolve nick → org + accessible conversations
    const nick = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { id: true, orgId: true },
    });
    if (!nick) {
      logger.warn(`[pin-reconcile:${accountId}] nick not found in DB`);
      return { added: 0, removed: 0, total: 0 };
    }

    // 3. Map zalo threadIds → CRM Conversation ids (qua externalThreadId)
    const matchedConvs = zaloThreadIds.length === 0
      ? []
      : await prisma.conversation.findMany({
          where: {
            zaloAccountId: accountId,
            externalThreadId: { in: zaloThreadIds },
          },
          select: { id: true, externalThreadId: true },
        });
    const zaloMatchedConvIds = new Set(matchedConvs.map((c) => c.id));

    // 4. Lấy CRM pinned hiện tại
    const crmPinned = await prisma.pinnedConversation.findMany({
      where: { zaloAccountId: accountId },
      select: { id: true, conversationId: true },
    });
    const crmPinnedConvIds = new Set(crmPinned.map((p) => p.conversationId));

    // 5. Diff
    const toAdd = [...zaloMatchedConvIds].filter((id) => !crmPinnedConvIds.has(id));
    const toRemove = [...crmPinnedConvIds].filter((id) => !zaloMatchedConvIds.has(id));

    if (toAdd.length === 0 && toRemove.length === 0) {
      logger.info(`[pin-reconcile:${accountId}] in-sync, ${crmPinned.length} pins (zalo=${zaloThreadIds.length}, matched=${zaloMatchedConvIds.size})`);
      return { added: 0, removed: 0, total: crmPinned.length };
    }

    // 6. Apply
    if (toAdd.length > 0) {
      await prisma.pinnedConversation.createMany({
        data: toAdd.map((conversationId) => ({
          id: randomUUID(),
          orgId: nick.orgId,
          zaloAccountId: accountId,
          conversationId,
          pinnedAt: new Date(),
        })),
        skipDuplicates: true,
      });
      for (const conversationId of toAdd) {
        io?.emit('chat:pinned', { conversationId, isPinned: true, source: 'zalo-sync' });
      }
    }
    if (toRemove.length > 0) {
      await prisma.pinnedConversation.deleteMany({
        where: {
          zaloAccountId: accountId,
          conversationId: { in: toRemove },
        },
      });
      for (const conversationId of toRemove) {
        io?.emit('chat:unpinned', { conversationId, isPinned: false, source: 'zalo-sync' });
      }
    }

    logger.info(`[pin-reconcile:${accountId}] synced ${toAdd.length} added, ${toRemove.length} removed (zalo=${zaloThreadIds.length}, matched=${zaloMatchedConvIds.size})`);
    return { added: toAdd.length, removed: toRemove.length, total: zaloMatchedConvIds.size };
  } catch (err) {
    logger.error(`[pin-reconcile:${accountId}] error:`, err);
    return { added: 0, removed: 0, total: 0 };
  }
}
