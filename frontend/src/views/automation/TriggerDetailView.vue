<template>
  <div class="trig-detail airtable-scope at-container">
    <div v-if="!data" class="loading">Đang tải...</div>
    <template v-else>
      <!-- Header -->
      <div class="header">
        <div>
          <button class="at-btn at-btn--ghost at-btn--sm" @click="router.push('/marketing/triggers')">← Quay lại</button>
          <h1 class="title">
            <span class="title-icon">👋</span>
            {{ data.trigger.name }}
            <span class="status-chip" :class="`status-${data.trigger.state}`">{{ stateLabel(data.trigger.state) }}</span>
          </h1>
          <div class="meta">
            Luồng: <b>{{ data.trigger.successorSequence?.name ?? '—' }}</b>
            · Tạo: {{ formatDate(data.trigger.createdAt) }}
          </div>
        </div>
        <div class="actions">
          <button v-if="data.trigger.state === 'active'" class="at-btn at-btn--secondary" @click="pause">⏸ Tạm ngưng</button>
          <button v-if="data.trigger.state === 'paused'" class="at-btn at-btn--secondary" @click="resume">▶ Tiếp tục</button>
          <button v-if="data.trigger.state !== 'cancelled' && data.trigger.state !== 'completed'" class="at-btn at-btn--danger" @click="cancel">❌ Huỷ bỏ</button>
        </div>
      </div>

      <!-- Greeting preview -->
      <div class="section">
        <div class="section-title">Lời chào kết bạn</div>
        <div class="greeting-box">{{ data.trigger.greetingTemplate }}</div>
      </div>

      <!-- Counter grid 8 -->
      <div class="counter-grid">
        <div class="counter-card">
          <div class="counter-label">Tổng KH</div>
          <div class="counter-value">{{ formatNum(data.counters.total) }}</div>
        </div>
        <div class="counter-card green">
          <div class="counter-label">Đã gửi</div>
          <div class="counter-value">{{ formatNum(data.counters.sent ?? 0) }}</div>
        </div>
        <div class="counter-card">
          <div class="counter-label">Đang chờ</div>
          <div class="counter-value">{{ formatNum(data.counters.queued_for_pickup) }}</div>
        </div>
        <div class="counter-card">
          <div class="counter-label">Đang xử lý</div>
          <div class="counter-value">{{ formatNum(data.counters.processing) }}</div>
        </div>
        <div class="counter-card amber">
          <div class="counter-label">Skip friend cap</div>
          <div class="counter-value">{{ formatNum(data.counters.skipped_friend_cap) }}</div>
        </div>
        <div class="counter-card amber">
          <div class="counter-label">Skip recency</div>
          <div class="counter-value">{{ formatNum(data.counters.skipped_recency) }}</div>
        </div>
        <div class="counter-card">
          <div class="counter-label">No-Zalo</div>
          <div class="counter-value">{{ formatNum(data.counters.skipped_no_zalo) }}</div>
        </div>
        <div class="counter-card coral">
          <div class="counter-label">Failed</div>
          <div class="counter-value">{{ formatNum(data.counters.failed_permanent + data.counters.failed_stuck) }}</div>
        </div>
      </div>

      <!-- Nick list -->
      <div class="section">
        <div class="section-title">{{ data.nicks.length }} nick đang chạy</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Nick</th>
              <th>Trạng thái</th>
              <th>Worker</th>
              <th class="right">Đã gửi hôm nay</th>
              <th class="right">Quota còn</th>
              <th class="right">Tổng đã gửi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in data.nicks" :key="n.nickId">
              <td>{{ n.displayName ?? n.nickId.slice(0, 8) }}</td>
              <td>
                <span class="dot" :class="`dot--${n.status === 'connected' ? 'green' : 'red'}`"></span>
                {{ n.status }}
              </td>
              <td>
                <span v-if="n.workerRunning" class="dot dot--green"></span>
                <span v-else class="dot dot--red"></span>
                {{ n.workerRunning ? 'Active' : 'Off' }}
                {{ n.workerBusy ? ' (busy)' : '' }}
              </td>
              <td class="right">{{ n.sentToday }} / {{ n.dailyFriendAddCap }}</td>
              <td class="right">{{ Math.max(0, n.dailyFriendAddCap - n.sentToday) }}</td>
              <td class="right"><b>{{ n.sentTotal }}</b></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Live refresh -->
      <div class="footer-info">
        🔄 Auto refresh mỗi 5 giây · Cập nhật lúc {{ formatTime(lastRefresh) }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import { formatInOrgTz } from '@/composables/use-org-timezone';
import '@/components/automation/phase7/airtable.css';

const route = useRoute();
const router = useRouter();
const triggerId = route.params.id as string;

interface DashboardData {
  trigger: {
    id: string;
    name: string;
    state: string;
    greetingTemplate: string;
    successorSequence: { id: string; name: string } | null;
    createdAt: string;
  };
  counters: Record<string, number>;
  nicks: Array<{
    nickId: string;
    displayName: string | null;
    status: string;
    dailyFriendAddCap: number;
    sentToday: number;
    sentTotal: number;
    workerRunning: boolean;
    workerBusy: boolean;
  }>;
}

const data = ref<DashboardData | null>(null);
const lastRefresh = ref(new Date());
let refreshTimer: ReturnType<typeof setInterval> | null = null;

async function load() {
  try {
    const r = await api.get(`/automation/triggers/${triggerId}/dashboard`);
    data.value = r.data;
    lastRefresh.value = new Date();
  } catch (err) {
    console.error('[trig-detail] load failed', err);
  }
}

async function pause() {
  if (!confirm('Tạm ngưng Mục tiêu này? Worker sẽ dừng.')) return;
  await api.post(`/automation/triggers/${triggerId}/pause`);
  await load();
}

async function resume() {
  await api.post(`/automation/triggers/${triggerId}/resume`);
  await load();
}

async function cancel() {
  if (!confirm('Huỷ Mục tiêu? Các KH chưa gửi sẽ bị bỏ. KHÔNG quay lại được.')) return;
  await api.post(`/automation/triggers/${triggerId}/cancel`);
  await load();
}

function stateLabel(state: string): string {
  const map: Record<string, string> = {
    draft: '📝 Nháp',
    active: '🟢 Đang chạy',
    paused: '⏸ Tạm ngưng',
    cancelling: '⏳ Đang huỷ',
    cancelled: '❌ Đã huỷ',
    completed: '✅ Hoàn tất',
  };
  return map[state] ?? state;
}

function formatNum(n: number | undefined): string {
  return (n ?? 0).toLocaleString('vi-VN');
}

function formatDate(iso: string): string { return formatInOrgTz(iso); }
function formatTime(d: Date): string { return d.toLocaleTimeString('vi-VN'); }

onMounted(() => {
  void load();
  refreshTimer = setInterval(load, 5000);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<style scoped>
.trig-detail { padding: 24px 28px 80px; }
.loading { text-align: center; padding: 80px; color: #6b7280; }
.header {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-bottom: 24px; gap: 20px;
}
.title { font-size: 22px; font-weight: 500; color: #181d26; margin: 12px 0 6px; }
.title-icon { margin-right: 8px; }
.meta { font-size: 13px; color: #6b7280; }
.actions { display: flex; gap: 8px; }
.status-chip {
  display: inline-block; padding: 4px 10px; border-radius: 99px;
  font-size: 11px; font-weight: 500; margin-left: 10px;
}
.status-draft { background: #f0f1f3; color: #41454d; }
.status-active { background: rgba(0,100,0,0.1); color: #006400; }
.status-paused { background: rgba(217,164,65,0.15); color: #b07a14; }
.status-cancelled { background: rgba(170,45,0,0.1); color: #aa2d00; }
.status-completed { background: rgba(168,216,196,0.25); color: #0a2e0e; }

.section {
  background: #fff; border: 1px solid #ddd; border-radius: 10px;
  padding: 16px 20px; margin-bottom: 16px;
}
.section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #41454d; letter-spacing: 0.5px; margin-bottom: 10px; }
.greeting-box {
  background: #f8fafc; border-left: 3px solid #aa2d00; padding: 10px 12px;
  border-radius: 0 6px 6px 0; font-size: 13px; font-style: italic; line-height: 1.5;
}

.counter-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
  margin-bottom: 16px;
}
.counter-card {
  background: #fff; border: 1px solid #ddd; border-radius: 10px;
  padding: 14px 16px;
}
.counter-card.green .counter-value { color: #006400; }
.counter-card.amber .counter-value { color: #b07a14; }
.counter-card.coral .counter-value { color: #aa2d00; }
.counter-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; margin-bottom: 4px; }
.counter-value { font-size: 22px; font-weight: 500; color: #181d26; font-variant-numeric: tabular-nums; }

.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table thead th {
  background: #f8fafc; font-size: 11px; font-weight: 600; color: #41454d;
  text-transform: uppercase; letter-spacing: 0.5px;
  padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd;
}
.data-table thead th.right { text-align: right; }
.data-table tbody td { padding: 8px 12px; border-bottom: 1px solid #f0f1f3; }
.data-table tbody td.right { text-align: right; }
.data-table tbody tr:last-child td { border-bottom: 0; }

.dot { display: inline-block; width: 8px; height: 8px; border-radius: 99px; margin-right: 4px; }
.dot--green { background: #006400; }
.dot--red { background: #aa2d00; }

.footer-info { text-align: center; font-size: 11px; color: #6b7280; padding: 16px; }

.at-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 6px;
  font-size: 13px; font-weight: 500;
  border: 0; cursor: pointer; font-family: inherit;
}
.at-btn--secondary { background: #fff; border: 1px solid #ddd; color: #181d26; }
.at-btn--danger { background: #fff; border: 1px solid rgba(170,45,0,0.3); color: #aa2d00; }
.at-btn--ghost { background: transparent; color: #181d26; }
.at-btn--ghost:hover { background: #f0f1f3; }
.at-btn--sm { padding: 5px 10px; font-size: 12px; }
</style>
