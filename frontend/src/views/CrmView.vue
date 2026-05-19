<template>
  <div class="crm-page">
    <div class="page-grid">
      <div v-if="sidebarOpen && isNarrow" class="sidebar-backdrop" @click="sidebarOpen = false" />
      <div class="sidebar-wrap" :class="{ open: sidebarOpen }">
        <CrmSidebar
          :tab="state.tab.value"
          :sale-user-id="state.saleUserId.value"
          :zalo-nick-id="state.zaloNickId.value"
          :users="users"
          :zalo-accounts="zaloAccounts"
          :total-contacts="contactsTotal"
          :total-friends="totalFriends"
          :contacts-by-user="contactsByUser"
          :friends-by-nick="friendsByNick"
          @select-all="onSelectAll"
          @select-user="onSelectUser"
          @select-nick="onSelectNick"
        />
      </div>

      <main class="main">
        <!-- Page header + tab strip -->
        <header class="page-head">
          <div class="page-title-row">
            <button class="drawer-toggle" title="Bộ lọc" @click="sidebarOpen = !sidebarOpen">☰</button>
            <h1>🌐 CRM</h1>
            <span class="alpha-tag">NEW</span>
            <span class="info-banner">
              Tab <b>Khách hàng</b> = KH entity. Tab <b>Bạn bè Zalo</b> = cặp nick × UID/SĐT. Liên kết 2 chiều qua nút 🔗.
            </span>
          </div>
          <div class="tabs">
            <button
              v-for="t in TAB_DEFS"
              :key="t.value"
              class="tab"
              :class="{ active: state.tab.value === t.value }"
              @click="state.tab.value = t.value"
            >
              {{ t.icon }} {{ t.label }}
              <span class="num">{{ t.value === 'khachhang' ? contactsTotal : totalFriends }}</span>
            </button>
          </div>
        </header>

        <!-- Filter actions -->
        <div class="head-actions">
          <input
            v-model="searchInput"
            class="head-search"
            placeholder="🔍 Tìm theo tên / SĐT / UID / alias..."
            @input="debouncedSearch"
          />
          <button
            class="fchip"
            :class="{ on: !!careHotFilter }"
            @click="careHotFilter = careHotFilter ? '' : 'hot'"
          >🔥 Nóng <span v-if="careHotFilter" style="opacity:.5;margin-left:2px">✕</span></button>
          <span class="fchip">📅 Ngày ▾</span>
          <span class="fchip">🏷 Tag ▾</span>
          <span class="fchip">📍 Tỉnh ▾</span>

          <div class="spacer" />

          <CrmColumnManager
            :cols="state.currentCols.value"
            :defs="state.tab.value === 'khachhang' ? COLS_KH : COLS_BB"
            @update:cols="onUpdateCols"
            @reset="state.resetColsCurrentTab"
          />

          <button class="btn">⬇ Xuất</button>
          <button class="btn primary">+ Tạo</button>
        </div>

        <!-- Stats row -->
        <div class="stats">
          <div class="stat info">📋 Tổng: <strong>{{ state.tab.value === 'khachhang' ? contactsTotal : totalFriends }}</strong></div>
          <div class="stat good">✅ Có Zalo: <strong>{{ hasZaloCount }}</strong></div>
          <div class="stat warn">📥 Chưa có Zalo: <strong>{{ noZaloCount }}</strong></div>
          <div class="stat">⭐ Multi-nick: <strong>{{ multiNickCount }}</strong></div>
          <div class="spacer" />
          <span style="font-size:11px">Hiển thị:</span>
          <div class="density-toggle">
            <button
              v-for="d in DENSITY_OPTIONS"
              :key="d.value"
              :class="{ active: state.density.value === d.value }"
              @click="state.density.value = d.value"
            >{{ d.label }}</button>
          </div>
        </div>

        <!-- Bulk bar (chung 2 tab) -->
        <div v-if="selected.size > 0" class="bulk-bar">
          <span class="count">{{ selected.size }}</span>
          <span>đã chọn</span>
          <button>💬 Nhắn hàng loạt</button>
          <button>🏷 Gắn tag</button>
          <button>📅 Đổi trạng thái</button>
          <button>⬇ Xuất</button>
          <span class="clear" @click="selected = new Set()">✕ Bỏ chọn</span>
        </div>

        <!-- Tab content -->
        <CrmTabKhachHang
          v-if="state.tab.value === 'khachhang'"
          :contacts="contactsList"
          :cols="state.colsKH.value"
          :density="state.density.value"
          :loading="contactsLoading"
          :selected="selected"
          :expanded-ids="expandedIds"
          :friends-by-contact="friendsByContact"
          :loading-friends="loadingFriends"
          :users="users"
          @open-detail="onOpenDetail"
          @open-chat="onOpenChat"
          @jump-to-bb="onJumpToBB"
          @toggle-expand="onToggleExpand"
          @update:selected="selected = $event"
        />

        <CrmTabBanBeZalo
          v-else
          :friends="friendsList"
          :cols="state.colsBB.value"
          :density="state.density.value"
          :loading="friendsLoading"
          :selected="selected"
          @open-detail="onOpenDetailFromFriend"
          @open-chat="onOpenChatFromFriend"
          @jump-to-kh="onJumpToKH"
          @update:selected="selected = $event"
        />

        <!-- Pagination -->
        <div class="pag">
          <span>{{ pagFrom }}–{{ pagTo }} / {{ state.tab.value === 'khachhang' ? contactsTotal : totalFriends }}</span>
          <div class="spacer" />
          <span>Trang:</span>
          <button :disabled="pagination.page === 1" @click="goPage(pagination.page - 1)">«</button>
          <button class="primary">{{ pagination.page }}</button>
          <button :disabled="pagination.page >= totalPages" @click="goPage(pagination.page + 1)">»</button>
        </div>
      </main>
    </div>

    <!-- Detail panel -->
    <CrmContactDetailPanel
      :contact="detailContact"
      :friend-rows="detailFriends"
      @close="detailContact = null"
      @jump-bb="onJumpToBB"
      @open-chat="onOpenChat"
      @call="onCall"
      @open-profile="onOpenProfile"
    />

    <!-- Restore toast -->
    <div v-if="state.restoredFromStorage.value" class="toast" @click.self="state.dismissRestoreToast()">
      ✓ Đã khôi phục tab <b>{{ restoredTabLabel }}</b> + filter từ phiên trước.
      <a href="#" @click.prevent="onResetAll">Đặt lại</a>
      <button class="toast-close" @click="state.dismissRestoreToast()">✕</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useContacts, type Contact } from '@/composables/use-contacts';
