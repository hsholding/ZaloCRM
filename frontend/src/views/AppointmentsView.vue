<template>
  <div class="apt-page">
    <!-- Page header -->
    <header class="apt-header">
      <button class="icon-btn drawer-toggle" title="Mở bộ lọc" @click="sidebarOpen = !sidebarOpen">☰</button>
      <div class="title-block">
        <h1>📅 Lịch hẹn</h1>
        <span class="meta">{{ totalLabel }} · {{ weekLabel }}</span>
      </div>

      <div class="header-actions">
        <div class="viewtoggle">
          <button
            v-for="v in viewOptions"
            :key="v.value"
            :class="{ active: viewMode === v.value }"
            :disabled="v.value === 'week' && isNarrow"
            :title="v.value === 'week' && isNarrow ? 'View tuần chỉ hỗ trợ màn ≥ 900px' : ''"
            @click="viewMode = v.value"
          >{{ v.label }}</button>
        </div>

        <div class="datenav" :class="{ hidden: viewMode !== 'week' }">
          <button class="icon-btn" @click="shiftWeek(-1)">‹</button>
          <span class="label">{{ weekRangeLabel }}</span>
          <button class="icon-btn" @click="shiftWeek(1)">›</button>
          <button class="btn outline" @click="goToToday">Hôm nay</button>
        </div>

        <button class="btn primary" @click="openQuickCreate(null)">
          <span class="btn-icon">＋</span>
          <span class="btn-label">Tạo lịch hẹn</span>
        </button>
      </div>
    </header>

    <!-- Active filter chips -->
    <div class="apt-subheader">
      <span class="lbl">Đang lọc:</span>
      <span class="chip active">
        <span class="dot" :style="{ background: saleColor(currentUserId).bg }" />
        {{ scopeLabel }}
        <span v-if="scope !== 'me'" class="chip-info">({{ visibleAppointments.length }} lịch)</span>
      </span>
      <span v-if="source !== 'all'" class="chip" @click="source = 'all'">
        Nguồn: {{ source === 'zalo' ? 'Zalo' : 'Thủ công' }} <span class="x">✕</span>
      </span>
      <span v-if="selectedStatuses.size < APPOINTMENT_STATUS_OPTIONS.length" class="chip">
        Trạng thái: {{ selectedStatuses.size }}/{{ APPOINTMENT_STATUS_OPTIONS.length }}
      </span>
      <span v-if="selectedTypes.size < APPOINTMENT_TYPE_OPTIONS.length" class="chip">
        Loại: {{ selectedTypes.size }}/{{ APPOINTMENT_TYPE_OPTIONS.length }}
      </span>
      <div class="spacer" />
      <span class="kb-hint"><kbd>N</kbd> tạo nhanh · <kbd>→</kbd> tuần sau · <kbd>Esc</kbd> đóng</span>
    </div>

    <!-- Body: sidebar + content -->
    <div class="apt-body">
      <div v-if="sidebarOpen && isNarrow" class="sidebar-backdrop" @click="sidebarOpen = false" />
      <div class="sidebar-wrap" :class="{ open: sidebarOpen }">
      <AppointmentsSidebar
        :scope="scope"
        :selected-sales="selectedSales"
        :selected-statuses="selectedStatuses"
        :selected-types="selectedTypes"
        :source="source"
        :users="users"
        :current-user-id="currentUserId"
        :appointments="scopedAppointments"
        :visible-month="visibleMonth"
        :selected-date="selectedDate"
        @update:scope="onScopeChange"
        @update:selected-sales="selectedSales = $event"
        @update:selected-statuses="selectedStatuses = $event"
        @update:selected-types="selectedTypes = $event"
        @update:source="source = $event"
        @update:visible-month="visibleMonth = $event"
        @select-date="onSelectDate"
        @select-appointment="onSelectAppointment"
      />
      </div>

      <main class="apt-content">
        <AppointmentsWeekView
          v-if="viewMode === 'week'"
          :week-start="weekStart"
          :appointments="visibleAppointments"
          @select-appointment="onSelectAppointment"
          @create-slot="onCreateSlot"
        />
        <AppointmentsListView
          v-else
          :appointments="visibleAppointments"
          @select-appointment="onSelectAppointment"
          @create="openQuickCreate(null)"
          @mark-complete="onMarkComplete"
          @open-chat="onOpenChat"
        />
      </main>
    </div>

    <!-- Detail panel -->
    <AppointmentDetailPanel
      :appointment="selectedAppointment"
      @close="selectedAppointment = null"
      @complete="onMarkComplete"
      @cancel="onCancel"
      @no-show="onNoShow"
      @reschedule="onReschedule"
      @open-chat="onOpenChat"
      @open-contact="onOpenContact"
    />

    <!-- Quick create modal -->
    <AppointmentQuickCreate
      v-model="quickCreateOpen"
      :default-date="quickCreateDate"
      :prefill-contact="quickCreatePrefillContact"
      @created="onAppointmentCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAppointments } from '@/composables/use-appointments';
