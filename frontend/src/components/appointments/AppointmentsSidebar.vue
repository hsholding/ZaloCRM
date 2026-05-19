<template>
  <aside class="apt-sidebar">
    <div class="side-section">
      <h4>Phạm vi</h4>
      <div class="scope-toggle">
        <button
          v-for="opt in scopeOptions"
          :key="opt.value"
          :class="{ active: scope === opt.value }"
          @click="$emit('update:scope', opt.value)"
        >{{ opt.label }}</button>
      </div>
    </div>

    <div v-if="scope !== 'me'" class="side-section">
      <h4>Sale phụ trách</h4>
      <div class="sale-list">
        <div
          v-for="u in users"
          :key="u.id"
          class="sale"
          :class="{ active: selectedSales.has(u.id) }"
          @click="toggleSale(u.id)"
        >
          <span class="swatch" :style="{ background: saleColor(u.id).bg }" />
          <span class="name">{{ u.fullName }}<span v-if="u.id === currentUserId"> (tôi)</span></span>
          <span class="count">{{ countBySale[u.id] || 0 }}</span>
        </div>
      </div>
    </div>

    <div class="side-section">
      <h4>{{ miniMonthLabel }}</h4>
      <div class="mini-cal">
        <div class="mini-cal-head">
          <button @click="shiftMonth(-1)">‹</button>
          <span class="month">{{ miniMonthLabel }}</span>
          <button @click="shiftMonth(1)">›</button>
        </div>
        <div class="mini-cal-grid">
          <div v-for="d in DOW_LABELS" :key="d" class="dow">{{ d }}</div>
          <div
            v-for="cell in miniCells"
            :key="cell.iso"
            class="day"
            :class="{ muted: cell.muted, today: cell.isToday, 'has-events': cell.count > 0, selected: cell.iso === selectedIso }"
            @click="$emit('select-date', cell.date)"
          >{{ cell.day }}</div>
        </div>
      </div>
    </div>

    <div class="side-section">
      <h4>Trạng thái</h4>
      <div class="filter-grid">
        <label v-for="opt in APPOINTMENT_STATUS_OPTIONS" :key="opt.value" class="filter-chip">
          <input
            type="checkbox"
            :checked="selectedStatuses.has(opt.value)"
            @change="toggleStatus(opt.value)"
          />
          <span class="pill" :class="`status-${opt.value}`">{{ opt.text }}</span>
          <span class="count">{{ countByStatus[opt.value] || 0 }}</span>
        </label>
      </div>
    </div>

    <div class="side-section">
      <h4>Loại lịch hẹn</h4>
      <div class="filter-grid">
        <label v-for="opt in APPOINTMENT_TYPE_OPTIONS" :key="opt.value" class="filter-chip">
          <input
            type="checkbox"
            :checked="selectedTypes.has(opt.value)"
            @change="toggleType(opt.value)"
          />
          <span class="pill type">{{ typeIcon(opt.value) }} {{ opt.text }}</span>
          <span class="count">{{ countByType[opt.value] || 0 }}</span>
        </label>
      </div>
    </div>

    <div class="side-section">
      <h4>Nguồn</h4>
      <div class="source-row">
        <button
          v-for="opt in sourceOptions"
          :key="opt.value"
          class="source-btn"
          :class="{ active: source === opt.value }"
          @click="$emit('update:source', opt.value)"
        >
          {{ opt.label }}<span class="count">{{ opt.count }}</span>
        </button>
      </div>
    </div>

    <div v-if="upcomingPreview.length" class="side-section">
      <h4>Sắp tới hôm nay</h4>
      <div class="upcoming">
        <div
          v-for="a in upcomingPreview"
          :key="a.id"
          class="up-item"
          :style="{ borderLeftColor: saleColor(ownerId(a)).bg }"
          @click="$emit('select-appointment', a)"
        >
          <div class="row">
            <span class="time">{{ fmtTime(a) }}</span>
            <span class="name">{{ a.contact?.fullName || 'KH' }}</span>
          </div>
          <div class="meta">{{ typeIcon(a.type) }} {{ typeLabel(a.type) }} · {{ a.source === 'zalo' ? 'Zalo' : 'Thủ công' }}</div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  APPOINTMENT_STATUS_OPTIONS,
  APPOINTMENT_TYPE_OPTIONS,
  saleColor,
  typeIcon,
  typeLabel,
  appointmentOwnerId as ownerId,
  appointmentStart,
  type AppointmentEx as Appointment,
} from '@/composables/appointment-helpers';
import type { OrgUser } from '@/composables/use-users';

