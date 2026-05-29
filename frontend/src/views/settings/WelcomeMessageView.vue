<!--
  WelcomeMessageView — Phase Wave 2 welcome-probe 2026-05-29.
  Admin cấu hình "Tin nhắn chào mừng tự động" gửi NGAY sau khi gửi lời mời kết bạn.
  Mục đích: kiểm tra KH có cho phép nhận tin từ người lạ không, để quyết định gắn vào
  luồng bám đuổi (sequence) hay không.

  BE: GET/PATCH /api/v1/organization/welcome-config — Organization.welcome_*.
  Memory link: project_friend_invite_test_config.md + reference_greeting_template_vars.md.
-->
<template>
  <div class="wm-page">
    <header class="wm-head">
      <h1>💌 Tin nhắn chào mừng tự động</h1>
      <p class="wm-sub">
        Tin nhắn gửi <b>NGAY sau khi gửi lời mời kết bạn</b> (không đợi đồng ý). Mục đích:
        kiểm tra khách có cho phép nhận tin từ người lạ không, để quyết định có gắn vào
        <b>luồng bám đuổi</b> hay không.
      </p>
    </header>

    <div v-if="loading" class="wm-loading">Đang tải...</div>

    <template v-else>
      <!-- Kill switch -->
      <section class="wm-card">
        <div class="wm-toggle-row">
          <div>
            <h3>Bật tính năng gửi tin chào mừng</h3>
            <p class="wm-detail">
              Tắt = chỉ gửi lời mời kết bạn, không gửi tin chào mừng vào hộp người lạ.
            </p>
          </div>
          <label class="wm-switch">
            <input type="checkbox" v-model="form.welcomeStrangerInboxEnabled" />
            <span class="wm-slider"></span>
          </label>
        </div>
      </section>

      <!-- Template -->
      <section class="wm-card">
        <h3>📝 Mẫu tin chào mừng</h3>
        <p class="wm-detail">
          Hỗ trợ 3 biến — bấm để chèn nhanh:
        </p>
        <div class="wm-chips">
          <button type="button" class="wm-chip" @click="insertVar('{gender}')">
            <code>{gender}</code> → Anh / Chị / AnhChị
          </button>
          <button type="button" class="wm-chip" @click="insertVar('{name}')">
            <code>{name}</code> → Tên khách
          </button>
          <button type="button" class="wm-chip" @click="insertVar('{sale}')">
            <code>{sale}</code> → Tên sale (chữ cuối họ tên)
          </button>
        </div>
        <textarea
          ref="templateRef"
          v-model="form.welcomeMessageTemplate"
          rows="5"
          maxlength="4000"
          class="wm-textarea"
          placeholder="Vd: Chào {gender} {name}, em {sale} bên dự án đây ạ. Em vừa kết nối Zalo với {gender}, có gì {gender} hỗ trợ em nhé."
        />
        <small class="wm-hint">Tối đa 4000 ký tự. Để trống = không gửi tin.</small>
      </section>

      <!-- Live preview -->
      <section class="wm-card wm-card-preview">
        <h3>👀 Xem trước</h3>
        <p class="wm-detail">Render với mock data: khách là <b>Chị Linh</b>, sale là <b>Thành</b>.</p>
        <div class="wm-preview">
          <div class="wm-preview-bubble">
            <pre>{{ preview || '(Mẫu trống — bạn cần nhập nội dung phía trên)' }}</pre>
          </div>
        </div>
      </section>

      <!-- Timing + retry -->
      <section class="wm-card">
        <h3>⏱ Thời gian & thử lại</h3>
        <div class="wm-grid">
          <label class="wm-field">
            <span>Trễ sau khi gửi lời mời (giây)</span>
            <input type="number" min="0" max="3600" v-model.number="form.welcomeDelayAfterFriendReqSec" />
            <small>Default 60s. Quá ngắn → Zalo nghi spam.</small>
          </label>
          <label class="wm-field">
            <span>Số lần thử lại khi fail</span>
            <input type="number" min="0" max="10" v-model.number="form.welcomeMaxRetries" />
            <small>Default 2 lần. Sau N lần fail → ghi nhận lỗi vĩnh viễn.</small>
          </label>
        </div>
      </section>

      <!-- Hard fail behavior -->
      <section class="wm-card">
        <div class="wm-toggle-row">
          <div>
            <h3>Dừng luồng nếu chặn người lạ</h3>
            <p class="wm-detail">
              Bật = nếu Zalo trả lỗi "không cho phép nhận tin từ người lạ" → KH không vào sequence.
              Tắt = vẫn gắn KH vào sequence dù tin chào mừng fail.
            </p>
          </div>
          <label class="wm-switch">
            <input type="checkbox" v-model="form.welcomeHardFailStops" />
            <span class="wm-slider"></span>
          </label>
        </div>
      </section>

      <!-- Action -->
      <div class="wm-actions">
        <button type="button" class="wm-btn-save" :disabled="saving" @click="onSave">
          {{ saving ? 'Đang lưu...' : '💾 Lưu' }}
        </button>
        <div v-if="saveStatus === 'saved'" class="wm-toast wm-toast-ok">✓ Đã lưu</div>
        <div v-if="saveStatus === 'error'" class="wm-toast wm-toast-err">⚠ {{ saveError }}</div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/index';

