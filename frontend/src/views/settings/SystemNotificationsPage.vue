<template>
  <div class="system-notify-page">
    <div class="d-flex align-center justify-space-between mb-5 flex-wrap ga-3">
      <div>
        <div class="text-h5 font-weight-bold">Thông báo hệ thống</div>
        <div class="text-body-2 text-medium-emphasis mt-1">
          Chọn nick gửi system notification và lưu UID từng nhân viên theo góc nhìn nick đó.
        </div>
      </div>
      <v-btn variant="tonal" prepend-icon="mdi-refresh" :loading="loadingRecipients" @click="fetchRecipients">
        Làm mới
      </v-btn>
    </div>

    <v-card variant="outlined" class="pa-4 mb-4 notify-card">
      <div class="d-flex flex-wrap align-start ga-4">
        <v-select
          v-model="senderId"
          :items="senderOptions"
          item-title="label"
          item-value="value"
          label="Nick Zalo gửi thông báo hệ thống"
          variant="outlined"
          density="comfortable"
          clearable
          hide-details="auto"
          :loading="loadingSettings || savingSender"
          class="sender-select"
          @update:model-value="saveSender"
        />
        <v-chip v-if="selectedSender" :color="selectedSender.status === 'connected' ? 'success' : 'warning'" variant="tonal" class="mt-2">
          {{ selectedSender.status === 'connected' ? 'Đang connected' : 'Offline' }}
        </v-chip>
        <v-chip v-else color="grey" variant="tonal" class="mt-2">Chưa chọn nick gửi</v-chip>
      </div>
      <div class="text-caption text-medium-emphasis mt-3">
        Khi đổi nick gửi, bảng bên dưới sẽ kiểm tra mapping UID riêng cho nick mới. UID cũ của nick khác không dùng chung.
      </div>
      <v-alert v-if="senderError" type="error" density="compact" class="mt-3">{{ senderError }}</v-alert>
    </v-card>

    <div class="d-flex flex-wrap ga-2 mb-3">
      <v-chip size="small" color="success" variant="tonal">Đã có UID {{ summary.ready || 0 }}</v-chip>
      <v-chip size="small" color="warning" variant="tonal">Chưa có UID {{ summary.uid_not_found || 0 }}</v-chip>
      <v-chip size="small" color="warning" variant="tonal">Thiếu SĐT {{ summary.missing_internal_phone || 0 }}</v-chip>
      <v-chip size="small" color="grey" variant="tonal">Thiếu nick {{ summary.missing_internal_contact || 0 }}</v-chip>
      <v-chip size="small" color="error" variant="tonal">Lỗi {{ (summary.lookup_failed || 0) + (summary.sender_disconnected || 0) }}</v-chip>
    </div>

    <v-alert v-if="lookupError" type="error" density="compact" class="mb-3">{{ lookupError }}</v-alert>
    <v-alert v-if="lookupSuccess" type="success" density="compact" class="mb-3">{{ lookupSuccess }}</v-alert>

    <v-card variant="outlined" class="notify-card">
      <v-table density="comfortable" class="recipient-table">
        <thead>
          <tr>
            <th>Nhân viên</th>
            <th>Phòng ban</th>
            <th>Chức vụ</th>
            <th>Nick liên lạc nội bộ</th>
            <th>UID góc nhìn nick gửi</th>
            <th>Trạng thái</th>
            <th class="text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in recipients" :key="row.user.id">
            <td>
              <div class="font-weight-medium">{{ row.user.fullName }}</div>
              <div class="text-caption text-medium-emphasis">{{ row.user.email }}</div>
            </td>
            <td>{{ row.user.departmentMember?.department?.name || 'Chưa gán' }}</td>
            <td>
              <div>{{ row.user.departmentMember?.deptRole || roleLabel(row.user.role) }}</div>
              <div v-if="row.user.permissionGroup?.name" class="text-caption text-medium-emphasis">
                {{ row.user.permissionGroup.name }}
              </div>
            </td>
            <td>
              <div class="font-weight-medium">{{ row.internalContactNick?.displayName || 'Chưa chọn' }}</div>
              <div class="text-caption text-medium-emphasis">
                {{ row.internalContactNick?.phone || 'Chưa có SĐT' }}
              </div>
            </td>
            <td>
              <span v-if="row.recipient.threadIdInSenderView" class="uid-text">{{ row.recipient.threadIdInSenderView }}</span>
              <span v-else class="text-medium-emphasis">Chưa có</span>
            </td>
            <td>
              <v-chip size="small" :color="statusColor(row.recipient.status)" variant="tonal">
                {{ statusLabel(row.recipient.status) }}
              </v-chip>
              <div v-if="row.recipient.error" class="text-caption text-medium-emphasis mt-1">
                {{ row.recipient.error }}
              </div>
            </td>
            <td class="text-right">
              <v-btn
                size="small"
                variant="tonal"
                :loading="lookupUserId === row.user.id"
                :disabled="!canLookup(row)"
                @click="lookupUid(row)"
              >
                Tìm UID
              </v-btn>
            </td>
          </tr>
          <tr v-if="!loadingRecipients && recipients.length === 0">
            <td colspan="7" class="text-center text-medium-emphasis py-6">Chưa có nhân viên để kiểm tra.</td>
          </tr>
          <tr v-if="loadingRecipients">
            <td colspan="7" class="text-center text-medium-emphasis py-6">Đang tải danh sách...</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api/index';

