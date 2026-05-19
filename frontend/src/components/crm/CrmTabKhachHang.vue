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
          <th class="exp-col"></th>
          <th
            v-for="col in visibleCols"
            :key="col.key"
            :class="`col-${col.key}`"
          >{{ labelFor(col.key) }}</th>
          <th class="action-col">Action</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="c in contacts" :key="c.id">
          <tr :class="{ selected: selected.has(c.id), expanded: expandedIds.has(c.id) }" @click="onRowClick(c, $event)">
            <td class="cb-col" @click.stop>
              <input type="checkbox" :checked="selected.has(c.id)" @change="onToggleRow(c.id)" />
            </td>
            <td class="exp-col">
              <button
                class="exp-btn"
                :class="{ open: expandedIds.has(c.id) }"
                @click.stop="toggleExpand(c.id)"
              >{{ expandedIds.has(c.id) ? '▼' : '▶' }}</button>
            </td>
            <td v-for="col in visibleCols" :key="col.key" :class="`col-${col.key}`">
              <component :is="renderCell(c, col.key)" />
            </td>
            <td class="action-col" @click.stop>
              <div class="row-actions">
                <button title="Chi tiết" @click="$emit('open-detail', c)">👁</button>
                <button title="Chat" @click="$emit('open-chat', c)">💬</button>
                <button class="link-btn" title="🔗 Mở Bạn bè Zalo của KH này" @click="$emit('jump-to-bb', c)">🔗</button>
              </div>
            </td>
          </tr>
          <tr v-if="expandedIds.has(c.id)" class="nested-tr">
            <td :colspan="visibleCols.length + 3">
              <div class="nested">
                <div class="nf-title">
                  ⤷ {{ friendsByContact[c.id]?.length ?? 0 }} cặp chăm KH "{{ c.crmName || c.fullName }}"
                  <button class="jump-btn" @click="$emit('jump-to-bb', c)">
                    🔗 Mở trong tab "Bạn bè Zalo" →
                  </button>
                </div>
                <div v-if="loadingFriends[c.id]" class="nf-loading">Đang tải cặp chăm…</div>
                <div
                  v-for="f in (friendsByContact[c.id] || [])"
                  :key="f.id"
                  class="nf-row"
                  @click="$emit('open-detail', c)"
                >
                  <div class="nick-info">
                    <span class="av-mini" :class="hashClass(f.zaloAccount?.id || '')">
                      {{ initials(f.zaloAccount?.displayName) }}
                    </span>
                    <div class="nm-block">
                      <div class="nm">{{ f.zaloAccount?.displayName || '—' }}</div>
                      <div class="uid">UID {{ shortUid(f.zaloUidInNick) }}</div>
                    </div>
                  </div>
                  <span class="alias-cell" :class="{ empty: !f.aliasInNick }">
                    {{ f.aliasInNick || '— chưa đặt alias —' }}
                  </span>
                  <span><span class="badge" :class="kbClass(f.relationshipKind)">{{ kbLabel(f.relationshipKind) }}</span></span>
                  <span class="score">
                    <span class="score-bar"><span class="fill" :style="{ width: (f.leadScore ?? 0) + '%' }" /></span>
                    <span class="score-num">{{ f.leadScore ?? 0 }}</span>
                  </span>
                  <span class="msgs-cell">{{ f.totalInbound ?? 0 }}/{{ f.totalOutbound ?? 0 }}</span>
                  <span class="last-cell">📥 {{ relativeDate(f.lastInteractionAt) }}</span>
                  <div class="nf-actions" @click.stop>
                    <button title="Chat">💬</button>
                    <button class="link-btn" title="🔗 Xem trong Bạn bè Zalo" @click="$emit('jump-to-bb', c)">🔗</button>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <div v-if="!contacts.length && !loading" class="empty">
      <div class="ico">🧑</div>
      <h3>Chưa có khách hàng</h3>
      <p>Lọc hiện tại không khớp KH nào. Thử bỏ filter hoặc tạo KH mới.</p>
    </div>
    <div v-if="loading" class="empty"><div class="ico">⏳</div><p>Đang tải...</p></div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, type VNode } from 'vue';
