/**
 * tag-routes.ts — REST API cho Tag Taxonomy v2.
 *
 * Wave 3 /plan-eng-review M57 2026-05-31.
 *
 * Mount prefix: /api/v1/tags
 *
 * Routes:
 *   GET    /tags?scope=friend|crm&q=...&cursor=...      Search/autocomplete
 *   GET    /tags?recount=1                              Recount usage on-demand (Issue 4A)
 *   POST   /tags                                        Create tag (admin)
 *   PATCH  /tags/:id                                    Update color/group/priority
 *   DELETE /tags/:id                                    Archive tag
 *   POST   /tags/merge                                  Merge 2 tag (admin)
 *
 *   GET    /friends/:id/tags                            List FriendTag với Tag JOIN
 *   POST   /friends/:id/tags                            Add (autoCreate optional)
 *   DELETE /friends/:id/tags/:tagId                     Remove (soft delete)
 *
 *   GET    /contacts/:id/crm-tags                       List ContactTag với Tag JOIN
 *   POST   /contacts/:id/crm-tags                       Add (autoCreate optional)
 *   DELETE /contacts/:id/crm-tags/:tagId                Remove (soft delete)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { TagScope, TagSource } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  addFriendTag,
  removeFriendTag,
  addCrmTag,
  removeCrmTag,
  getFriendTags,
  getCrmTags,
  searchTags,
  mergeTags,
  recountUsage,
} from './tag-service.js';

export async function registerTagRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ─────────────────────────────────────────────────────────────────────
  // Tag definitions
  // ─────────────────────────────────────────────────────────────────────

  app.get('/', async (req: FastifyRequest<{ Querystring: { scope?: string; q?: string; cursor?: string; limit?: string; recount?: string } }>, reply: FastifyReply) => {
    const user = req.user!;
    const scope = (req.query.scope ?? 'friend') as TagScope;
    if (scope !== 'friend' && scope !== 'crm') {
      return reply.code(400).send({ error: 'INVALID_SCOPE' });
    }

    if (req.query.recount === '1') {
      const result = await recountUsage(user.orgId, scope);
      return reply.send({ recount: result.updated });
    }

    const tags = await searchTags({
      orgId: user.orgId,
      scope,
      q: req.query.q ?? '',
      limit: req.query.limit ? parseInt(req.query.limit, 10) : 20,
      cursor: req.query.cursor,
    });
    return reply.send({ tags });
  });

  app.post('/', async (req: FastifyRequest<{ Body: { name: string; scope: TagScope; source: TagSource; color?: string; emoji?: string; groupId?: string } }>, reply: FastifyReply) => {
    const user = req.user!;
    const { name, scope, source, color, emoji, groupId } = req.body;
    if (!name || !scope || !source) return reply.code(400).send({ error: 'MISSING_FIELDS' });

    try {
      const tag = await prisma.$transaction(async (tx) => {
        const { findOrCreateTag } = await import('./tag-service.js');
        return findOrCreateTag(tx, { orgId: user.orgId, scope, source, name, color, emoji });
      });
      if (groupId) {
        await prisma.tag.update({ where: { id: tag.id }, data: { groupId } });
      }
      return reply.send({ tag });
    } catch (err) {
      const msg = (err as Error).message;
      logger.warn('[tag-routes] create failed: %s', msg);
      return reply.code(400).send({ error: msg });
    }
  });

  app.patch('/:id', async (req: FastifyRequest<{ Params: { id: string }; Body: { color?: string; emoji?: string; groupId?: string | null; priority?: number } }>, reply: FastifyReply) => {
    const user = req.user!;
    const tag = await prisma.tag.findUnique({ where: { id: req.params.id } });
    if (!tag || tag.orgId !== user.orgId) return reply.code(404).send({ error: 'TAG_NOT_FOUND' });
    if (tag.source === 'zalo_real' && req.body.color === undefined && req.body.emoji === undefined && req.body.groupId === undefined) {
      return reply.code(400).send({ error: 'ZALO_REAL_NAME_READONLY', message: 'Tên sync từ Zalo Real, đổi trên Zalo app' });
    }
    const updated = await prisma.tag.update({
      where: { id: tag.id },
      data: {
        ...(req.body.color !== undefined ? { color: req.body.color } : {}),
        ...(req.body.emoji !== undefined ? { emoji: req.body.emoji } : {}),
        ...(req.body.groupId !== undefined ? { groupId: req.body.groupId } : {}),
        ...(req.body.priority !== undefined ? { priority: req.body.priority } : {}),
      },
    });
    return reply.send({ tag: updated });
  });

  app.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const user = req.user!;
    const tag = await prisma.tag.findUnique({ where: { id: req.params.id } });
    if (!tag || tag.orgId !== user.orgId) return reply.code(404).send({ error: 'TAG_NOT_FOUND' });
    await prisma.tag.update({ where: { id: tag.id }, data: { archivedAt: new Date() } });
    return reply.send({ ok: true });
  });

  app.post('/merge', async (req: FastifyRequest<{ Body: { sourceTagId: string; targetTagId: string } }>, reply: FastifyReply) => {
    const user = req.user!;
    try {
      const result = await mergeTags({
        orgId: user.orgId,
        sourceTagId: req.body.sourceTagId,
        targetTagId: req.body.targetTagId,
        mergedBy: user.id,
      });
      return reply.send(result);
    } catch (err) {
      const msg = (err as Error).message;
      return reply.code(400).send({ error: msg });
    }
  });
}

/**
 * Register friend-tag routes ở prefix /api/v1/friends.
 */
