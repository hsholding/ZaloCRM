<template>
  <div class="table-wrap">
    <table class="ftable" :class="density">
      <thead>
        <tr>
          <th class="cb-col">
            <input
              type="checkbox"
              :checked="allSelected"
              :indeterminate.prop="someSelected && !allSelected"
              @change="onToggleAll"
            />
          </th>
          <th
            v-for="col in visibleCols"
            :key="col.key"
            :class="`col-${col.key}`"
          >{{ labelFor(col.key) }}</th>
          <th class="action-col">Action</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="f in friends"
          :key="f.id"
          :class="{ selected: selected.has(f.id) }"
          @click="onRowClick(f, $event)"
        >
          <td class="cb-col" @click.stop>
            <input type="checkbox" :checked="selected.has(f.id)" @change="onToggleRow(f.id)" />
          </td>
          <td v-for="col in visibleCols" :key="col.key" :class="`col-${col.key}`">
            <Cell :record="f" :col-key="col.key" />
          </td>
          <td class="action-col" @click.stop>
            <div class="row-actions">
              <button title="Chi tiết KH" @click="$emit('open-detail', f)">👁</button>
              <button title="Chat" @click="$emit('open-chat', f)">💬</button>
              <button class="link-btn" title="🔗 Mở KH cha ở tab Khách hàng" @click="$emit('jump-to-kh', f)">🔗</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="!friends.length && !loading" class="empty">
      <div class="ico">🔗</div>
      <h3>Chưa có cặp Bạn bè Zalo nào</h3>
      <p>Lọc hiện tại không khớp cặp nào. Chọn nick Zalo khác hoặc bỏ filter.</p>
    </div>
    <div v-if="loading" class="empty"><div class="ico">⏳</div><p>Đang tải...</p></div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, type VNode } from 'vue';
import type { DbFriend } from '@/composables/use-friends';
import type { ColPref, DensityMode } from '@/composables/use-crm-state';
import { COLS_BB } from '@/constants/crm-columns';

// Functional component — wrap renderCell() vì `<component :is="vnode">` không support VNode trực tiếp.
const Cell = (props: { record: DbFriend; colKey: string }) => renderCell(props.record, props.colKey);
Cell.props = ['record', 'colKey'];

const props = defineProps<{
  friends: DbFriend[];
  cols: ColPref[];
  density: DensityMode;
  loading: boolean;
  selected: Set<string>;
}>();

const emit = defineEmits<{
  (e: 'open-detail', f: DbFriend): void;
  (e: 'open-chat', f: DbFriend): void;
  (e: 'jump-to-kh', f: DbFriend): void;
  (e: 'update:selected', s: Set<string>): void;
}>();

const visibleCols = computed(() => props.cols.filter(c => c.visible));
const labelMap = new Map(COLS_BB.map(d => [d.key, d.label]));
function labelFor(key: string): string { return labelMap.get(key) ?? key; }

// Select handling
const allSelected = computed(() => props.friends.length > 0 && props.friends.every(f => props.selected.has(f.id)));
const someSelected = computed(() => props.friends.some(f => props.selected.has(f.id)));
function onToggleAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  const next = new Set(props.selected);
  if (checked) props.friends.forEach(f => next.add(f.id));
  else props.friends.forEach(f => next.delete(f.id));
  emit('update:selected', next);
}
function onToggleRow(id: string) {
  const next = new Set(props.selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  emit('update:selected', next);
}
function onRowClick(f: DbFriend, e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (t.closest('input, button, .cb-col, .action-col')) return;
  emit('open-detail', f);
}

// Helpers
function initials(name?: string | null): string {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[p.length - 2][0] + p[p.length - 1][0]).toUpperCase();
}
const PALETTE = ['av-c1', 'av-c2', 'av-c3', 'av-c4', 'av-c5', 'av-c6', 'av-c7'];
function hashClass(id: string): string {
  if (!id) return 'av-c1';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function shortUid(uid?: string | null): string {
  if (!uid) return '—';
  if (uid.length <= 12) return uid;
  return `${uid.slice(0, 6)}...${uid.slice(-4)}`;
}
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN');
}
function relativeDate(iso?: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins}p`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}m`;
}
function kbClass(kind: string): string {
  const m: Record<string, string> = { friend: 'success', pending_friend: 'warn', chatting_stranger: 'info', ghost: 'grey' };
  return m[kind] ?? 'grey';
}
function kbLabel(kind: string): string {
  const m: Record<string, string> = {
    friend: '● Đã KB', pending_friend: '◐ Đã mời', chatting_stranger: '◯ Đang nhắn', ghost: '✕ Ngắt',
  };
  return m[kind] ?? '—';
}

function nickLogLevel(f: DbFriend): string {
  // Simple heuristic: hasConversation count proxy → cần backend trả nicklogCount thật
  return f.hasConversation ? 'warm' : '';
}