import { useFriends, type DbFriend } from '@/composables/use-friends';
import { useUsers } from '@/composables/use-users';
import { useZaloAccounts } from '@/composables/use-zalo-accounts';
import { useCrmState, type CrmTab, type ColPref, type DensityMode } from '@/composables/use-crm-state';
import { COLS_KH, COLS_BB } from '@/constants/crm-columns';
import { api } from '@/api';

import CrmSidebar from '@/components/crm/CrmSidebar.vue';
import CrmColumnManager from '@/components/crm/CrmColumnManager.vue';
import CrmTabKhachHang from '@/components/crm/CrmTabKhachHang.vue';
import CrmTabBanBeZalo from '@/components/crm/CrmTabBanBeZalo.vue';
import CrmContactDetailPanel from '@/components/crm/CrmContactDetailPanel.vue';

const router = useRouter();
const state = useCrmState();

const TAB_DEFS: { value: CrmTab; label: string; icon: string }[] = [
  { value: 'khachhang', label: 'Khách hàng',    icon: '🧑' },
  { value: 'banbe',     label: 'Bạn bè Zalo',   icon: '🔗' },
];

const DENSITY_OPTIONS: { value: DensityMode; label: string }[] = [
  { value: 'compact',  label: 'Gọn' },
  { value: 'normal',   label: 'Vừa' },
  { value: 'detailed', label: 'Rộng' },
];

// ─── Composables ───
const { users, fetchUsers } = useUsers();
const { accounts: zaloAccounts, fetchAccounts } = useZaloAccounts();
const {
  contacts: contactsList,
  total: contactsTotal,
  loading: contactsLoading,
  filters: contactFilters,
  pagination: contactPagination,
  fetchContacts,
} = useContacts();
const {
  friendsDb: friendsList,
  friendsDbTotal: totalFriendsRef,
  loadingDb: friendsLoading,
  fetchFriendsDb,
} = useFriends();

