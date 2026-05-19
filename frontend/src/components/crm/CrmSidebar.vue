<template>
  <aside class="crm-sidebar">
    <div class="head">
      <div class="context-label">
        <span>{{ contextTitle }}</span>
        <span class="total">{{ contextTotal }}</span>
      </div>
      <input v-model="search" class="search" :placeholder="contextSearchPlaceholder" />
    </div>

    <div class="list">
      <div
        class="all-row"
        :class="{ active: saleUserId === 'all' && !zaloNickId }"
        @click="selectAll"
      >
        <div class="av">∑</div>
        <div>
          Tất cả
          <div class="sub">{{ allRowSub }}</div>
        </div>
        <span class="count">{{ tab === 'khachhang' ? totalContacts : totalFriends }}</span>
      </div>

      <!-- Tab 1: list sale users -->
      <template v-if="tab === 'khachhang'">
        <div
          v-for="u in filteredUsers"
          :key="u.id"
          class="user-pill"
          :class="{ active: saleUserId === u.id }"
          @click="selectUser(u.id)"
        >
          <div class="av" :class="avatarClass(u.id)">{{ initials(u.fullName) }}</div>
          <div class="info">
            <div class="name">{{ u.fullName }}</div>
            <div class="role">{{ roleLabel(u.role) }}</div>
          </div>
          <span class="count">{{ contactsByUser[u.id] ?? 0 }}</span>
        </div>
        <div v-if="!filteredUsers.length" class="empty-list">Không tìm thấy sale "{{ search }}"</div>
      </template>

      <!-- Tab 2: zalo nicks grouped by user -->
      <template v-else>
        <div v-for="u in filteredUsers" :key="u.id" class="sale-group">
          <div
            class="sale-group-head"
            :class="{ open: openedGroups.has(u.id) }"
            @click="toggleGroup(u.id)"
          >
            <span class="chev">▶</span>
            <div class="av" :class="avatarClass(u.id)">{{ initials(u.fullName) }}</div>
            <div>
              <div class="user-name">{{ u.fullName }}</div>
              <div class="nicks-count">{{ nicksByUser(u.id).length }} nick · {{ totalFriendsByUser(u.id) }} bạn</div>
            </div>
          </div>
          <div
            class="sale-group-body"
            :class="{ open: openedGroups.has(u.id) }"
          >
            <div
              v-for="n in nicksByUser(u.id)"
              :key="n.id"
              class="nick-zalo-row"
              :class="{ active: zaloNickId === n.id }"
              @click.stop="selectNick(n.id)"
            >
              <div class="nick-av" :class="[nickAvatarClass(n.id), { offline: !isOnline(n) }]">
                {{ initials(n.displayName) }}
              </div>
              <div class="nm">{{ n.displayName || 'Nick' }}</div>
              <span class="count">{{ friendsByNick[n.id] ?? 0 }}</span>
            </div>
            <div v-if="!nicksByUser(u.id).length" class="empty-list" style="font-size:11px;padding:6px 10px">
              Chưa có nick Zalo
            </div>
          </div>
        </div>
        <div v-if="!filteredUsers.length" class="empty-list">Không tìm thấy "{{ search }}"</div>
      </template>
    </div>

    <div class="footer">
      <span class="dot" />
      <span>{{ footerText }}</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { OrgUser } from '@/composables/use-users';
import type { ZaloAccount } from '@/composables/use-zalo-accounts';
import type { CrmTab } from '@/composables/use-crm-state';

const props = defineProps<{
  tab: CrmTab;
  saleUserId: string;
  zaloNickId: string | null;
  users: OrgUser[];
  zaloAccounts: ZaloAccount[];
  totalContacts: number;
  totalFriends: number;
  contactsByUser: Record<string, number>;
  friendsByNick: Record<string, number>;
}>();

const emit = defineEmits<{
  (e: 'select-all'): void;
  (e: 'select-user', userId: string): void;
  (e: 'select-nick', nickId: string): void;
}>();

const search = ref('');
const openedGroups = ref<Set<string>>(new Set(props.users.map(u => u.id)));

const contextTitle = computed(() =>
  props.tab === 'khachhang' ? 'SALE CỦA HỆ THỐNG CRM' : 'NICK ZALO NHÓM THEO SALE',
);
const contextTotal = computed(() =>
  props.tab === 'khachhang' ? props.users.length : props.zaloAccounts.length,
);
const contextSearchPlaceholder = computed(() =>
  props.tab === 'khachhang' ? '🔍 Tìm sale...' : '🔍 Tìm sale hoặc nick...',
);
const allRowSub = computed(() =>
  props.tab === 'khachhang'
    ? `${props.users.length} sale CRM`
    : `${props.zaloAccounts.length} nick · ${props.users.length} sale`,
);