function renderCell(f: DbFriend, key: string): VNode | string {
  const c = f.contact;
  switch (key) {
    case 'name': {
      const childB = ((c as any)?.parentContactId)
        ? h('span', { class: 'pb child', title: 'KH con' }, 'CON ↩')
        : null;
      return h('div', { class: 'cust-cell' }, [
        h('div', { class: `cav ${hashClass(c?.id || f.id)}` }, initials(c?.crmName || c?.fullName)),
        h('div', { class: 'info' }, [
          h('div', { class: 'name' }, [
            c?.crmName || c?.fullName || '—',
            childB ? ' ' : '',
            childB,
          ]),
          h('div', { class: 'sub' }, c?.phone ? `📱 ${c.phone}` : 'chưa có SĐT'),
        ]),
      ]);
    }
    case 'nicklog':
      return h('div', { class: 'nick-log ' + nickLogLevel(f) }, [
        h('b', {}, String(f.hasConversation ? 1 : 0)),
        h('span', {}, 'nick'),
      ]);
    case 'crmname':
      return h('div', { class: 'crmname-cell' }, [
        h('span', { class: `av-mini ${hashClass(f.zaloAccount?.id || '')}` }, initials(f.zaloAccount?.displayName)),
        h('div', { class: 'crmname-info' }, [
          h('div', { class: 'nm' }, f.zaloAccount?.displayName || '—'),
          h('div', { class: 'alias ' + (f.aliasInNick ? '' : 'empty') }, f.aliasInNick || 'chưa đặt alias'),
        ]),
      ]);
    case 'kb':
      return h('span', { class: 'badge ' + kbClass(f.relationshipKind) }, kbLabel(f.relationshipKind));
    case 'status-friend':
      return f.statusRef
        ? h('span', { class: 'badge grey' }, f.statusRef.name)
        : '—';
    case 'tagscrm': {
      const tags = Array.isArray(f.crmTagsPerNick) ? f.crmTagsPerNick : [];
      if (!tags.length) return '—';
      return h('div', { class: 'tag-chips' }, tags.slice(0, 4).map(t => h('span', { class: 'tag-chip' }, t)));
    }
    case 'last-friend':
      return h('span', { class: 'time' }, '📥 ' + relativeDate(f.lastInteractionAt));
    case 'score-friend':
      return h('span', { class: 'score' }, [
        h('span', { class: 'score-bar' }, h('span', { class: 'fill', style: { width: (f.leadScore ?? 0) + '%' } })),
        h('span', { class: 'score-num' }, String(f.leadScore ?? 0)),
      ]);
    case 'msgs-friend':
      return `${f.totalInbound ?? 0}/${f.totalOutbound ?? 0}`;

    // Extended/hidden cols
    case 'uid':
      return h('span', { class: 'uid-tag', title: f.zaloUidInNick }, shortUid(f.zaloUidInNick));
    case 'globalid-friend':
      return f.zaloGlobalId
        ? h('span', { class: 'uid-tag', title: f.zaloGlobalId }, shortUid(f.zaloGlobalId))
        : '—';
    case 'becamefriend':
      return fmtDate(f.becameFriendAt);
    case 'stucksince':
      return (f as any).stuckSince
        ? h('span', { class: 'badge danger' }, fmtDate((f as any).stuckSince))
        : '—';
    case 'autotags': {
      const tags = Array.isArray((f as any).autoTags) ? (f as any).autoTags : [];
      if (!tags.length) return '—';
      return h('div', { class: 'tag-chips' }, tags.slice(0, 4).map((t: string) => h('span', { class: 'tag-chip' }, t)));
    }
    case 'zalolabels': {
      const labels = Array.isArray(f.zaloLabels) ? f.zaloLabels : [];
      if (!labels.length) return '—';
      return h('div', { class: 'tag-chips' }, labels.slice(0, 3).map((l: any) =>
        h('span', { class: 'tag-chip', style: l?.color ? { background: l.color + '22', color: l.color, borderColor: 'transparent' } : {} },
          '🔵 ' + (l?.name || ''))
      ));
    }
    case 'scorebreakdown': {
      const sb: any = (f as any).scoreBreakdown;
      if (!sb || typeof sb !== 'object') return '—';
      const parts = [];
      if (sb.engagement != null) parts.push(`E:${sb.engagement}`);
      if (sb.intent != null) parts.push(`I:${sb.intent}`);
      if (sb.fit != null) parts.push(`F:${sb.fit}`);
      if (sb.velocity != null) parts.push(`V:${sb.velocity}`);
      return parts.length
        ? h('span', { class: 'uid-tag' }, parts.join(' '))
        : '—';
    }
    default:
      return '—';
  }
}
</script>