// ─── UI state ───
const searchInput = ref('');
const careHotFilter = ref('');
const pagination = reactive({ page: 1, limit: 25 });
const selected = ref<Set<string>>(new Set());
const expandedIds = ref<Set<string>>(new Set());
const detailContact = ref<Contact | null>(null);
const detailFriends = ref<DbFriend[]>([]);
const sidebarOpen = ref(false);

// Friend rows per contact (lazy load khi expand)
const friendsByContact = ref<Record<string, DbFriend[]>>({});
const loadingFriends = ref<Record<string, boolean>>({});

// Mobile detection
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1440);
const isNarrow = computed(() => viewportWidth.value < 900);
function onResize() { viewportWidth.value = window.innerWidth; }

// ─── Stats (derived from current list) ───
const hasZaloCount = computed(() => {
  if (state.tab.value === 'khachhang') {
    return contactsList.value.filter(c => c.hasZalo === true).length;
  }
  return friendsList.value.length;
});
const noZaloCount = computed(() => {
  if (state.tab.value === 'khachhang') {
    return contactsList.value.filter(c => c.hasZalo !== true).length;
  }
  return 0;
});
const multiNickCount = computed(() => {
  if (state.tab.value === 'khachhang') {
    return contactsList.value.filter(c => {
      const total = (c.nicksByKind?.friend ?? 0) + (c.nicksByKind?.pending_friend ?? 0) + (c.nicksByKind?.chatting_stranger ?? 0);
      return total >= 2;
    }).length;
  }
  return 0;
});

// ─── Sidebar counts ───
// Backend chưa có endpoint aggregate count theo user/nick → tạm derive client-side từ list hiện tại.
// TODO: backend GET /crm/sidebar-counts để chính xác hơn khi paginate.
const contactsByUser = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {};
  for (const c of contactsList.value) {
    if (c.assignedUserId) m[c.assignedUserId] = (m[c.assignedUserId] || 0) + 1;
  }
  return m;
});

const friendsByNick = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {};
  for (const f of friendsList.value) {
    if (f.zaloAccountId) m[f.zaloAccountId] = (m[f.zaloAccountId] || 0) + 1;
  }
  return m;
});

const totalFriends = computed(() => totalFriendsRef.value);

// ─── Pagination derived ───
const totalPages = computed(() => {
  const total = state.tab.value === 'khachhang' ? contactsTotal.value : totalFriends.value;
  return Math.max(1, Math.ceil(total / pagination.limit));
});
const pagFrom = computed(() => {
  const total = state.tab.value === 'khachhang' ? contactsTotal.value : totalFriends.value;
  return total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
});
const pagTo = computed(() => {
  const total = state.tab.value === 'khachhang' ? contactsTotal.value : totalFriends.value;
  return Math.min(pagination.page * pagination.limit, total);
});

const restoredTabLabel = computed(() => state.tab.value === 'khachhang' ? 'Khách hàng' : 'Bạn bè Zalo');

// ─── Fetch wiring ───
let searchTimeout: ReturnType<typeof setTimeout>;
function debouncedSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => { pagination.page = 1; reloadData(); }, 300);
}

async function reloadData() {
  if (state.tab.value === 'khachhang') {
    contactFilters.search = searchInput.value;
    contactFilters.assignedUserId = state.saleUserId.value !== 'all' ? state.saleUserId.value : '';
    contactPagination.page = pagination.page;
    contactPagination.limit = pagination.limit;
    await fetchContacts();
  } else {
    if (state.zaloNickId.value) {
      await fetchFriendsDb(state.zaloNickId.value, {
        page: pagination.page,
        limit: pagination.limit,
        search: searchInput.value || undefined,
      });
    } else {
      // No specific nick — backend chưa hỗ trợ aggregate cross-nick, để rỗng
      // TODO: backend endpoint /crm/friends-all để aggregate
      friendsList.value = [];
      totalFriendsRef.value = 0;
    }
  }
}

function goPage(p: number) {
  pagination.page = p;
  reloadData();
}

// ─── Sidebar actions ───
function onSelectAll() {
  state.saleUserId.value = 'all';
  state.zaloNickId.value = null;
  pagination.page = 1;
  selected.value = new Set();
  reloadData();
}
function onSelectUser(userId: string) {
  state.saleUserId.value = userId;
  state.zaloNickId.value = null;
  pagination.page = 1;
  selected.value = new Set();
  reloadData();
}
function onSelectNick(nickId: string) {
  state.zaloNickId.value = nickId;
  state.saleUserId.value = 'all';
  pagination.page = 1;
  selected.value = new Set();
  reloadData();
}