import type { Contact } from '@/composables/use-contacts';
import type { DbFriend } from '@/composables/use-friends';
import type { OrgUser } from '@/composables/use-users';
import type { ColPref, DensityMode } from '@/composables/use-crm-state';
import { COLS_KH } from '@/constants/crm-columns';

const props = defineProps<{
  contacts: Contact[];
  cols: ColPref[];
  density: DensityMode;
  loading: boolean;
  selected: Set<string>;
  expandedIds: Set<string>;
  friendsByContact: Record<string, DbFriend[]>;
  loadingFriends: Record<string, boolean>;
  users: OrgUser[];
}>();

const emit = defineEmits<{
  (e: 'open-detail', c: Contact): void;
  (e: 'open-chat', c: Contact): void;
  (e: 'jump-to-bb', c: Contact): void;
  (e: 'update:selected', s: Set<string>): void;
  (e: 'toggle-expand', id: string): void;
}>();

const visibleCols = computed(() => props.cols.filter(c => c.visible));
const labelMap = new Map(COLS_KH.map(d => [d.key, d.label]));
function labelFor(key: string): string { return labelMap.get(key) ?? key; }

// ─── Select handling ───
const allSelected = computed(() => props.contacts.length > 0 && props.contacts.every(c => props.selected.has(c.id)));
const someSelected = computed(() => props.contacts.some(c => props.selected.has(c.id)));
function onToggleAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  const next = new Set(props.selected);
  if (checked) props.contacts.forEach(c => next.add(c.id));
  else props.contacts.forEach(c => next.delete(c.id));
  emit('update:selected', next);
}
function onToggleRow(id: string) {
  const next = new Set(props.selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  emit('update:selected', next);
}
function onRowClick(c: Contact, e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (t.closest('input, button, .exp-btn, .cb-col, .exp-col, .action-col')) return;
  emit('open-detail', c);
}
function toggleExpand(id: string) { emit('toggle-expand', id); }

// ─── Helpers ───
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

function userById(id?: string | null): OrgUser | undefined {
  if (!id) return undefined;
  return props.users.find(u => u.id === id);
}

function shortUid(uid?: string | null): string {
  if (!uid) return '—';
  if (uid.length <= 12) return uid;
  return `${uid.slice(0, 6)}...${uid.slice(-4)}`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN');
}
function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN') + ' ' + d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
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

function genderLabel(g?: string | null): string {
  if (!g) return '—';
  if (g === 'male') return 'Nam';
  if (g === 'female') return 'Nữ';
  return g;
}

function placeLabel(c: Contact): string {
  const parts = [c.district, c.province].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

function nickCountLabel(c: Contact): string {
  const accepted = (c as any).acceptedNicksCount ?? 0;
  const total = ['friend', 'pending_friend', 'chatting_stranger'].reduce((s, k) => s + ((c.nicksByKind?.[k] ?? 0)), 0);
  if (total > 0) return `${total} cặp${accepted > 0 ? ` · ${accepted} đã KB` : ''}`;
  return '—';
}

// Cell renderer — returns a render function
function renderCell(c: Contact, key: string): VNode | string {
  switch (key) {
    case 'name': {
      const parentB = ((c.childrenCount ?? 0) > 0) ? h('span', { class: 'pb parent', title: 'KH cha' }, 'CHA') : null;
      const childB = c.parentContactId ? h('span', { class: 'pb child', title: 'KH con' }, 'CON ↩') : null;
      return h('div', { class: 'cust-cell' }, [
        h('div', { class: `cav ${hashClass(c.id)} ${c.hasZalo ? 'has-zalo' : ''}` }, initials(c.crmName || c.fullName)),
        h('div', { class: 'info' }, [
          h('div', { class: 'name' }, [
            (c.crmName || c.fullName || '—'),
            parentB ? ' ' : '',
            parentB,
            childB ? ' ' : '',
            childB,
          ]),
          h('div', { class: 'sub' }, c.phone ? `📱 ${c.phone}` : 'chưa có SĐT'),
        ]),
      ]);
    }
    case 'phone':
      return c.phone || '—';
    case 'gender':
      return genderLabel(c.gender);
    case 'province':
      return placeLabel(c);
    case 'source':
      return c.source ? h('span', { class: 'badge grey' }, c.source) : '—';
    case 'status':
      return c.statusRef ? h('span', { class: 'badge grey' }, c.statusRef.name) : '—';
    case 'score':
      return h('span', { class: 'score' }, [
        h('span', { class: 'score-bar' }, h('span', { class: 'fill', style: { width: (c.leadScore ?? 0) + '%' } })),
        h('span', { class: 'score-num' }, String(c.leadScore ?? 0)),
      ]);
    case 'nicks':
      return nickCountLabel(c);
    case 'mainsale': {
      const u = userById(c.assignedUserId);
      if (!u) return '—';
      return h('span', { class: 'nick-mini' }, [
        h('span', { class: `av-mini ${hashClass(u.id)}` }, initials(u.fullName)),
        u.fullName,
      ]);
    }
    case 'cust-last':
      return h('span', { class: 'time' }, '📥 ' + relativeDate(c.lastInboundAt));
    case 'sale-last':
      return h('span', { class: 'time' }, '📤 ' + relativeDate(c.lastOutboundAt));
    case 'msgs':
      return `${c.totalInbound ?? 0}/${c.totalOutbound ?? 0}`;
    case 'tags': {
      if (!c.tags?.length) return '—';
      return h('div', { class: 'tag-chips' }, c.tags.slice(0, 4).map(t => h('span', { class: 'tag-chip' }, t)));
    }
    case 'haszalo':
      return c.hasZalo
        ? h('span', { class: 'badge yes' }, '✓ Có')
        : h('span', { class: 'badge no' }, '✕ Chưa');
    case 'globalid': {
      const gid = c.zaloGlobalId || (c as any).aggregateZaloGlobalId;
      return gid ? h('span', { class: 'uid-tag', title: gid }, shortUid(gid)) : '—';
    }
    case 'email':
      return c.email || '—';
    case 'birthyear':
      return c.birthYear ? String(c.birthYear) : '—';
    case 'occupation':
      return c.occupation || '—';
    case 'consent':
      return c.consentStatus
        ? h('span', { class: 'badge ' + (c.consentStatus === 'granted' ? 'success' : 'grey') }, c.consentStatus)
        : '—';
    case 'phone2':
      return c.phone2 || '—';
    case 'ward':
      return c.ward || '—';
    case 'incomerange':
      return c.incomeRange || '—';
    case 'created':
      return fmtDate(c.createdAt);
    case 'updated':
      return fmtDateTime(c.updatedAt);
    default:
      return '—';
  }
}
</script>

<style scoped>
.table-wrap { flex: 1; overflow: auto; background: #fff; min-height: 0; }
.ftable { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; min-width: 1200px; }
.ftable thead th {
  position: sticky; top: 0;
  background: #fff; z-index: 2;
  padding: 7px 8px;
  border-bottom: 1px solid #e4e8ef;
  font-weight: 600; font-size: 10.5px;
  color: #8d96a4;
  text-transform: uppercase; letter-spacing: .04em;
  text-align: left; white-space: nowrap;
}
.ftable tbody td {
  padding: 7px 8px;
  border-bottom: 1px solid #e4e8ef;
  vertical-align: middle;
}
.ftable.compact tbody td { padding: 4px 8px; }
.ftable.detailed tbody td { padding: 11px 8px; }
.ftable tbody tr { cursor: pointer; }
.ftable tbody tr:hover { background: #f9fafc; }
.ftable tbody tr.selected { background: #e8f0fe; }
.ftable tbody tr.expanded { background: #e8f0fe; }

.cb-col { width: 28px; padding-right: 3px; }
.exp-col { width: 26px; }
.action-col { width: 96px; }

.cust-cell { display: flex; align-items: center; gap: 8px; min-width: 180px; }
.cav {
  width: 32px; height: 32px; border-radius: 50%;
  color: #fff; display: grid; place-items: center;
  font-weight: 700; font-size: 11px; flex-shrink: 0;
  position: relative;
}
.cav.has-zalo::after {
  content: "🔵"; position: absolute; bottom: -3px; right: -3px;
  font-size: 10px; line-height: 1;
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
.pb.parent { background: #7c3aed; color: #fff; }
.pb.child { background: #ede9fe; color: #7c3aed; border: 1px solid #7c3aed; }

.exp-btn {
  width: 22px; height: 22px; border-radius: 4px;
  background: transparent; border: 1px solid #e4e8ef;
  color: #5b6573; cursor: pointer;
  font-size: 10px; font-family: inherit; line-height: 1;
}
.exp-btn:hover { background: #2f6ee5; color: #fff; border-color: #2f6ee5; }
.exp-btn.open { background: #2f6ee5; color: #fff; border-color: #2f6ee5; }

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
.badge.yes { background: #dcfce7; color: #166534; }
.badge.no { background: #fee2e2; color: #991b1b; }

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

.nick-mini { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; }
.av-mini {
  width: 20px; height: 20px; border-radius: 50%;
  color: #fff; display: grid; place-items: center;
  font-size: 8px; font-weight: 800; flex-shrink: 0;
}

.uid-tag {
  font-family: 'SF Mono', Menlo, monospace; font-size: 10px;
  background: #f9fafc; color: #8d96a4;
  padding: 1px 5px; border-radius: 4px;
}

.time { font-size: 11px; color: #5b6573; }

/* Nested expand */
.nested-tr td { padding: 0 !important; border-bottom: none !important; }
.nested {
  background: linear-gradient(180deg, #fbfcfe 0%, #fff 100%);
  padding: 8px 18px 12px 50px;
  border-bottom: 1px solid #e4e8ef;
}
.nf-title {
  font-size: 10.5px; color: #8d96a4;
  text-transform: uppercase; font-weight: 700;
  margin-bottom: 6px; letter-spacing: .04em;
  display: flex; align-items: center; gap: 8px;
}
.jump-btn {
  margin-left: auto;
  font-size: 11px; background: #fef3c7; color: #78350f;
  border: 1px solid #fbbf24; padding: 3px 8px;
  border-radius: 6px; cursor: pointer;
  font-family: inherit; font-weight: 600;
  text-transform: none; letter-spacing: 0;
}
.jump-btn:hover { background: #fbbf24; color: #fff; }
.nf-loading { font-size: 11px; color: #8d96a4; padding: 6px; }

.nf-row {
  display: grid;
  grid-template-columns: 200px 1fr 100px 80px 80px 70px 90px;
  gap: 8px; align-items: center;
  padding: 6px 9px; border-radius: 6px;
  background: #fff; border: 1px solid #e4e8ef;
  margin-bottom: 3px; font-size: 11.5px;
  cursor: pointer;
}
.nf-row:hover { box-shadow: 0 2px 8px rgba(0,0,0,.04); border-color: #2f6ee5; }
.nf-row .nick-info { display: flex; align-items: center; gap: 7px; min-width: 0; }
.nf-row .nick-info .nm-block { min-width: 0; }
.nf-row .nick-info .nm {
  font-weight: 600; font-size: 11.5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.nf-row .nick-info .uid { font-size: 9.5px; color: #8d96a4; font-family: 'SF Mono', Menlo, monospace; }
.nf-row .alias-cell {
  font-size: 11.5px; color: #1a2433;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.nf-row .alias-cell.empty { color: #8d96a4; font-style: italic; font-size: 10.5px; }
.nf-row .msgs-cell { font-size: 10.5px; color: #5b6573; }
.nf-row .last-cell { font-size: 10.5px; color: #8d96a4; }
.nf-row .nf-actions { display: flex; gap: 2px; justify-content: flex-end; }
.nf-row .nf-actions button {
  width: 22px; height: 22px; border-radius: 4px;
  border: 1px solid #e4e8ef; background: #fff;
  color: #5b6573; font-size: 10px;
  cursor: pointer; font-family: inherit;
}
.nf-row .nf-actions button:hover { background: #2f6ee5; color: #fff; border-color: #2f6ee5; }
.nf-row .nf-actions .link-btn { border-color: #fbbf24; color: #92400e; }
.nf-row .nf-actions .link-btn:hover { background: #fbbf24; color: #fff; border-color: #fbbf24; }

.empty {
  padding: 50px; text-align: center; color: #8d96a4;
}
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