const footerText = computed(() => {
  if (props.tab === 'khachhang') {
    const active = props.users.filter(u => u.isActive).length;
    return `${active}/${props.users.length} sale active`;
  }
  const online = props.zaloAccounts.filter(isOnline).length;
  return `${online}/${props.zaloAccounts.length} nick online · Auto-sync`;
});

const filteredUsers = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return props.users;
  return props.users.filter(u => {
    if (u.fullName?.toLowerCase().includes(q)) return true;
    if (u.email?.toLowerCase().includes(q)) return true;
    // For tab 2, also match nick display names within this user's group
    if (props.tab === 'banbe') {
      const nicks = props.zaloAccounts.filter(z => z.ownerUserId === u.id);
      return nicks.some(n => n.displayName?.toLowerCase().includes(q));
    }
    return false;
  });
});

function nicksByUser(userId: string): ZaloAccount[] {
  return props.zaloAccounts.filter(z => z.ownerUserId === userId);
}
function totalFriendsByUser(userId: string): number {
  return nicksByUser(userId).reduce((sum, n) => sum + (props.friendsByNick[n.id] ?? 0), 0);
}
function isOnline(acc: ZaloAccount): boolean {
  return acc.liveStatus === 'online' || acc.status === 'connected';
}

function toggleGroup(userId: string) {
  const next = new Set(openedGroups.value);
  if (next.has(userId)) next.delete(userId); else next.add(userId);
  openedGroups.value = next;
}

function selectAll() { emit('select-all'); }
function selectUser(userId: string) { emit('select-user', userId); }
function selectNick(nickId: string) { emit('select-nick', nickId); }

function initials(name?: string | null): string {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[p.length - 2][0] + p[p.length - 1][0]).toUpperCase();
}