// ─── Column update ───
function onUpdateCols(next: ColPref[]) {
  if (state.tab.value === 'khachhang') state.colsKH.value = next;
  else state.colsBB.value = next;
}

// ─── Row interactions ───
function onOpenDetail(c: Contact) {
  detailContact.value = c;
  detailFriends.value = friendsByContact.value[c.id] ?? [];
  // Lazy-load friend rows nếu chưa có
  if (!friendsByContact.value[c.id]) loadFriendsForContact(c.id);
}
function onOpenDetailFromFriend(f: DbFriend) {
  if (!f.contact) return;
  detailContact.value = f.contact as unknown as Contact;
  detailFriends.value = friendsList.value.filter(x => x.contactId === f.contactId);
}
function onOpenChat(c: Contact) {
  // Best-effort: nếu có friend đầu tiên có hasConversation → mở qua ensure-conversation
  const friends = friendsByContact.value[c.id] ?? [];
  const firstFriend = friends.find(f => f.hasConversation) ?? friends[0];
  if (firstFriend) jumpToChat(firstFriend);
  else if (c.id) router.push({ path: '/chat', query: { contactId: c.id } });
}
function onOpenChatFromFriend(f: DbFriend) { jumpToChat(f); }

async function jumpToChat(f: DbFriend) {
  try {
    const res = await api.post<{ conversationId: string }>(`/friends/${f.id}/ensure-conversation`, {});
    if (res.data?.conversationId) {
      router.push({ name: 'Chat', params: { convId: res.data.conversationId } });
      return;
    }
  } catch (err) {
    console.error('[CrmView] ensure-conversation failed:', err);
  }
  if (f.contact?.id) router.push({ path: '/chat', query: { contactId: f.contact.id } });
}

function onCall(c: Contact) {
  if (c.phone) window.location.href = `tel:${c.phone}`;
}
function onOpenProfile(c: Contact) {
  if (c.id) router.push(`/contacts/${c.id}/profile`);
}

// 2-way link
async function onJumpToBB(c: Contact) {
  state.tab.value = 'banbe';
  // Strategy: tự pick nick đầu tiên có friend của contact này
  if (!friendsByContact.value[c.id]) await loadFriendsForContact(c.id);
  const friends = friendsByContact.value[c.id] ?? [];
  const firstNickId = friends[0]?.zaloAccountId;
  if (firstNickId) {
    state.zaloNickId.value = firstNickId;
    state.saleUserId.value = 'all';
  }
  detailContact.value = null;
  pagination.page = 1;
  await reloadData();
}
function onJumpToKH(f: DbFriend) {
  state.tab.value = 'khachhang';
  state.saleUserId.value = 'all';
  state.zaloNickId.value = null;
  pagination.page = 1;
  searchInput.value = f.contact?.crmName || f.contact?.fullName || '';
  detailContact.value = null;
  reloadData().then(() => {
    if (f.contactId) {
      expandedIds.value = new Set([...expandedIds.value, f.contactId]);
      loadFriendsForContact(f.contactId);
    }
  });
}

// Expand toggle (lazy-load Friend rows)
async function onToggleExpand(id: string) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
    if (!friendsByContact.value[id]) await loadFriendsForContact(id);
  }
  expandedIds.value = next;
}

async function loadFriendsForContact(contactId: string) {
  loadingFriends.value[contactId] = true;
  try {
    // Backend trả { friendships } theo /contacts/:id/friendships
    const res = await api.get<{ friendships: DbFriend[] }>(`/contacts/${contactId}/friendships`);
    friendsByContact.value[contactId] = res.data?.friendships ?? [];
  } catch (err) {
    console.error('[CrmView] load friendships for contact failed:', err);
    friendsByContact.value[contactId] = [];
  } finally {
    loadingFriends.value[contactId] = false;
  }
}

function onResetAll() {
  state.reset();
  searchInput.value = '';
  careHotFilter.value = '';
  selected.value = new Set();
  expandedIds.value = new Set();
  pagination.page = 1;
  reloadData();
}

