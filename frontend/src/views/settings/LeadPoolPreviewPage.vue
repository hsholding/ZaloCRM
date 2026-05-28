<!--
  LeadPoolPreviewPage — Phase Lead Pool v2 2026-05-27.
  Admin/owner xem queue robin: top N lead đang chờ chia, sort theo priority score.
  KHÔNG mutate (chỉ xem). Helper để admin kiểm tra config có chia đúng lead không.
-->
<template>
  <div class="lpp-page">
    <header class="lpp-head">
      <div>
        <h1>🎯 Queue Lead — Xem trước thứ tự chia</h1>
        <p class="lpp-sub">
          Sale rảnh bấm "Nhận Lead" sẽ nhận 1 trong top 10 (random nhẹ để không trùng).
          List này refresh theo config — đổi config thì refresh trang xem lại.
        </p>
      </div>
      <div class="lpp-actions">
        <button class="lpp-btn" @click="fetchData" :disabled="loading">🔄 Làm mới</button>
        <RouterLink to="/settings/crm/lead-pool" class="lpp-btn-link">⚙ Cấu hình</RouterLink>
      </div>
    </header>

    <div v-if="loading" class="lpp-loading">Đang tải queue...</div>

    <template v-else-if="data">
      <!-- Summary -->
      <section class="lpp-summary">
        <div class="lpp-summary-card">
          <div class="lpp-stat-label">Pool size</div>
          <div class="lpp-stat-value">{{ data.total }}</div>
          <div class="lpp-stat-sub">lead đang chờ chia</div>
        </div>
        <div class="lpp-summary-card">
          <div class="lpp-stat-label">Ngưỡng "lãng quên"</div>
          <div class="lpp-stat-value">{{ data.config.forgottenThresholdDays }}</div>
          <div class="lpp-stat-sub">ngày không tương tác</div>
        </div>
        <div class="lpp-summary-card">
          <div class="lpp-stat-label">Auto trả về pool</div>
          <div class="lpp-stat-value">{{ formatMinutes(data.config.autoReturnAfterMinutes) }}</div>
          <div class="lpp-stat-sub">không note → rollback</div>
        </div>
        <div class="lpp-summary-card" :class="{ 'lpp-stat-warn': !data.config.requirePhoneInPool }">
          <div class="lpp-stat-label">Lọc SĐT</div>
          <div class="lpp-stat-value">{{ data.config.requirePhoneInPool ? 'BẬT' : 'TẮT' }}</div>
          <div class="lpp-stat-sub">{{ data.config.requirePhoneInPool ? 'chỉ lead có phone' : 'cả UID-only' }}</div>
        </div>
      </section>

      <!-- Empty state -->
      <div v-if="data.total === 0" class="lpp-empty">
        <div class="lpp-empty-icon">🎁</div>
        <h3>Pool đang trống</h3>
        <p>Chưa có lead bị bỏ quên nào hợp lệ. Có thể do:</p>
        <ul>
          <li>Mọi KH đều đã được sale chăm trong {{ data.config.forgottenThresholdDays }} ngày qua</li>
          <li>Hoặc các KH cũ đều ở trạng thái Nóng/Tiềm năng/Đã chốt (loại khỏi pool)</li>
          <li>Hoặc lead chỉ có UID không có phone (đang lọc — tắt nếu cần)</li>
        </ul>
      </div>

      <!-- Queue table -->
      <table v-else class="lpp-table">
        <thead>
          <tr>
            <th class="lpp-th-rank">#</th>
            <th class="lpp-th-score">Score</th>
            <th>Khách</th>
            <th>SĐT</th>
            <th>Nguồn</th>
            <th>Trạng thái</th>
            <th>Lãng quên</th>
            <th>Sale cũ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, i) in data.items" :key="item.contactId" :class="{ 'lpp-top10': i < 10 }">
            <td class="lpp-rank">
              <span class="lpp-rank-num">{{ i + 1 }}</span>
              <span v-if="i < 10" class="lpp-rank-badge" title="Top 10 — có thể được chia tiếp">TOP</span>
            </td>
            <td class="lpp-score">{{ item.priorityScore }}</td>
            <td>
              <div class="lpp-name">{{ item.name }}</div>
              <div class="lpp-meta">
                <span v-if="item.hasZalo === true" class="lpp-pill lpp-pill-ok">🟢 Có Zalo</span>
                <span v-else-if="item.hasZalo === false" class="lpp-pill lpp-pill-grey">⚪ No Zalo</span>
                <span v-else class="lpp-pill lpp-pill-grey">❔</span>
                <span v-if="item.acceptedNickCount > 0" class="lpp-meta-item">👥 {{ item.acceptedNickCount }} nick</span>
                <span v-if="item.noteCount > 0" class="lpp-meta-item">💬 {{ item.noteCount }} note</span>
              </div>
            </td>
            <td>
              <code v-if="item.phone" class="lpp-phone">{{ item.phone }}</code>
              <span v-else class="lpp-no-phone">⚠ KHÔNG có</span>
            </td>
            <td>
              <span class="lpp-source" :class="`lpp-source-${item.source}`">
                {{ sourceLabel(item.source) }}
              </span>
            </td>
            <td>
              <span class="lpp-status-chip" :style="item.statusColor ? { background: item.statusColor + '22', color: item.statusColor } : {}">
                {{ item.status || '—' }}
              </span>
            </td>
            <td class="lpp-days">
              {{ item.daysIdle != null ? `${item.daysIdle} ngày` : '—' }}
            </td>
            <td class="lpp-prev-sale">
              {{ item.previousAssignee?.fullName || '—' }}
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="data.items.length === 50" class="lpp-note">
        💡 Hiển thị top 50. Pool thực tế có thể nhiều hơn — chia theo random top 10 mỗi lần sale bấm.
      </p>
    </template>

    <div v-if="error" class="lpp-error">⚠ {{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '@/api/index';

interface PoolItem {
  contactId: string;
  priorityScore: number;
  source: 'forgotten' | 'customer_list' | 'external_sync';
  name: string;
  phone: string | null;
  hasPhone: boolean;
  hasZalo: boolean | null;
  acceptedNickCount: number;
  noteCount: number;
  status: string | null;
  statusColor: string | null;
  daysIdle: number | null;
  lastActivity: string | null;
  previousAssignee: { id: string; fullName: string } | null;
}

interface PoolPreview {
  items: PoolItem[];
  total: number;
  config: { forgottenThresholdDays: number; autoReturnAfterMinutes: number; requirePhoneInPool: boolean };
}

const loading = ref(true);
const data = ref<PoolPreview | null>(null);
const error = ref('');

async function fetchData() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/lead-pool/preview', { params: { limit: 50 } });
    data.value = res.data;
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Không tải được queue';
  } finally {
    loading.value = false;
  }
}