const PALETTE = ['av-c1', 'av-c2', 'av-c3', 'av-c4', 'av-c5', 'av-c6', 'av-c7'];
function hashClass(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function avatarClass(userId: string): string { return hashClass(userId); }
function nickAvatarClass(nickId: string): string {
  // Nick lấy màu theo owner để đồng nhất với group head
  const nick = props.zaloAccounts.find(n => n.id === nickId);
  return nick?.ownerUserId ? hashClass(nick.ownerUserId) : 'av-c1';
}

function roleLabel(role: string): string {
  if (role === 'owner') return '👑 owner';
  if (role === 'admin') return '🛡 admin';
  if (role === 'manager') return '🛡 manager';
  return '👤 member';
}
</script>

<style scoped>
.crm-sidebar {
  background: #fff;
  border-right: 1px solid #e4e8ef;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}
.head { padding: 12px 14px 10px; border-bottom: 1px solid #e4e8ef; }
.context-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: .04em;
  color: #8d96a4; font-weight: 700; margin-bottom: 6px;
  display: flex; justify-content: space-between; align-items: center;
}
.context-label .total {
  background: #e8f0fe; color: #2f6ee5;
  padding: 1px 7px; border-radius: 9px; font-size: 10px;
}
.search {
  width: 100%; padding: 6px 10px;
  border: 1px solid #e4e8ef; border-radius: 6px;
  font-size: 12px; background: #f9fafc;
  font-family: inherit; box-sizing: border-box;
}
.search:focus { outline: none; background: #fff; border-color: #2f6ee5; }

.list { padding: 6px 8px; overflow-y: auto; flex: 1; }
.all-row {
  display: grid; grid-template-columns: 28px 1fr auto;
  gap: 8px; align-items: center;
  padding: 8px 10px; border-radius: 8px;
  cursor: pointer; border: 1px dashed #cdd4df;
  margin-bottom: 8px; font-weight: 600; color: #5b6573;
}
.all-row.active { background: #2f6ee5; color: #fff; border-color: #2f6ee5; border-style: solid; }
.all-row .av {
  background: linear-gradient(135deg, #94a3b8, #64748b);
  border-radius: 6px; width: 24px; height: 24px;
  color: #fff; display: grid; place-items: center; font-size: 11px;
}
.all-row.active .av { background: rgba(255,255,255,.18); }
.all-row .sub { font-size: 10px; opacity: .7; font-weight: 400; }
.all-row .count { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 9px; background: #f9fafc; color: #5b6573; }
.all-row.active .count { background: rgba(255,255,255,.2); color: #fff; }

.user-pill {
  display: grid; grid-template-columns: 28px 1fr auto;
  gap: 8px; align-items: center;
  padding: 7px 10px; border-radius: 8px;
  cursor: pointer; border: 1px solid transparent;
  margin-bottom: 2px;
}
.user-pill:hover { background: #f9fafc; }
.user-pill.active { background: #e8f0fe; border-color: #2f6ee5; }
.user-pill .av {
  width: 28px; height: 28px; border-radius: 50%;
  color: #fff; display: grid; place-items: center;
  font-weight: 700; font-size: 10px;
}
.user-pill .info { min-width: 0; }
.user-pill .name {
  font-weight: 600; font-size: 12.5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.user-pill .role { font-size: 10px; color: #8d96a4; }
.user-pill .count {
  font-size: 11px; font-weight: 700;
  background: #f9fafc; color: #5b6573;
  padding: 2px 7px; border-radius: 9px;
}
.user-pill.active .count { background: #2f6ee5; color: #fff; }

.sale-group { margin-bottom: 4px; }
.sale-group-head {
  display: grid; grid-template-columns: 22px 28px 1fr;
  gap: 6px; align-items: center;
  padding: 6px 8px; border-radius: 7px;
  cursor: pointer; font-weight: 600; font-size: 12px;
}
.sale-group-head:hover { background: #f9fafc; }
.sale-group-head .chev {
  font-size: 10px; color: #8d96a4;
  transition: transform .15s;
}
.sale-group-head.open .chev { transform: rotate(90deg); }
.sale-group-head .av {
  width: 24px; height: 24px; border-radius: 50%;
  color: #fff; display: grid; place-items: center;
  font-size: 9px; font-weight: 700;
}
.sale-group-head .user-name { font-weight: 600; }
.sale-group-head .nicks-count { font-size: 10px; color: #8d96a4; font-weight: 500; }

.sale-group-body {
  display: none;
  padding-left: 24px;
  border-left: 2px solid #e4e8ef;
  margin-left: 14px;
}
.sale-group-body.open { display: block; }

.nick-zalo-row {
  display: grid; grid-template-columns: 24px 1fr auto;
  gap: 6px; align-items: center;
  padding: 5px 8px; border-radius: 6px;
  cursor: pointer; font-size: 12px;
  border: 1px solid transparent; margin-bottom: 1px;
}
.nick-zalo-row:hover { background: #f9fafc; }
.nick-zalo-row.active { background: #e8f0fe; border-color: #2f6ee5; }
.nick-zalo-row .nick-av {
  width: 24px; height: 24px; border-radius: 50%;
  color: #fff; display: grid; place-items: center;
  font-size: 9px; font-weight: 700; position: relative;
}
.nick-zalo-row .nick-av::after {
  content: ""; position: absolute; bottom: -1px; right: -1px;
  width: 8px; height: 8px; border-radius: 50%;
  background: #16a34a; border: 2px solid #fff;
}
.nick-zalo-row .nick-av.offline::after { background: #9ca3af; }
.nick-zalo-row .nm {
  font-weight: 600; font-size: 11.5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.nick-zalo-row .count {
  font-size: 10px; font-weight: 600;
  background: #f9fafc; color: #5b6573;
  padding: 1px 6px; border-radius: 8px;
}
.nick-zalo-row.active .count { background: #2f6ee5; color: #fff; }

.empty-list {
  font-size: 12px; color: #8d96a4;
  padding: 12px; text-align: center;
}

.footer {
  padding: 10px 14px; border-top: 1px solid #e4e8ef;
  font-size: 11px; color: #8d96a4;
  display: flex; align-items: center; gap: 6px; margin-top: auto;
}
.footer .dot { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; }

.av-c1 { background: linear-gradient(135deg, #2f6ee5, #1d4ed8); }
.av-c2 { background: linear-gradient(135deg, #16a34a, #15803d); }
.av-c3 { background: linear-gradient(135deg, #d97706, #b45309); }
.av-c4 { background: linear-gradient(135deg, #7c3aed, #6d28d9); }
.av-c5 { background: linear-gradient(135deg, #db2777, #be185d); }
.av-c6 { background: linear-gradient(135deg, #0891b2, #0e7490); }
.av-c7 { background: linear-gradient(135deg, #ea580c, #c2410c); }
</style>