import { useUsers } from '@/composables/use-users';
import {
  APPOINTMENT_STATUS_OPTIONS,
  APPOINTMENT_TYPE_OPTIONS,
  saleColor,
  appointmentOwnerId,
  appointmentStart,
  type AppointmentEx as Appointment,
} from '@/composables/appointment-helpers';
import AppointmentsSidebar from '@/components/appointments/AppointmentsSidebar.vue';
import AppointmentsWeekView from '@/components/appointments/AppointmentsWeekView.vue';
import AppointmentsListView from '@/components/appointments/AppointmentsListView.vue';
import AppointmentDetailPanel from '@/components/appointments/AppointmentDetailPanel.vue';
import AppointmentQuickCreate from '@/components/appointments/AppointmentQuickCreate.vue';

const router = useRouter();
const authStore = useAuthStore();
const currentUserId = computed<string | null>(() => authStore.user?.id ?? null);

const {
  appointments,
  filters,
  fetchAppointments,
  markComplete,
  cancelAppointment,
  markNoShow,
} = useAppointments();
const { users, fetchUsers } = useUsers();

// View state
type ViewMode = 'week' | 'list';
const viewMode = ref<ViewMode>('week');
const viewOptions: { value: ViewMode; label: string }[] = [
  { value: 'week', label: 'Tuần' },
  { value: 'list', label: 'Danh sách' },
];

// Responsive: track viewport width — narrow under 900px, force list view & drawer-style sidebar
const viewportWidth = ref<number>(typeof window !== 'undefined' ? window.innerWidth : 1440);
const isNarrow = computed(() => viewportWidth.value < 900);
const sidebarOpen = ref(false);

function onResize() { viewportWidth.value = window.innerWidth; }

// When viewport becomes narrow while user is on week view, switch to list automatically
watch(isNarrow, (narrow) => {
  if (narrow && viewMode.value === 'week') viewMode.value = 'list';
  if (!narrow) sidebarOpen.value = false; // reset drawer when back to desktop
});

// Date navigation
const today = new Date(); today.setHours(0, 0, 0, 0);
const selectedDate = ref<Date>(new Date(today));
const visibleMonth = ref<Date>(new Date(today.getFullYear(), today.getMonth(), 1));

const weekStart = computed(() => {
  const d = new Date(selectedDate.value);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - offset);
  return d;
});
const weekEnd = computed(() => {
  const d = new Date(weekStart.value);
  d.setDate(d.getDate() + 7);
  return d;
});

// Filters
type Scope = 'me' | 'team' | 'all';
const scope = ref<Scope>('me');
const selectedSales = ref<Set<string>>(new Set());
const selectedStatuses = ref<Set<string>>(new Set(['scheduled', 'overdue']));
const selectedTypes = ref<Set<string>>(new Set(APPOINTMENT_TYPE_OPTIONS.map(o => o.value)));
const source = ref<'all' | 'manual' | 'zalo'>('all');

// Quick create
const quickCreateOpen = ref(false);
const quickCreateDate = ref<Date | null>(null);
const quickCreatePrefillContact = ref<{ id: string; fullName: string | null; phone: string | null; zaloUid?: string | null } | null>(null);

// Detail panel
const selectedAppointment = ref<Appointment | null>(null);

// Re-fetch when scope or date range changes
async function reloadAppointments() {
  const from = weekStart.value;
  const to = new Date(weekEnd.value); to.setDate(to.getDate() + 7); // pad 1 week ahead
  filters.from = from.toISOString();
  filters.to = to.toISOString();
  filters.source = source.value;
  await fetchAppointments();
}

watch([weekStart, source], () => { reloadAppointments(); }, { immediate: false });

// Initialize selectedSales when users + scope change
watch([users, scope, currentUserId], () => {
  if (scope.value === 'me' && currentUserId.value) {
    selectedSales.value = new Set([currentUserId.value]);
  } else if (scope.value === 'team' || scope.value === 'all') {
    selectedSales.value = new Set(users.value.map(u => u.id));
  }
});

function onScopeChange(s: Scope) {
  scope.value = s;
}