function sourceLabel(s: string) {
  return ({
    forgotten: '💤 Lãng quên',
    customer_list: '📂 Tệp KH',
    external_sync: '🔄 Đồng bộ',
  } as Record<string, string>)[s] || s;
}

function formatMinutes(m: number): string {
  if (!m) return '—';
  if (m < 60) return `${m} phút`;
  if (m < 1440) {
    const h = Math.floor(m / 60); const r = m % 60;
    return r > 0 ? `${h}h ${r}m` : `${h} giờ`;
  }
  const d = Math.floor(m / 1440); const rh = Math.floor((m % 1440) / 60);
  return rh > 0 ? `${d}d ${rh}h` : `${d} ngày`;
}

onMounted(fetchData);
</script>

<style scoped>
.lpp-page { max-width: 1200px; padding: 24px 4px; display: flex; flex-direction: column; gap: 16px; }

.lpp-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding-bottom: 12px; border-bottom: 1px solid #E5E7EB;
  gap: 16px; flex-wrap: wrap;
}
.lpp-head h1 { margin: 0; font-size: 22px; font-weight: 700; color: #0F172A; }
.lpp-sub { margin: 6px 0 0; font-size: 13px; color: #475569; max-width: 720px; }
.lpp-actions { display: flex; gap: 8px; }

.lpp-btn, .lpp-btn-link {
  background: white; color: #5E6AD2;
  border: 1px solid #C7D2FE;
  padding: 8px 14px; border-radius: 8px;
  font-weight: 600; font-size: 13px; cursor: pointer; font-family: inherit;
  text-decoration: none;
  transition: background 0.15s;
}
.lpp-btn:hover, .lpp-btn-link:hover { background: #EEF0FF; }

.lpp-loading { padding: 40px; text-align: center; color: #94A3B8; }

.lpp-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.lpp-summary-card {
  background: white; border: 1px solid #E5E7EB; border-radius: 12px;
  padding: 14px 16px;
  display: flex; flex-direction: column; gap: 4px;
}
.lpp-summary-card.lpp-stat-warn { background: #FFFBEB; border-color: #FCD34D; }
.lpp-stat-label { font-size: 11px; color: #64748B; text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em; }
.lpp-stat-value { font-size: 24px; font-weight: 700; color: #0F172A; font-variant-numeric: tabular-nums; }
.lpp-stat-sub { font-size: 11.5px; color: #94A3B8; }

.lpp-empty {
  background: white; border: 1px dashed #D1D5DB; border-radius: 12px;
  padding: 32px; text-align: center;
}
.lpp-empty-icon { font-size: 48px; }
.lpp-empty h3 { margin: 12px 0 6px; color: #0F172A; }
.lpp-empty p { color: #64748B; margin: 0 0 8px; }
.lpp-empty ul { text-align: left; max-width: 460px; margin: 0 auto; color: #475569; font-size: 13px; line-height: 1.7; }

.lpp-table {
  width: 100%; background: white; border-collapse: collapse;
  border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden;
  font-size: 13px;
}
.lpp-table th {
  background: #F8FAFC; color: #475569;
  text-align: left; padding: 10px 12px;
  font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  border-bottom: 1px solid #E5E7EB;
}
.lpp-table td { padding: 10px 12px; border-bottom: 1px solid #F1F5F9; vertical-align: middle; }
.lpp-table tr:last-child td { border-bottom: none; }
.lpp-table tr.lpp-top10 { background: linear-gradient(90deg, rgba(94, 106, 210, 0.04), transparent); }

.lpp-th-rank, .lpp-rank { width: 70px; }
.lpp-th-score, .lpp-score { width: 70px; font-variant-numeric: tabular-nums; font-weight: 700; color: #5E6AD2; }
.lpp-rank { display: flex; align-items: center; gap: 6px; }
.lpp-rank-num { font-variant-numeric: tabular-nums; color: #94A3B8; font-weight: 600; }
.lpp-rank-badge {
  background: #5E6AD2; color: white;
  font-size: 9.5px; font-weight: 700;
  padding: 1px 6px; border-radius: 9999px;
  letter-spacing: 0.04em;
}

.lpp-name { font-weight: 600; color: #0F172A; }
.lpp-meta { display: flex; gap: 6px; align-items: center; margin-top: 2px; flex-wrap: wrap; }
.lpp-meta-item { font-size: 11px; color: #64748B; }

.lpp-pill { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 9999px; }
.lpp-pill-ok { background: #DCFCE7; color: #166534; }
.lpp-pill-grey { background: #F1F5F9; color: #64748B; }

.lpp-phone { font-family: ui-monospace, monospace; font-size: 12px; color: #0F172A; background: #F1F5F9; padding: 2px 6px; border-radius: 4px; }
.lpp-no-phone { color: #B91C1C; font-size: 11.5px; font-weight: 600; }

.lpp-source { font-size: 11.5px; font-weight: 600; padding: 3px 8px; border-radius: 9999px; }
.lpp-source-forgotten { background: #FEF3C7; color: #92400E; }
.lpp-source-customer_list { background: #DCFCE7; color: #166534; }
.lpp-source-external_sync { background: #DBEAFE; color: #1E40AF; }

.lpp-status-chip {
  background: #F1F5F9; color: #64748B;
  padding: 2px 8px; border-radius: 9999px;
  font-size: 11.5px; font-weight: 600;
}

.lpp-days { color: #475569; font-variant-numeric: tabular-nums; }
.lpp-prev-sale { color: #64748B; font-size: 12px; }

.lpp-note {
  font-size: 12px; color: #94A3B8; font-style: italic;
  padding: 8px 12px; background: #F8FAFC; border-radius: 8px;
}

.lpp-error {
  background: #FEF2F2; color: #B91C1C;
  border: 1px solid #FCA5A5;
  padding: 10px 14px; border-radius: 8px;
}
</style>