<style scoped>
.table-wrap { flex: 1; overflow: auto; background: #fff; min-height: 0; }
.ftable { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; min-width: 1000px; }
.ftable thead th {
  position: sticky; top: 0; background: #fff; z-index: 2;
  padding: 7px 8px; border-bottom: 1px solid #e4e8ef;
  font-weight: 600; font-size: 10.5px; color: #8d96a4;
  text-transform: uppercase; letter-spacing: .04em;
  text-align: left; white-space: nowrap;
}
.ftable tbody td {
  padding: 7px 8px; border-bottom: 1px solid #e4e8ef;
  vertical-align: middle;
}
.ftable.compact tbody td { padding: 4px 8px; }
.ftable.detailed tbody td { padding: 11px 8px; }
.ftable tbody tr { cursor: pointer; }
.ftable tbody tr:hover { background: #f9fafc; }
.ftable tbody tr.selected { background: #e8f0fe; }

.cb-col { width: 28px; padding-right: 3px; }
.action-col { width: 96px; }

.cust-cell { display: flex; align-items: center; gap: 8px; min-width: 180px; }
.cav {
  width: 32px; height: 32px; border-radius: 50%;
  color: #fff; display: grid; place-items: center;
  font-weight: 700; font-size: 11px; flex-shrink: 0;
}
.cust-cell .info { min-width: 0; flex: 1; }
.cust-cell .info .name {
  font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 200px; font-size: 12.5px;
}
.cust-cell .info .sub {
  font-size: 10.5px; color: #8d96a4;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.pb {
  font-size: 9px; padding: 1px 5px; border-radius: 8px;
  font-weight: 700; vertical-align: middle; margin-left: 3px;
}
.pb.child { background: #ede9fe; color: #7c3aed; border: 1px solid #7c3aed; }

.crmname-cell { display: flex; align-items: center; gap: 6px; }
.crmname-info { min-width: 0; }
.crmname-info .nm { font-weight: 600; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.crmname-info .alias { font-size: 10.5px; color: #1a2433; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.crmname-info .alias.empty { color: #8d96a4; font-style: italic; }

.nick-log {
  display: inline-flex; flex-direction: column; align-items: center;
  padding: 2px 6px; border-radius: 5px; background: #f9fafc;
  min-width: 30px;
}
.nick-log b { font-size: 11.5px; color: #1a2433; line-height: 1; }
.nick-log span { font-size: 9px; color: #8d96a4; }
.nick-log.warm { background: #fef3c7; }
.nick-log.warm b { color: #78350f; }

.av-mini {
  width: 22px; height: 22px; border-radius: 50%;
  color: #fff; display: grid; place-items: center;
  font-size: 9px; font-weight: 800; flex-shrink: 0;
}

.row-actions { display: inline-flex; gap: 2px; opacity: 0; transition: opacity .12s; }
.ftable tbody tr:hover .row-actions { opacity: 1; }
.row-actions button {
  width: 24px; height: 24px; border-radius: 4px;
  border: 1px solid #e4e8ef; background: #fff;
  color: #5b6573; font-size: 10px;
  cursor: pointer; font-family: inherit;
}
.row-actions button:hover { background: #2f6ee5; color: #fff; border-color: #2f6ee5; }
.row-actions button.link-btn { border-color: #fbbf24; color: #92400e; }
.row-actions button.link-btn:hover { background: #fbbf24; color: #fff; border-color: #fbbf24; }

.badge {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 1px 7px; border-radius: 9px;
  font-size: 10.5px; font-weight: 600; white-space: nowrap;
}
.badge.success { background: #dcfce7; color: #166534; }
.badge.warn { background: #fef3c7; color: #92400e; }
.badge.info { background: #cffafe; color: #155e75; }
.badge.grey { background: #f1f5f9; color: #475569; }
.badge.danger { background: #fee2e2; color: #b91c1c; }

.score { display: inline-flex; align-items: center; gap: 5px; min-width: 64px; }
.score-bar {
  flex: 1; height: 4px; background: #e4e8ef;
  border-radius: 2px; overflow: hidden; min-width: 30px;
  display: inline-block;
}
.score-bar .fill {
  height: 100%; display: block;
  background: linear-gradient(90deg, #ef4444, #f59e0b, #16a34a);
}
.score-num { font-weight: 700; font-size: 10.5px; color: #5b6573; }

.tag-chips { display: flex; gap: 2px; flex-wrap: wrap; max-width: 140px; }
.tag-chip {
  padding: 1px 6px; border-radius: 8px;
  background: #f9fafc; border: 1px solid #e4e8ef;
  font-size: 10px; color: #5b6573;
}

.uid-tag {
  font-family: 'SF Mono', Menlo, monospace; font-size: 10px;
  background: #f9fafc; color: #8d96a4;
  padding: 1px 5px; border-radius: 4px;
}

.time { font-size: 11px; color: #5b6573; }

.empty { padding: 50px; text-align: center; color: #8d96a4; }
.empty .ico { font-size: 36px; }
.empty h3 { color: #1a2433; margin: 8px 0 4px; }

.av-c1 { background: linear-gradient(135deg, #2f6ee5, #1d4ed8); }
.av-c2 { background: linear-gradient(135deg, #16a34a, #15803d); }
.av-c3 { background: linear-gradient(135deg, #d97706, #b45309); }
.av-c4 { background: linear-gradient(135deg, #7c3aed, #6d28d9); }
.av-c5 { background: linear-gradient(135deg, #db2777, #be185d); }
.av-c6 { background: linear-gradient(135deg, #0891b2, #0e7490); }
.av-c7 { background: linear-gradient(135deg, #ea580c, #c2410c); }
</style>
