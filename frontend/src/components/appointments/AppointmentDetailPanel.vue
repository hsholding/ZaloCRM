<template>
  <Teleport to="body">
    <div v-if="appointment" class="panel-overlay" @click="$emit('close')" />
    <aside class="apt-panel" :class="{ open: !!appointment }">
      <template v-if="appointment">
        <div class="panel-head">
          <div class="ev-color" :style="{ background: saleColor(ownerId(appointment)).bg }" />
          <h3>{{ appointment.contact?.fullName || 'Lịch hẹn' }} — {{ typeLabel(appointment.type) }}</h3>
          <button class="close" @click="$emit('close')">✕</button>
        </div>

        <div class="panel-body">
          <div class="panel-section">
            <h5>Khách hàng</h5>
            <div class="cust-card">
              <div class="av" :style="{ background: saleColor(ownerId(appointment)).bg }">
                {{ initials(appointment.contact?.fullName) }}
              </div>
              <div class="info">
                <div class="name">{{ appointment.contact?.fullName || 'Chưa rõ' }}</div>
                <div class="sub">
                  <span v-if="appointment.contact?.phone">📱 {{ appointment.contact.phone }}</span>
                  <span v-if="appointment.contact?.zaloUid"> · 🔵 {{ appointment.contact.zaloUid }}</span>
                </div>
              </div>
              <div class="actions-stack">
                <button
                  v-if="appointment.source === 'zalo' && appointment.conversationId"
                  title="Mở Zalo chat"
                  @click="$emit('open-chat', appointment)"
                >💬</button>
                <button
                  v-if="appointment.contact?.id"
                  title="Hồ sơ KH"
                  @click="$emit('open-contact', appointment)"
                >👤</button>
              </div>
            </div>
          </div>

          <div class="panel-section">
            <h5>Chi tiết</h5>
            <div class="kv-row">
              <span class="k">⏰ Thời gian</span>
              <span class="v"><b>{{ timeRangeLabel }}</b></span>
            </div>
            <div class="kv-row">
              <span class="k">🎯 Loại</span>
              <span class="v">
                <span class="pill type">{{ typeIcon(appointment.type) }} {{ typeLabel(appointment.type) }}</span>
              </span>
            </div>
            <div class="kv-row">
              <span class="k">✅ Trạng thái</span>
              <span class="v">
                <span class="pill" :class="`status-${appointment.status}`">{{ statusLabel(appointment.status) }}</span>
              </span>
            </div>
            <div class="kv-row">
              <span class="k">👤 Sale</span>
              <span class="v">
                <span class="av-mini" :style="{ background: saleColor(ownerId(appointment)).bg }">{{ initials(ownerName(appointment)) }}</span>
                {{ ownerName(appointment) }}
              </span>
            </div>
            <div class="kv-row">
              <span class="k">🔗 Nguồn</span>
              <span class="v">
                {{ appointment.source === 'zalo' ? 'Tự tạo từ chat Zalo' : 'Tạo thủ công' }}
                <a v-if="appointment.source === 'zalo' && appointment.conversationId" href="#" class="link" @click.prevent="$emit('open-chat', appointment)">· Xem chat gốc →</a>
              </span>
            </div>
            <div v-if="appointment.notes" class="kv-row">
              <span class="k">📝 Ghi chú</span>
              <span class="v">{{ appointment.notes }}</span>
            </div>
          </div>

          <div class="panel-section">
            <h5>Lịch sử hoạt động</h5>
            <div class="timeline">
              <div v-if="appointment.statusChangedAt && appointment.statusChangedBy" class="tl-item done">
                <div class="when">{{ formatRelative(appointment.statusChangedAt) }}</div>
                <div class="what">✅ {{ statusLabel(appointment.status) }} — bởi {{ appointment.statusChangedBy.fullName || appointment.statusChangedBy.email }}</div>
              </div>
              <div class="tl-item done">
                <div class="when">{{ formatRelative(appointment.createdAt) }}</div>
                <div class="what">🆕 Lịch hẹn được tạo</div>
                <div v-if="appointment.source === 'zalo'" class="more">Auto-detect từ chat Zalo</div>
              </div>
            </div>
          </div>
        </div>

        <div class="panel-foot">
          <button class="btn" @click="$emit('reschedule', appointment)">📅 Đổi giờ</button>
          <button
            v-if="appointment.status === 'scheduled' || appointment.status === 'overdue'"
            class="btn danger"
            @click="$emit('cancel', appointment)"
          >✕ Huỷ</button>
          <button
            v-if="appointment.status === 'scheduled' || appointment.status === 'overdue'"
            class="btn warn"
            @click="$emit('no-show', appointment)"
          >👤 Vắng</button>
          <button
            v-if="appointment.status === 'scheduled' || appointment.status === 'overdue'"
            class="btn primary"
            @click="$emit('complete', appointment)"
          >✓ Hoàn thành</button>
        </div>
      </template>
    </aside>
  </Teleport>
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
  appointment: Appointment | null;
}>();

defineEmits<{
  (e: 'close'): void;
  (e: 'reschedule', a: Appointment): void;
  (e: 'cancel', a: Appointment): void;
  (e: 'no-show', a: Appointment): void;
  (e: 'complete', a: Appointment): void;
  (e: 'open-chat', a: Appointment): void;
  (e: 'open-contact', a: Appointment): void;
}>();

const DOWS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