interface SenderNick {
  id: string;
  displayName: string | null;
  avatarUrl?: string | null;
  zaloUid?: string | null;
  phone?: string | null;
  status: string;
}

interface RecipientRow {
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    departmentMember: { deptRole: string | null; department: { id: string; name: string; path: string } | null } | null;
    permissionGroup: { id: string; name: string; isSystem: boolean } | null;
  };
  internalContactNick: { id: string; displayName: string | null; avatarUrl?: string | null; phone?: string | null; status: string } | null;
  recipient: {
    id: string;
    status: string;
    error: string | null;
    conversationId: string | null;
    threadIdInSenderView: string | null;
    lastVerifiedAt: string;
  };
}

const loadingSettings = ref(false);
const loadingRecipients = ref(false);
const savingSender = ref(false);
const senderError = ref('');
const lookupError = ref('');
const lookupSuccess = ref('');
const senderId = ref<string | null>(null);
const nicks = ref<SenderNick[]>([]);
const recipients = ref<RecipientRow[]>([]);
const summary = ref<Record<string, number>>({});
const lookupUserId = ref<string | null>(null);

const senderOptions = computed(() => nicks.value.map((nick) => ({
  value: nick.id,
  label: `${nick.displayName || 'Nick chưa đặt tên'}${nick.status === 'connected' ? '' : ' (offline)'}`,
})));

const selectedSender = computed(() => nicks.value.find((nick) => nick.id === senderId.value) || null);

async function fetchSettings() {
  loadingSettings.value = true;
  senderError.value = '';
  try {
    const { data } = await api.get('/system-notifications/settings');
    senderId.value = data.systemNotifyZaloAccountId ?? null;
    nicks.value = data.nicks || [];
  } catch (err: any) {
    senderError.value = err?.response?.data?.error || 'Lỗi tải cấu hình thông báo hệ thống';
  } finally {
    loadingSettings.value = false;
  }
}

async function fetchRecipients() {
  loadingRecipients.value = true;
  try {
    const { data } = await api.get('/system-notifications/recipients');
    recipients.value = data.recipients || [];
    summary.value = data.summary || {};
  } finally {
    loadingRecipients.value = false;
  }
}

async function saveSender(value: unknown) {
  savingSender.value = true;
  senderError.value = '';
  lookupError.value = '';
  lookupSuccess.value = '';
  try {
    await api.patch('/system-notifications/settings/sender', { zaloAccountId: value || null });
    await fetchRecipients();
  } catch (err: any) {
    senderError.value = err?.response?.data?.error || 'Lỗi lưu nick gửi thông báo hệ thống';
  } finally {
    savingSender.value = false;
  }
}

function canLookup(row: RecipientRow) {
  return Boolean(senderId.value && row.internalContactNick?.id && row.internalContactNick?.phone && lookupUserId.value !== row.user.id);
}

async function lookupUid(row: RecipientRow) {
  lookupUserId.value = row.user.id;
  lookupError.value = '';
  lookupSuccess.value = '';
  try {
    const { data } = await api.post(`/system-notifications/recipients/${row.user.id}/lookup-uid`);
    const recipient = data.recipient;
    if (recipient) {
      row.recipient = {
        id: recipient.id,
        status: recipient.status,
        error: recipient.error,
        conversationId: recipient.conversationId,
        threadIdInSenderView: recipient.threadIdInSenderView,
        lastVerifiedAt: recipient.lastVerifiedAt,
      };
    }
    lookupSuccess.value = data.found ? `Đã lưu UID cho ${row.user.fullName}` : `Chưa tìm thấy UID cho ${row.user.fullName}`;
    await fetchRecipients();
  } catch (err: any) {
    lookupError.value = err?.response?.data?.error || 'Lỗi tìm UID';
    await fetchRecipients();
  } finally {
    lookupUserId.value = null;
  }
}

function statusColor(status: string) {
  if (status === 'ready') return 'success';
  if (status === 'uid_not_found' || status === 'missing_internal_phone' || status === 'missing_internal_contact') return 'warning';
  if (status === 'sender_disconnected' || status === 'missing_system_sender' || status === 'lookup_failed') return 'error';
  return 'grey';
}

function statusLabel(status: string) {
  return ({
    ready: 'Đã có UID',
    missing_system_sender: 'Chưa chọn nick gửi',
    missing_internal_contact: 'Chưa chọn nick nội bộ',
    missing_internal_phone: 'Nick nội bộ thiếu SĐT',
    sender_disconnected: 'Nick gửi offline',
    uid_not_found: 'Chưa có UID',
    lookup_failed: 'Lỗi tìm UID',
    invalid: 'Invalid',
  } as Record<string, string>)[status] || status;
}

function roleLabel(role: string) {
  return ({ owner: 'Chủ tổ chức', admin: 'Admin', member: 'Nhân viên' } as Record<string, string>)[role] || role;
}

onMounted(async () => {
  await fetchSettings();
  await fetchRecipients();
});
</script>

<style scoped>
.system-notify-page {
  max-width: 1280px;
}

.notify-card {
  border-color: rgba(var(--v-theme-outline), 0.18);
}

.sender-select {
  min-width: 320px;
  max-width: 520px;
}

.recipient-table :deep(td),
.recipient-table :deep(th) {
  white-space: nowrap;
}

.uid-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}
</style>