export async function registerFriendTagRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/:id/tags', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const friendTags = await getFriendTags(req.params.id);
    return reply.send({ friendTags });
  });

  app.post('/:id/tags', async (req: FastifyRequest<{ Params: { id: string }; Body: { tagId?: string; tagSlug?: string; tagName?: string; source: TagSource; autoCreate?: boolean; color?: string } }>, reply: FastifyReply) => {
    const user = req.user!;
    try {
      const result = await addFriendTag({
        friendId: req.params.id,
        tagId: req.body.tagId,
        tagSlug: req.body.tagSlug,
        tagName: req.body.tagName,
        source: req.body.source,
        addedBy: user.id,
        autoCreate: req.body.autoCreate,
        color: req.body.color,
      });
      return reply.send(result);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.delete('/:id/tags/:tagId', async (req: FastifyRequest<{ Params: { id: string; tagId: string } }>, reply: FastifyReply) => {
    const user = req.user!;
    await removeFriendTag({ friendId: req.params.id, tagId: req.params.tagId, removedBy: user.id });
    return reply.send({ ok: true });
  });
}

/**
 * Register CRM-tag routes ở prefix /api/v1/contacts.
 */
export async function registerContactCrmTagRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/:id/crm-tags', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const contactTags = await getCrmTags(req.params.id);
    return reply.send({ contactTags });
  });

  app.post('/:id/crm-tags', async (req: FastifyRequest<{ Params: { id: string }; Body: { tagId?: string; tagSlug?: string; tagName?: string; source: TagSource; autoCreate?: boolean; color?: string } }>, reply: FastifyReply) => {
    const user = req.user!;
    try {
      const result = await addCrmTag({
        contactId: req.params.id,
        tagId: req.body.tagId,
        tagSlug: req.body.tagSlug,
        tagName: req.body.tagName,
        source: req.body.source ?? 'manual_crm',
        addedBy: user.id,
        autoCreate: req.body.autoCreate,
        color: req.body.color,
      });
      return reply.send(result);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.delete('/:id/crm-tags/:tagId', async (req: FastifyRequest<{ Params: { id: string; tagId: string } }>, reply: FastifyReply) => {
    const user = req.user!;
    await removeCrmTag({ contactId: req.params.id, tagId: req.params.tagId, removedBy: user.id });
    return reply.send({ ok: true });
  });
}