// Derived: scope filter
const scopedAppointments = computed<Appointment[]>(() => {
  if (scope.value === 'me') {
    return (appointments.value as Appointment[]).filter(a => {
      const owner = appointmentOwnerId(a);
      return !owner || owner === currentUserId.value;
    });
  }
  if (scope.value === 'team' || scope.value === 'all') {
    if (selectedSales.value.size === 0) return [];
    return (appointments.value as Appointment[]).filter(a => {
      const owner = appointmentOwnerId(a);
      return !owner || selectedSales.value.has(owner);
    });
  }
  return appointments.value as Appointment[];
});

// Apply remaining filters: status, type, source
const visibleAppointments = computed<Appointment[]>(() => {
  return scopedAppointments.value.filter(a => {
    if (!selectedStatuses.value.has(a.status)) return false;
    if (!selectedTypes.value.has(a.type)) return false;
    if (source.value !== 'all' && a.source !== source.value) return false;
    // restrict to current week for week view
    if (viewMode.value === 'week') {
      const s = appointmentStart(a).getTime();
      return s >= weekStart.value.getTime() && s < weekEnd.value.getTime();
    }
    return true;
  });
});

// Labels
const VN_MONTHS_SHORT = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const weekRangeLabel = computed(() => {
  const s = weekStart.value;
  const e = new Date(weekStart.value); e.setDate(e.getDate() + 6);
  return `${String(s.getDate()).padStart(2, '0')}/${VN_MONTHS_SHORT[s.getMonth()]} – ${String(e.getDate()).padStart(2, '0')}/${VN_MONTHS_SHORT[e.getMonth()]}/${e.getFullYear()}`;
});
const weekLabel = computed(() => `Tuần ${weekRangeLabel.value}`);
const totalLabel = computed(() => `${visibleAppointments.value.length} lịch`);
const scopeLabel = computed(() => {
  if (scope.value === 'me') return 'Sale: Của tôi';
  if (scope.value === 'team') return `Sale: Nhóm (${selectedSales.value.size})`;
  return `Sale: Tất cả (${selectedSales.value.size})`;
});

// Navigation actions
function shiftWeek(delta: number) {
  const d = new Date(selectedDate.value);
  d.setDate(d.getDate() + delta * 7);
  selectedDate.value = d;
}
function goToToday() {
  selectedDate.value = new Date(today);
}
function onSelectDate(d: Date) {
  selectedDate.value = d;
  if (viewMode.value === 'list') viewMode.value = 'week';
}

// Event handlers
function onSelectAppointment(a: Appointment) {
  selectedAppointment.value = a;
}
function onCreateSlot(payload: { date: Date }) {
  openQuickCreate(payload.date);
}
function openQuickCreate(date: Date | null) {
  quickCreateDate.value = date;
  quickCreatePrefillContact.value = null;
  quickCreateOpen.value = true;
}
async function onAppointmentCreated() {
  await reloadAppointments();
}

async function onMarkComplete(a: Appointment) {
  await markComplete(a.id);
  selectedAppointment.value = null;
  await reloadAppointments();
}
async function onCancel(a: Appointment) {
  await cancelAppointment(a.id);
  selectedAppointment.value = null;
  await reloadAppointments();
}
async function onNoShow(a: Appointment) {
  await markNoShow(a.id);
  selectedAppointment.value = null;
  await reloadAppointments();
}
function onReschedule(a: Appointment) {
  // Placeholder: pre-fill quick create with same contact
  selectedAppointment.value = null;
  quickCreateDate.value = appointmentStart(a);
  quickCreatePrefillContact.value = a.contact
    ? {
        id: a.contact.id,
        fullName: a.contact.fullName,
        phone: a.contact.phone,
        zaloUid: a.contact.zaloUid ?? null,
      }
    : null;
  quickCreateOpen.value = true;
}
function onOpenChat(a: Appointment) {
  if (a.source === 'zalo' && a.conversationId) {
    router.push(`/chat/${a.conversationId}`);
  }
}
function onOpenContact(a: Appointment) {
  if (a.contact?.id) router.push(`/contacts/${a.contact.id}`);
}

// Keyboard shortcuts
function onKey(e: KeyboardEvent) {
  const tgt = e.target as HTMLElement | null;
  if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable)) return;
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openQuickCreate(null); }
  else if (e.key === 'ArrowRight') { shiftWeek(1); }
  else if (e.key === 'ArrowLeft') { shiftWeek(-1); }
  else if (e.key === 't' || e.key === 'T') { goToToday(); }
  else if (e.key === 'Escape') { selectedAppointment.value = null; }
}

onMounted(() => {
  fetchUsers();
  reloadAppointments();
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize, { passive: true });
  onResize();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', onResize);
});
</script>

<style scoped>
.apt-page {
  display: flex; flex-direction: column;
  height: calc(100vh - var(--smax-topnav-h, 52px));
  width: 100%;
  background: #f5f7fb;
  overflow: hidden;
}