const props = defineProps<{
  scope: 'me' | 'team' | 'all';
  selectedSales: Set<string>;
  selectedStatuses: Set<string>;
  selectedTypes: Set<string>;
  source: 'all' | 'manual' | 'zalo';
  users: OrgUser[];
  currentUserId: string | null;
  appointments: Appointment[];
  visibleMonth: Date;
  selectedDate: Date;
}>();

const emit = defineEmits<{
  (e: 'update:scope', v: 'me' | 'team' | 'all'): void;
  (e: 'update:selectedSales', v: Set<string>): void;
  (e: 'update:selectedStatuses', v: Set<string>): void;
  (e: 'update:selectedTypes', v: Set<string>): void;
  (e: 'update:source', v: 'all' | 'manual' | 'zalo'): void;
  (e: 'update:visibleMonth', v: Date): void;
  (e: 'select-date', v: Date): void;
  (e: 'select-appointment', v: Appointment): void;
}>();

const DOW_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const VN_MONTHS = ['Th 1', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7', 'Th 8', 'Th 9', 'Th 10', 'Th 11', 'Th 12'];

const scopeOptions = [
  { value: 'me' as const, label: 'Của tôi' },
  { value: 'team' as const, label: 'Nhóm' },
  { value: 'all' as const, label: 'Tất cả' },
];

function toggleSale(id: string) {
  const next = new Set(props.selectedSales);
  if (next.has(id)) next.delete(id); else next.add(id);
  emit('update:selectedSales', next);
}
function toggleStatus(v: string) {
  const next = new Set(props.selectedStatuses);
  if (next.has(v)) next.delete(v); else next.add(v);
  emit('update:selectedStatuses', next);
}
function toggleType(v: string) {
  const next = new Set(props.selectedTypes);
  if (next.has(v)) next.delete(v); else next.add(v);
  emit('update:selectedTypes', next);
}

const countBySale = computed(() => {
  const m: Record<string, number> = {};
  for (const a of props.appointments) {
    const id = ownerId(a);
    if (id) m[id] = (m[id] || 0) + 1;
  }
  return m;
});
const countByStatus = computed(() => {
  const m: Record<string, number> = {};
  for (const a of props.appointments) m[a.status] = (m[a.status] || 0) + 1;
  return m;
});
const countByType = computed(() => {
  const m: Record<string, number> = {};
  for (const a of props.appointments) m[a.type] = (m[a.type] || 0) + 1;
  return m;
});

const sourceOptions = computed(() => {
  const zalo = props.appointments.filter(a => a.source === 'zalo').length;
  const manual = props.appointments.filter(a => a.source === 'manual').length;
  return [
    { value: 'all' as const, label: 'Tất cả', count: zalo + manual },
    { value: 'zalo' as const, label: '🔔 Zalo', count: zalo },
    { value: 'manual' as const, label: '✏️ Thủ công', count: manual },
  ];
});

const miniMonthLabel = computed(() => `${VN_MONTHS[props.visibleMonth.getMonth()]}, ${props.visibleMonth.getFullYear()}`);

function shiftMonth(delta: number) {
  const d = new Date(props.visibleMonth);
  d.setMonth(d.getMonth() + delta);
  emit('update:visibleMonth', d);
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const selectedIso = computed(() => isoDay(props.selectedDate));

const apptByDay = computed(() => {
  const m: Record<string, number> = {};
  for (const a of props.appointments) {
    const k = isoDay(appointmentStart(a));
    m[k] = (m[k] || 0) + 1;
  }
  return m;
});

const miniCells = computed(() => {
  const year = props.visibleMonth.getFullYear();
  const month = props.visibleMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const offset = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cells: { date: Date; iso: string; day: number; muted: boolean; isToday: boolean; count: number }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = isoDay(d);
    cells.push({
      date: d,
      iso,
      day: d.getDate(),
      muted: d.getMonth() !== month,
      isToday: d.getTime() === today.getTime(),
      count: apptByDay.value[iso] || 0,
    });
  }
  return cells;
});

const upcomingPreview = computed(() => {
  const now = new Date();
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
  return props.appointments
    .filter(a => {
      const start = appointmentStart(a);
      return start >= now && start <= endOfDay && (a.status === 'scheduled' || a.status === 'overdue');
    })
    .sort((a, b) => appointmentStart(a).getTime() - appointmentStart(b).getTime())
    .slice(0, 3);
});

function fmtTime(a: Appointment): string {
  const d = appointmentStart(a);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
</script>

<style scoped>
.apt-sidebar { background: #fff; border-right: 1px solid #e4e8ef; padding: 16px; overflow-y: auto; height: 100%; }
.side-section { margin-bottom: 18px; }
.side-section h4 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #8d96a4; font-weight: 700; }
.scope-toggle { display: flex; background: #f5f7fb; border: 1px solid #e4e8ef; border-radius: 8px; padding: 2px; }
.scope-toggle button { flex: 1; padding: 6px 8px; background: transparent; border: none; border-radius: 6px; color: #5b6573; font-size: 12px; font-weight: 600; cursor: pointer; }
.scope-toggle button.active { background: #fff; color: #1a2433; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
.sale-list { display: flex; flex-direction: column; gap: 4px; }
.sale-list .sale { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; border: 1px solid transparent; }
.sale-list .sale:hover { background: #f9fafc; }
.sale-list .sale.active { background: #e8f0fe; border-color: #2f6ee5; }
.sale-list .sale .swatch { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.sale-list .sale .name { flex: 1; font-size: 13px; }
.sale-list .sale .count { font-size: 11px; color: #8d96a4; background: #f5f7fb; border-radius: 10px; padding: 2px 8px; }
.mini-cal { background: #f9fafc; border: 1px solid #e4e8ef; border-radius: 10px; padding: 10px; }
.mini-cal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.mini-cal-head .month { font-weight: 700; font-size: 13px; }
.mini-cal-head button { background: transparent; border: none; color: #5b6573; font-size: 14px; width: 22px; height: 22px; border-radius: 4px; cursor: pointer; }
.mini-cal-head button:hover { background: #fff; }
.mini-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
.mini-cal-grid .dow { font-size: 10px; color: #8d96a4; text-align: center; padding: 4px 0; font-weight: 600; }
.mini-cal-grid .day { font-size: 11px; text-align: center; padding: 5px 0; border-radius: 4px; cursor: pointer; position: relative; }
.mini-cal-grid .day:hover { background: #fff; }
.mini-cal-grid .day.muted { color: #cdd4df; }
.mini-cal-grid .day.today { background: #2f6ee5; color: #fff; font-weight: 700; }
.mini-cal-grid .day.selected { outline: 2px solid #2f6ee5; }
.mini-cal-grid .day.has-events::after { content: ""; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; background: #d97706; border-radius: 50%; }
.mini-cal-grid .day.today.has-events::after { background: #fff; }
.filter-grid { display: flex; flex-direction: column; gap: 6px; }
.filter-chip { display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; padding: 4px 0; }
.filter-chip input[type=checkbox] { accent-color: #2f6ee5; width: 14px; height: 14px; }
.filter-chip .pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; font-weight: 600; font-size: 11px; }
.filter-chip .pill.status-scheduled { background: #e8f0fe; color: #2f6ee5; }
.filter-chip .pill.status-overdue { background: #fef3c7; color: #d97706; }
.filter-chip .pill.status-completed { background: #dcfce7; color: #16a34a; }
.filter-chip .pill.status-cancelled { background: #f1f5f9; color: #64748b; }
.filter-chip .pill.status-no_show { background: #fee2e2; color: #dc2626; }
.filter-chip .pill.type { background: #f1f5f9; color: #475569; }
.filter-chip .count { margin-left: auto; color: #8d96a4; font-size: 11px; }
.source-row { display: flex; gap: 6px; flex-wrap: wrap; }
.source-btn { flex: 1; min-width: 64px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 6px 10px; border-radius: 14px; background: #f5f7fb; border: 1px solid #e4e8ef; font-size: 12px; cursor: pointer; }
.source-btn.active { background: #2f6ee5; color: #fff; border-color: #2f6ee5; }
.source-btn .count { background: rgba(255,255,255,.4); padding: 0 6px; border-radius: 8px; font-size: 10px; }
.source-btn:not(.active) .count { background: #fff; color: #8d96a4; }
.upcoming { display: flex; flex-direction: column; gap: 6px; }
.upcoming .up-item { background: #f9fafc; border: 1px solid #e4e8ef; border-left-width: 3px; border-radius: 8px; padding: 8px 10px; cursor: pointer; }
.upcoming .up-item:hover { background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.04); }
.upcoming .up-item .row { display: flex; align-items: center; gap: 6px; }
.upcoming .up-item .time { font-weight: 700; font-size: 12px; color: #1a2433; }
.upcoming .up-item .name { font-size: 12px; color: #5b6573; }
.upcoming .up-item .meta { font-size: 11px; color: #8d96a4; margin-top: 2px; }
</style>