const timeRangeLabel = computed(() => {
  if (!props.appointment) return '';
  const s = appointmentStart(props.appointment);
  const e = appointmentEnd(props.appointment);
  const sd = `${DOWS[s.getDay()]}, ${String(s.getDate()).padStart(2, '0')}/${String(s.getMonth() + 1).padStart(2, '0')}/${s.getFullYear()}`;
  const st = `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`;
  const et = `${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
  return `${sd} · ${st}–${et}`;
});

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return 'vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} giờ trước`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
}
</script>

<style scoped>
.panel-overlay { position: fixed; inset: 0; background: rgba(15,20,25,.18); z-index: 49; }
.apt-panel {
  position: fixed;
  top: var(--smax-topnav-h, 52px);
  right: 0;
  bottom: 0;
  width: 420px;
  max-width: 100vw;
  background: #fff;
  border-left: 1px solid #e4e8ef;
  box-shadow: -8px 0 30px rgba(0,0,0,.08);
  transform: translateX(100%);
  transition: transform .25s ease;
  display: flex;
  flex-direction: column;
  z-index: 50;
}
.apt-panel.open { transform: translateX(0); }

@media (max-width: 768px) {
  .apt-panel { width: 100vw; top: 0; }
}
.panel-head { padding: 14px 18px; border-bottom: 1px solid #e4e8ef; display: flex; align-items: center; gap: 10px; }
.panel-head .ev-color { width: 6px; height: 28px; border-radius: 3px; }
.panel-head h3 { margin: 0; font-size: 15px; font-weight: 700; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel-head .close { background: transparent; border: none; font-size: 20px; color: #8d96a4; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; }
.panel-head .close:hover { background: #f5f7fb; }
.panel-body { flex: 1; overflow-y: auto; padding: 16px 18px; }
.panel-section { margin-bottom: 18px; }
.panel-section h5 { font-size: 11px; text-transform: uppercase; color: #8d96a4; margin: 0 0 8px; letter-spacing: .04em; font-weight: 700; }
.cust-card { background: #f9fafc; border: 1px solid #e4e8ef; border-radius: 10px; padding: 12px; display: flex; gap: 10px; align-items: center; }
.cust-card .av { width: 44px; height: 44px; border-radius: 50%; color: #fff; display: grid; place-items: center; font-weight: 700; }
.cust-card .info { flex: 1; min-width: 0; }
.cust-card .info .name { font-weight: 700; font-size: 14px; }
.cust-card .info .sub { font-size: 12px; color: #5b6573; margin-top: 2px; }
.actions-stack { display: flex; flex-direction: column; gap: 4px; }
.actions-stack button { width: 32px; height: 32px; border-radius: 6px; border: 1px solid #e4e8ef; background: #fff; cursor: pointer; }
.actions-stack button:hover { background: #e8f0fe; border-color: #2f6ee5; color: #2f6ee5; }
.kv-row { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px dashed #e4e8ef; font-size: 13px; }
.kv-row:last-child { border-bottom: none; }
.kv-row .k { color: #8d96a4; width: 100px; flex-shrink: 0; font-size: 12px; }
.kv-row .v { flex: 1; color: #1a2433; }
.kv-row .v .link { color: #2f6ee5; text-decoration: none; font-size: 12px; }
.pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.pill.type { background: #f1f5f9; color: #475569; }
.pill.status-scheduled { background: #e8f0fe; color: #2f6ee5; }
.pill.status-overdue { background: #fef3c7; color: #d97706; }
.pill.status-completed { background: #dcfce7; color: #16a34a; }
.pill.status-cancelled { background: #f1f5f9; color: #64748b; }
.pill.status-no_show { background: #fee2e2; color: #dc2626; }
.av-mini { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; color: #fff; font-size: 9px; font-weight: 700; margin-right: 4px; vertical-align: middle; }
.timeline { position: relative; padding-left: 24px; }
.timeline::before { content: ""; position: absolute; left: 8px; top: 4px; bottom: 4px; width: 2px; background: #e4e8ef; }
.tl-item { position: relative; padding: 4px 0 12px; font-size: 12px; }
.tl-item::before { content: ""; position: absolute; left: -24px; top: 7px; width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 2px solid #2f6ee5; }
.tl-item.done::before { background: #16a34a; border-color: #16a34a; }
.tl-item .when { color: #8d96a4; font-size: 11px; }
.tl-item .what { font-weight: 600; color: #1a2433; }
.tl-item .more { color: #5b6573; font-size: 12px; }
.panel-foot { padding: 12px 18px; border-top: 1px solid #e4e8ef; display: flex; gap: 6px; background: #f9fafc; flex-wrap: wrap; }
.panel-foot .btn { flex: 1; padding: 8px 10px; border-radius: 8px; border: 1px solid #cdd4df; background: #fff; cursor: pointer; font-size: 12px; font-weight: 600; color: #1a2433; min-width: 80px; }
.panel-foot .btn:hover { background: #f5f7fb; }
.panel-foot .btn.primary { background: #2f6ee5; color: #fff; border-color: #2f6ee5; }
.panel-foot .btn.primary:hover { background: #2356b8; }
.panel-foot .btn.danger { color: #dc2626; border-color: #fee2e2; }
.panel-foot .btn.danger:hover { background: #fee2e2; }
.panel-foot .btn.warn { color: #d97706; border-color: #fef3c7; }
.panel-foot .btn.warn:hover { background: #fef3c7; }
</style>