// ─── Watch state changes → refetch when needed ───
watch([() => state.tab.value, () => state.saleUserId.value, () => state.zaloNickId.value], () => {
  pagination.page = 1;
  selected.value = new Set();
  reloadData();
});

// ─── Lifecycle ───
onMounted(async () => {
  window.addEventListener('resize', onResize, { passive: true });
  onResize();

  await Promise.all([fetchUsers(), fetchAccounts()]);

  // Validate restored nick — fallback nếu không tồn tại
  if (state.zaloNickId.value) {
    const exists = zaloAccounts.value.some(z => z.id === state.zaloNickId.value);
    if (!exists) state.zaloNickId.value = null;
  }
  // Validate restored user
  if (state.saleUserId.value !== 'all') {
    const exists = users.value.some(u => u.id === state.saleUserId.value);
    if (!exists) state.saleUserId.value = 'all';
  }

  reloadData();

  if (state.restoredFromStorage.value) {
    setTimeout(() => state.dismissRestoreToast(), 5000);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
});
</script>

<style scoped>
.crm-page {
  height: calc(100vh - var(--smax-topnav-h, 52px));
  background: #f5f7fb;
  display: flex; flex-direction: column;
  overflow: hidden;
  width: 100%;
}

.page-grid {
  display: grid;
  grid-template-columns: 260px 1fr;
  flex: 1; min-height: 0;
  position: relative;
}

.sidebar-wrap { overflow: hidden; }
.sidebar-backdrop { display: none; }

.main {
  display: flex; flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.page-head {
  padding: 10px 16px 0;
  background: #fff;
  border-bottom: 1px solid #e4e8ef;
  flex-shrink: 0;
}
.page-title-row {
  display: flex; align-items: center; gap: 10px;
  flex-wrap: wrap; padding-bottom: 4px;
}
.page-title-row h1 { margin: 0; font-size: 17px; font-weight: 700; }
.alpha-tag {
  background: #fef3c7; color: #78350f;
  padding: 2px 8px; border-radius: 10px;
  font-size: 11px; font-weight: 700;
  border: 1px solid #fbbf24;
}
.info-banner { font-size: 11.5px; color: #5b6573; }
.info-banner b { color: #1a2433; }

.drawer-toggle {
  display: none;
  align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 6px;
  background: #fff; border: 1px solid #e4e8ef;
  color: #5b6573; cursor: pointer; font-size: 14px;
  flex-shrink: 0; font-family: inherit;
}

.tabs { display: flex; gap: 0; }
.tab {
  padding: 9px 16px;
  border: none; background: transparent;
  color: #5b6573; font-size: 13px; font-weight: 600;
  cursor: pointer; border-bottom: 2px solid transparent;
  font-family: inherit;
}
.tab:hover { color: #1a2433; }
.tab.active { color: #2f6ee5; border-bottom-color: #2f6ee5; }
.tab .num {
  background: #f9fafc; color: #5b6573;
  padding: 1px 7px; border-radius: 9px;
  font-size: 10px; margin-left: 4px;
}
.tab.active .num { background: #e8f0fe; color: #2f6ee5; }

.head-actions {
  padding: 8px 16px; background: #fff;
  border-bottom: 1px solid #e4e8ef;
  display: flex; align-items: center; gap: 6px;
  flex-wrap: wrap; flex-shrink: 0;
}
.head-search {
  flex: 1; min-width: 200px; max-width: 300px;
  padding: 6px 10px;
  border: 1px solid #cdd4df; border-radius: 7px;
  font-size: 12.5px; font-family: inherit; box-sizing: border-box;
}
.head-search:focus { outline: none; border-color: #2f6ee5; box-shadow: 0 0 0 3px #e8f0fe; }

.fchip {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 4px 9px; border-radius: 13px;
  border: 1px solid #e4e8ef; background: #fff;
  font-size: 11.5px; cursor: pointer; color: #5b6573;
  white-space: nowrap; font-family: inherit;
}
.fchip:hover { background: #f9fafc; }
.fchip.on { background: #2f6ee5; color: #fff; border-color: #2f6ee5; font-weight: 600; }

.btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: 6px;
  border: 1px solid #cdd4df; background: #fff;
  color: #1a2433; font-weight: 600; font-size: 12px;
  cursor: pointer; font-family: inherit; white-space: nowrap;
}
.btn:hover { background: #f9fafc; }
.btn.primary { background: #2f6ee5; color: #fff; border-color: #2f6ee5; }
.btn.primary:hover { background: #2356b8; }

.spacer { flex: 1; min-width: 6px; }

.stats {
  padding: 6px 16px; background: #f9fafc;
  border-bottom: 1px solid #e4e8ef;
  display: flex; gap: 14px; align-items: center;
  font-size: 11.5px; color: #5b6573;
  flex-wrap: wrap; flex-shrink: 0;
}
.stat strong { color: #1a2433; }
.stat.good strong { color: #16a34a; }
.stat.warn strong { color: #d97706; }
.stat.info strong { color: #2f6ee5; }
.density-toggle {
  display: inline-flex; background: #fff;
  border: 1px solid #e4e8ef; border-radius: 6px; padding: 1px;
}
.density-toggle button {
  padding: 3px 8px; background: transparent; border: none;
  border-radius: 4px; font-size: 11px; color: #5b6573;
  cursor: pointer; font-family: inherit;
}
.density-toggle button.active { background: #2f6ee5; color: #fff; font-weight: 600; }

.bulk-bar {
  padding: 7px 16px; background: #2f6ee5; color: #fff;
  display: flex; align-items: center; gap: 10px;
  font-size: 12.5px; flex-shrink: 0;
  animation: slideDown .15s ease;
}
@keyframes slideDown { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.bulk-bar .count { font-weight: 700; }
.bulk-bar button {
  background: rgba(255,255,255,.12);
  border: 1px solid rgba(255,255,255,.2);
  color: #fff; padding: 3px 9px;
  border-radius: 5px; font-size: 11.5px;
  cursor: pointer; font-family: inherit;
}
.bulk-bar button:hover { background: rgba(255,255,255,.2); }
.bulk-bar .clear { margin-left: auto; cursor: pointer; opacity: .8; }

.pag {
  padding: 6px 16px; background: #fff;
  border-top: 1px solid #e4e8ef;
  display: flex; align-items: center; gap: 6px;
  font-size: 11.5px; color: #5b6573; flex-shrink: 0;
}
.pag button {
  padding: 3px 9px; border: 1px solid #e4e8ef;
  background: #fff; border-radius: 5px;
  cursor: pointer; font-size: 11.5px; font-family: inherit;
}
.pag button.primary { background: #2f6ee5; color: #fff; border-color: #2f6ee5; }
.pag button:disabled { opacity: .4; cursor: not-allowed; }

.toast {
  position: fixed; bottom: 18px; right: 18px;
  background: #1a2433; color: #fff;
  padding: 9px 14px; border-radius: 8px;
  font-size: 11.5px; max-width: 360px;
  box-shadow: 0 4px 20px rgba(0,0,0,.25);
  z-index: 60;
  display: flex; gap: 8px; align-items: center;
  animation: slideUp .25s;
}
.toast a { color: #93c5fd; text-decoration: none; margin-left: 4px; }
.toast-close {
  background: transparent; border: none; color: #fff;
  opacity: .6; cursor: pointer; margin-left: 4px;
  font-family: inherit; font-size: 12px;
}
@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

/* RESPONSIVE */
@media (max-width: 1200px) {
  .page-grid { grid-template-columns: 220px 1fr; }
  .head-search { max-width: 240px; }
}
@media (max-width: 900px) {
  .page-grid { grid-template-columns: 1fr; }
  .sidebar-wrap {
    position: absolute; top: 0; left: 0; bottom: 0;
    width: 280px; max-width: 86vw;
    background: #fff; z-index: 25;
    transform: translateX(-100%);
    transition: transform .25s;
    box-shadow: 4px 0 16px rgba(0,0,0,.08);
  }
  .sidebar-wrap.open { transform: translateX(0); }
  .sidebar-backdrop {
    display: block; position: absolute; inset: 0;
    background: rgba(15,20,25,.32); z-index: 20;
  }
  .drawer-toggle { display: inline-flex; }
  .page-title-row h1 { font-size: 15px; }
  .info-banner { display: none; }
}
@media (max-width: 600px) {
  .stats .stat:nth-child(n+5) { display: none; }
  .head-search { max-width: none; flex: 1 1 180px; }
}
</style>
