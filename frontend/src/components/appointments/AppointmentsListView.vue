<template>
  <div class="apt-list">
    <div v-if="!appointments.length" class="empty">
      <div class="empty-icon">📅</div>
      <h3>Chưa có lịch hẹn</h3>
      <p>Lọc hiện tại không khớp lịch nào. Thử bỏ bớt filter hoặc tạo lịch hẹn mới.</p>
      <button class="empty-btn" @click="$emit('create')">＋ Tạo lịch hẹn</button>
    </div>

    <div v-for="group in grouped" :key="group.iso" class="group">
      <h3>
        {{ group.label }}
        <span class="badge">{{ group.items.length }} lịch<span v-if="group.conflicts"> · ⚠ {{ group.conflicts }} trùng giờ</span></span>
      </h3>
      <div
        v-for="a in group.items"
        :key="a.id"
        class="row"
        :style="{ borderLeftColor: saleColor(ownerId(a)).bg }"
        @click="$emit('select-appointment', a)"
      >
        <div class="time">
          {{ fmtTime(a) }}
          <span class="dur">{{ a.durationMin || 30 }} phút</span>
        </div>
        <div class="customer">
          <div class="av" :style="{ background: saleColor(ownerId(a)).bg }">{{ initials(a.contact?.fullName) }}</div>
          <div class="info">
            <div class="name">
              {{ a.contact?.fullName || 'Khách hàng' }}
              <span v-if="a.contact?.zaloUid" class="zalo-tag">🔵</span>
            </div>
            <div class="sub">
              <span v-if="a.contact?.phone">📱 {{ a.contact.phone }}</span>
              <span v-if="a.contact?.zaloUid"> · {{ a.contact.zaloUid }}</span>
            </div>
            <!-- mobile-only inline meta -->
            <div class="mobile-meta">
              <span class="pill type">{{ typeIcon(a.type) }} {{ typeLabel(a.type) }}</span>
              <span class="pill" :class="`status-${a.status}`">{{ statusLabel(a.status) }}</span>
              <span class="src-icon" :class="a.source">{{ a.source === 'zalo' ? 'Z' : 'M' }}</span>
              <span class="av-mini" :style="{ background: saleColor(ownerId(a)).bg }">{{ initials(ownerName(a)) }}</span>
            </div>
          </div>
        </div>
        <div class="source">
          <span class="src-icon" :class="a.source">{{ a.source === 'zalo' ? 'Z' : 'M' }}</span>
          {{ a.source === 'zalo' ? 'Auto từ chat Zalo' : 'Tạo thủ công' }}
        </div>
        <div class="type-cell">
          <span class="pill type">{{ typeIcon(a.type) }} {{ typeLabel(a.type) }}</span>
        </div>
        <div>
          <span class="pill" :class="`status-${a.status}`">{{ statusLabel(a.status) }}</span>
        </div>
        <div class="owner">
          <span class="av-mini" :style="{ background: saleColor(ownerId(a)).bg }">{{ initials(ownerName(a)) }}</span>
          <span class="owner-name">{{ shortName(ownerName(a)) }}</span>
        </div>
        <div class="actions" @click.stop>
          <button
            v-if="a.source === 'zalo' && a.conversationId"
            title="Mở chat Zalo"
            @click="$emit('open-chat', a)"
          >💬</button>
          <button
            v-if="a.status === 'scheduled' || a.status === 'overdue'"
            title="Hoàn thành"
            @click="$emit('mark-complete', a)"
          >✓</button>
          <button title="Chi tiết" @click="$emit('select-appointment', a)">⋯</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  saleColor,
  typeIcon,
  typeLabel,
  statusLabel,
  initials,
  appointmentOwnerId as ownerId,
  appointmentOwnerName as ownerName,
  appointmentStart,
  appointmentEnd,
  type AppointmentEx as Appointment,
} from '@/composables/appointment-helpers';

const props = defineProps<{
  appointments: Appointment[];
}>();

defineEmits<{
  (e: 'select-appointment', a: Appointment): void;
  (e: 'create'): void;
  (e: 'mark-complete', a: Appointment): void;
  (e: 'open-chat', a: Appointment): void;
}>();

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(a: Appointment): string {
  const d = appointmentStart(a);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(-2).join(' ') : name;
}