const loading = ref(true);
const saving = ref(false);
const saveStatus = ref<'' | 'saved' | 'error'>('');
const saveError = ref('');
const templateRef = ref<HTMLTextAreaElement | null>(null);

const form = ref({
  welcomeMessageTemplate: '' as string,
  welcomeDelayAfterFriendReqSec: 60,
  welcomeMaxRetries: 2,
  welcomeStrangerInboxEnabled: true,
  welcomeHardFailStops: true,
});

const preview = computed(() => {
  const tpl = form.value.welcomeMessageTemplate || '';
  return tpl
    .replace(/\{gender\}/g, 'Chị')
    .replace(/\{name\}/g, 'Linh')
    .replace(/\{sale\}/g, 'Thành');
});

function insertVar(token: string) {
  const ta = templateRef.value;
  if (!ta) {
    form.value.welcomeMessageTemplate = (form.value.welcomeMessageTemplate || '') + token;
    return;
  }
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? 0;
  const current = form.value.welcomeMessageTemplate || '';
  form.value.welcomeMessageTemplate = current.slice(0, start) + token + current.slice(end);
  // Đặt lại con trỏ sau token vừa chèn
  requestAnimationFrame(() => {
    ta.focus();
    const pos = start + token.length;
    ta.setSelectionRange(pos, pos);
  });
}