.apt-header {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e4e8ef;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.drawer-toggle { display: none; }

.title-block { display: flex; align-items: baseline; gap: 12px; flex: 1; min-width: 0; }
.title-block h1 { margin: 0; font-size: 20px; font-weight: 700; color: #1a2433; white-space: nowrap; }
.title-block .meta { color: #8d96a4; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.viewtoggle {
  display: inline-flex; background: #f5f7fb;
  border: 1px solid #e4e8ef; border-radius: 8px; padding: 2px;
}
.viewtoggle button {
  padding: 6px 14px; background: transparent; border: none;
  color: #5b6573; font-weight: 600; font-size: 12px; border-radius: 6px;
  cursor: pointer;
}
.viewtoggle button.active { background: #fff; color: #1a2433; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
.viewtoggle button:disabled { opacity: .35; cursor: not-allowed; }

.datenav { display: inline-flex; align-items: center; gap: 4px; }
.datenav.hidden { display: none; }
.datenav .label { font-weight: 700; font-size: 13px; padding: 0 8px; min-width: 160px; text-align: center; }
.icon-btn {
  width: 32px; height: 32px; border-radius: 8px;
  background: #fff; border: 1px solid #e4e8ef;
  color: #5b6573; cursor: pointer; font-size: 14px;
}
.icon-btn:hover { background: #f5f7fb; }
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 8px; border: 1px solid #cdd4df;
  background: #fff; color: #1a2433; font-weight: 600; font-size: 13px;
  cursor: pointer;
}
.btn:hover { background: #f5f7fb; }
.btn.outline { background: #fff; }
.btn.primary { background: #2f6ee5; color: #fff; border-color: #2f6ee5; }
.btn.primary:hover { background: #2356b8; }
.btn-icon { display: inline-block; }

.apt-subheader {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 20px;
  background: #fff;
  border-bottom: 1px solid #e4e8ef;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.apt-subheader .lbl { font-size: 12px; color: #8d96a4; font-weight: 600; }
.apt-subheader .spacer { flex: 1; }
.apt-subheader .kb-hint { font-size: 11px; color: #8d96a4; }
.apt-subheader .kb-hint kbd {
  background: #f5f7fb; padding: 1px 6px; border-radius: 4px;
  font-size: 10px; border: 1px solid #e4e8ef;
}

.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 14px;
  background: #f5f7fb; border: 1px solid #e4e8ef;
  font-size: 12px; cursor: pointer;
}
.chip .dot { width: 8px; height: 8px; border-radius: 50%; }
.chip.active { background: #2f6ee5; color: #fff; border-color: #2f6ee5; }
.chip .chip-info { opacity: .8; font-weight: 500; }
.chip .x { opacity: .6; margin-left: 2px; }

.apt-body {
  display: grid;
  grid-template-columns: 260px 1fr;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
.sidebar-wrap { overflow: hidden; }
.sidebar-backdrop { display: none; }

.apt-content {
  overflow: hidden;
  display: flex; flex-direction: column;
  min-width: 0;
}

/* Tablet */
@media (max-width: 1100px) {
  .apt-body { grid-template-columns: 220px 1fr; }
}

/* Narrow tablet & mobile: sidebar becomes off-canvas drawer */
@media (max-width: 900px) {
  .apt-body { grid-template-columns: 1fr; }
  .drawer-toggle { display: inline-flex; align-items: center; justify-content: center; }
  .sidebar-wrap {
    position: absolute;
    top: 0; left: 0; bottom: 0;
    width: 280px;
    max-width: 86vw;
    background: #fff;
    z-index: 20;
    transform: translateX(-100%);
    transition: transform .25s ease;
    box-shadow: 4px 0 16px rgba(0,0,0,.08);
  }
  .sidebar-wrap.open { transform: translateX(0); }
  .sidebar-backdrop {
    display: block;
    position: absolute; inset: 0;
    background: rgba(15,20,25,.32);
    z-index: 15;
  }
  .title-block h1 { font-size: 17px; }
  .title-block .meta { display: none; }
  .datenav .label { min-width: 110px; font-size: 12px; }
}

/* Mobile portrait */
@media (max-width: 600px) {
  .apt-header { padding: 10px 12px; gap: 8px; }
  .apt-subheader { padding: 6px 12px; }
  .apt-subheader .kb-hint { display: none; }
  .viewtoggle button { padding: 5px 10px; font-size: 11px; }
  .btn-label { display: none; }
  .btn.primary { padding: 7px 10px; }
  .btn-icon { font-size: 16px; }
}
</style>