function dayLabel(d: Date): string {
  const DOWS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tmr = new Date(today); tmr.setDate(today.getDate() + 1);
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  const dayMid = new Date(d); dayMid.setHours(0, 0, 0, 0);
  let prefix = '';
  if (dayMid.getTime() === today.getTime()) prefix = 'Hôm nay · ';
  else if (dayMid.getTime() === tmr.getTime()) prefix = 'Mai · ';
  else if (dayMid.getTime() === yest.getTime()) prefix = 'Hôm qua · ';
  return `${prefix}${DOWS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function countConflicts(items: Appointment[]): number {
  const conflictSet = new Set<string>();
  const sorted = [...items].sort((a, b) => appointmentStart(a).getTime() - appointmentStart(b).getTime());
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (appointmentStart(sorted[j]).getTime() >= appointmentEnd(sorted[i]).getTime()) break;
      conflictSet.add(sorted[i].id);
      conflictSet.add(sorted[j].id);
    }
  }
  return conflictSet.size;
}

const grouped = computed(() => {
  const m = new Map<string, Appointment[]>();
  for (const a of props.appointments) {
    const k = isoDay(appointmentStart(a));
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(a);
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, items]) => {
      items.sort((a, b) => appointmentStart(a).getTime() - appointmentStart(b).getTime());
      const d = appointmentStart(items[0]);
      return { iso, label: dayLabel(d), items, conflicts: countConflicts(items) };
    });
});
</script>

<style scoped>
.apt-list { padding: 12px 20px 24px; overflow-y: auto; height: 100%; background: #f5f7fb; }
.empty { background: #fff; border: 1px dashed #cdd4df; border-radius: 12px; padding: 48px 24px; text-align: center; color: #5b6573; }
.empty-icon { font-size: 36px; }
.empty h3 { margin: 8px 0 4px; color: #1a2433; }
.empty-btn { margin-top: 12px; padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; background: #2f6ee5; color: #fff; }
.group { margin-bottom: 18px; }
.group h3 { font-size: 13px; color: #5b6573; margin: 0 0 8px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.group h3 .badge { background: #fff; border: 1px solid #e4e8ef; padding: 1px 8px; border-radius: 10px; font-size: 11px; }
.row { display: grid; grid-template-columns: 80px 1fr 200px 130px 130px 110px 88px; align-items: center; gap: 12px; background: #fff; border: 1px solid #e4e8ef; border-left: 4px solid transparent; border-radius: 10px; padding: 10px 12px; margin-bottom: 6px; cursor: pointer; }
.row:hover { box-shadow: 0 4px 14px rgba(0,0,0,.06); border-color: #cdd4df; }
.time { font-weight: 700; font-size: 14px; }
.time .dur { font-size: 10px; color: #8d96a4; font-weight: 500; display: block; }
.customer { display: flex; align-items: center; gap: 10px; }
.customer .av { width: 36px; height: 36px; border-radius: 50%; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }
.customer .info .name { font-weight: 600; }
.customer .info .zalo-tag { font-size: 10px; }
.customer .info .sub { font-size: 11px; color: #8d96a4; }
.source { font-size: 12px; color: #5b6573; display: flex; align-items: center; gap: 6px; }
.src-icon { width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; font-size: 11px; font-weight: 800; color: #fff; }
.src-icon.zalo { background: #0068ff; }
.src-icon.manual { background: #64748b; }
.pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.pill.type { background: #f1f5f9; color: #475569; }
.pill.status-scheduled { background: #e8f0fe; color: #2f6ee5; }
.pill.status-overdue { background: #fef3c7; color: #d97706; }
.pill.status-completed { background: #dcfce7; color: #16a34a; }
.pill.status-cancelled { background: #f1f5f9; color: #64748b; }
.pill.status-no_show { background: #fee2e2; color: #dc2626; }
.owner { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.av-mini { width: 22px; height: 22px; border-radius: 50%; color: #fff; display: grid; place-items: center; font-size: 10px; font-weight: 700; }
.actions { display: flex; gap: 4px; justify-content: flex-end; }
.actions button { width: 28px; height: 28px; border-radius: 6px; border: 1px solid #e4e8ef; background: #fff; color: #5b6573; cursor: pointer; }
.actions button:hover { background: #f5f7fb; color: #1a2433; }

@media (max-width: 1100px) {
  .row { grid-template-columns: 70px 1fr 130px 120px 110px 90px 80px; gap: 8px; }
  .source { font-size: 11px; }
}

.mobile-meta { display: none; }

@media (max-width: 900px) {
  .apt-list { padding: 10px 12px 20px; }
  .row {
    grid-template-columns: 60px 1fr auto;
    row-gap: 4px;
  }
  .row .time { align-self: start; }
  .row .customer { min-width: 0; }
  .row .customer .info .name { font-size: 13px; }
  .row .source,
  .row .type-cell,
  .row > div:nth-child(5),
  .row .owner {
    display: none;
  }
  .mobile-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    margin-top: 4px;
  }
  .mobile-meta .src-icon { width: 18px; height: 18px; font-size: 9px; }
  .mobile-meta .av-mini { width: 18px; height: 18px; font-size: 9px; }
}

@media (max-width: 600px) {
  .row { padding: 8px 10px; }
  .row .customer .av { width: 30px; height: 30px; font-size: 11px; }
  .time { font-size: 13px; }
}
</style>