async function fetchConfig() {
  loading.value = true;
  try {
    const { data } = await api.get('/organization/welcome-config');
    form.value = {
      welcomeMessageTemplate: data.welcomeMessageTemplate ?? '',
      welcomeDelayAfterFriendReqSec: data.welcomeDelayAfterFriendReqSec ?? 60,
      welcomeMaxRetries: data.welcomeMaxRetries ?? 2,
      welcomeStrangerInboxEnabled: data.welcomeStrangerInboxEnabled ?? true,
      welcomeHardFailStops: data.welcomeHardFailStops ?? true,
    };
  } catch (err: any) {
    saveStatus.value = 'error';
    saveError.value = err?.response?.data?.error || 'Tải cấu hình thất bại';
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  saving.value = true;
  saveStatus.value = '';
  try {
    const payload = {
      welcomeMessageTemplate: form.value.welcomeMessageTemplate?.trim() || null,
      welcomeDelayAfterFriendReqSec: form.value.welcomeDelayAfterFriendReqSec,
      welcomeMaxRetries: form.value.welcomeMaxRetries,
      welcomeStrangerInboxEnabled: form.value.welcomeStrangerInboxEnabled,
      welcomeHardFailStops: form.value.welcomeHardFailStops,
    };
    await api.patch('/organization/welcome-config', payload);
    saveStatus.value = 'saved';
    setTimeout(() => { saveStatus.value = ''; }, 2000);
  } catch (err: any) {
    saveStatus.value = 'error';
    saveError.value = err?.response?.data?.error || 'Lưu thất bại';
  } finally {
    saving.value = false;
  }
}

onMounted(fetchConfig);
</script>

<style scoped>
.wm-page { max-width: 880px; margin: 0 auto; }
.wm-head { margin-bottom: 20px; }
.wm-head h1 { font-size: 20px; margin: 0 0 6px; color: #1F2D3D; }
.wm-sub { font-size: 13px; color: #6B7785; line-height: 1.55; margin: 0; }
.wm-loading { padding: 40px; text-align: center; color: #97A0AC; }

.wm-card {
  background: white;
  border: 1px solid #E4E5E9;
  border-radius: 8px;
  padding: 18px 20px;
  margin-bottom: 14px;
}
.wm-card h3 {
  font-size: 14px; font-weight: 600; color: #1F2D3D;
  margin: 0 0 8px;
}
.wm-detail { font-size: 12.5px; color: #6B7785; line-height: 1.5; margin: 0 0 10px; }
.wm-hint { font-size: 11.5px; color: #97A0AC; display: block; margin-top: 6px; }

.wm-toggle-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
}
.wm-toggle-row > div { flex: 1; }
.wm-toggle-row h3 { margin: 0 0 4px; }
.wm-toggle-row p { margin: 0; }

.wm-switch { position: relative; display: inline-block; width: 42px; height: 24px; flex-shrink: 0; }
.wm-switch input { opacity: 0; width: 0; height: 0; }
.wm-slider {
  position: absolute; cursor: pointer; inset: 0;
  background: #D4D6DB; border-radius: 24px; transition: 0.2s;
}
.wm-slider::before {
  content: ""; position: absolute; height: 18px; width: 18px;
  left: 3px; top: 3px; background: white; border-radius: 50%; transition: 0.2s;
}
.wm-switch input:checked + .wm-slider { background: #5E6AD2; }
.wm-switch input:checked + .wm-slider::before { transform: translateX(18px); }

.wm-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.wm-chip {
  display: inline-flex; align-items: center; gap: 6px;
  background: #EEF0FF; border: 1px solid #C7CCEC; color: #5E6AD2;
  border-radius: 16px; padding: 5px 12px; font-size: 12px; cursor: pointer;
  font-family: inherit;
}
.wm-chip:hover { background: #DEE2FF; }
.wm-chip code {
  font-size: 11.5px; background: white; padding: 1px 5px; border-radius: 3px;
  color: #2D3454; border: 1px solid #C7CCEC;
}

.wm-textarea {
  width: 100%; box-sizing: border-box;
  border: 1px solid #E4E5E9; border-radius: 6px;
  padding: 10px 12px; font-family: inherit; font-size: 13px;
  color: #1F2D3D; resize: vertical; min-height: 110px;
}
.wm-textarea:focus { outline: none; border-color: #5E6AD2; box-shadow: 0 0 0 2px rgba(94,106,210,0.12); }

.wm-card-preview { background: #F8FAFB; border-style: dashed; }
.wm-preview-bubble {
  background: #DCEEFD; border-radius: 12px; padding: 12px 14px;
  max-width: 75%; color: #1F2D3D; font-size: 13px;
}
.wm-preview-bubble pre {
  margin: 0; font-family: inherit; white-space: pre-wrap; word-break: break-word;
}

.wm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.wm-field { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: #1F2D3D; }
.wm-field input {
  border: 1px solid #E4E5E9; border-radius: 6px; padding: 7px 10px;
  font-family: inherit; font-size: 13px;
}
.wm-field input:focus { outline: none; border-color: #5E6AD2; }
.wm-field small { color: #97A0AC; font-size: 11.5px; }

.wm-actions { display: flex; align-items: center; gap: 12px; margin-top: 18px; }
.wm-btn-save {
  background: #5E6AD2; color: white; border: none; border-radius: 6px;
  padding: 9px 22px; font-size: 13px; font-weight: 600; cursor: pointer;
  font-family: inherit;
}
.wm-btn-save:hover:not(:disabled) { background: #4D58BD; }
.wm-btn-save:disabled { opacity: 0.6; cursor: not-allowed; }

.wm-toast { padding: 6px 12px; border-radius: 6px; font-size: 12.5px; }
.wm-toast-ok { background: #DCFCE7; color: #166534; }
.wm-toast-err { background: #FEE2E2; color: #991B1B; }
</style>
