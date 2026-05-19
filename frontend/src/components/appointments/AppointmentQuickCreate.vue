<template>
  <Teleport to="body">
    <div v-if="modelValue" class="qc-backdrop" @click.self="close">
      <div class="qc" @keydown.escape="close" @keydown.ctrl.enter="submit">
        <div class="qc-head">
          <span class="qc-icon">＋</span>
          <h3>Tạo lịch hẹn nhanh</h3>
          <span class="qc-hint">⌨ Ctrl+Enter để lưu</span>
          <button class="qc-close" @click="close">✕</button>
        </div>

        <div class="qc-body">
          <!-- Customer search -->
          <div class="qc-field">
            <label>👤 Khách hàng</label>
            <div class="cust-search">
              <input
                ref="custInputRef"
                v-model="custQuery"
                class="qc-input"
                :class="{ resolved: !!selectedContact }"
                :placeholder="selectedContact ? '' : 'Tìm theo tên, SĐT, Zalo nick...'"
                autocomplete="off"
                @focus="suggestOpen = true"
                @blur="onBlurSuggest"
                @input="onSearchInput"
              />
              <button v-if="selectedContact" class="clear-btn" @click="clearContact">✕</button>
              <div v-if="suggestOpen && !selectedContact" class="cust-suggest">
                <div v-if="searching" class="suggest-loading">Đang tìm...</div>
                <div
                  v-for="c in suggestions"
                  :key="c.id"
                  class="suggest-item"
                  @mousedown.prevent="pickContact(c)"
                >
                  <div class="av">{{ initials(c.fullName) }}</div>
                  <div class="info">
                    <div class="name">{{ c.fullName || 'Khách hàng' }}</div>
                    <div class="sub">
                      <span v-if="c.phone">{{ c.phone }}</span>
                      <span v-if="c.zaloUid"> · {{ c.zaloUid }}</span>
                    </div>
                  </div>
                </div>
                <div v-if="!searching && custQuery && !suggestions.length" class="suggest-empty">
                  Không tìm thấy KH "{{ custQuery }}"
                </div>
              </div>
            </div>
          </div>

          <!-- Date / Time / Duration -->
          <div class="qc-row">
            <div class="qc-field">
              <label>📅 Ngày</label>
              <input v-model="form.date" class="qc-input" type="date" />
            </div>
            <div class="qc-field">
              <label>⏰ Giờ</label>
              <input v-model="form.time" class="qc-input" type="time" />
            </div>
            <div class="qc-field">
              <label>⏱ Dài</label>
              <select v-model="form.durationMin" class="qc-select">
                <option :value="15">15 phút</option>
                <option :value="30">30 phút</option>
                <option :value="45">45 phút</option>
                <option :value="60">1 giờ</option>
                <option :value="120">2 giờ</option>
              </select>
            </div>
          </div>

          <!-- Type -->
          <div class="qc-row">
            <div class="qc-field">
              <label>🎯 Loại</label>
              <select v-model="form.type" class="qc-select">
                <option v-for="opt in APPOINTMENT_TYPE_OPTIONS" :key="opt.value" :value="opt.value">
                  {{ typeIcon(opt.value) }} {{ opt.text }}
                </option>
              </select>
            </div>
          </div>

          <!-- Notes -->
          <div class="qc-field">
            <label>📝 Ghi chú</label>
            <input v-model="form.notes" class="qc-input" placeholder="Chủ đề, link, địa chỉ..." />
          </div>

          <div v-if="error" class="qc-error">{{ error }}</div>
        </div>

        <div class="qc-foot">
          <span class="foot-spacer" />
          <button class="qc-btn" @click="close">Huỷ</button>
          <button class="qc-btn primary" :disabled="!canSubmit || saving" @click="submit">
            <span v-if="saving">Đang lưu…</span>
            <span v-else>＋ Tạo lịch hẹn</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick, computed } from 'vue';
import { api } from '@/api';
import {
  APPOINTMENT_TYPE_OPTIONS,
  typeIcon,
  initials,
  type AppointmentEx as Appointment,
} from '@/composables/appointment-helpers';

interface ContactLite {
  id: string;
  fullName: string | null;
  phone: string | null;
  zaloUid?: string | null;
}

const props = defineProps<{
  modelValue: boolean;
  defaultDate?: Date | null;
  prefillContact?: ContactLite | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'created', a: Appointment): void;
}>();

const custInputRef = ref<HTMLInputElement | null>(null);
const custQuery = ref('');
const suggestOpen = ref(false);
const searching = ref(false);
const suggestions = ref<ContactLite[]>([]);
const selectedContact = ref<ContactLite | null>(null);

const saving = ref(false);
const error = ref('');

const form = reactive({
  date: '',
  time: '',
  durationMin: 30,
  type: 'consultation',
  notes: '',
});

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

watch(() => props.modelValue, (open) => {
  if (open) {
    const base = props.defaultDate || roundToNextHalf(new Date());
    form.date = isoDate(base);
    form.time = isoTime(base);
    form.durationMin = 30;
    form.type = 'consultation';
    form.notes = '';
    error.value = '';
    if (props.prefillContact) {
      selectedContact.value = props.prefillContact;
      custQuery.value = props.prefillContact.fullName || '';
    } else {
      selectedContact.value = null;
      custQuery.value = '';
    }
    nextTick(() => { custInputRef.value?.focus(); });
  } else {
    suggestOpen.value = false;
  }
});

function roundToNextHalf(d: Date): Date {
  const out = new Date(d);
  out.setSeconds(0, 0);
  const m = out.getMinutes();
  if (m === 0 || m === 30) return out;
  out.setMinutes(m < 30 ? 30 : 0);
  if (m >= 30) out.setHours(out.getHours() + 1);
  return out;
}

let searchHandle: number | null = null;
function onSearchInput() {
  if (searchHandle) window.clearTimeout(searchHandle);
  const q = custQuery.value.trim();
  if (!q) { suggestions.value = []; return; }
  searching.value = true;
  searchHandle = window.setTimeout(async () => {
    try {
      const res = await api.get('/contacts', { params: { search: q, limit: 8 } });
      const list = (res.data.contacts ?? res.data ?? []) as ContactLite[];
      suggestions.value = list.slice(0, 8);
    } catch (err) {
      console.error('contact search failed', err);
      suggestions.value = [];
    } finally {
      searching.value = false;
    }
  }, 220);
}

function pickContact(c: ContactLite) {
  selectedContact.value = c;
  custQuery.value = c.fullName || c.phone || '';
  suggestOpen.value = false;
}

function clearContact() {
  selectedContact.value = null;
  custQuery.value = '';
  nextTick(() => custInputRef.value?.focus());
}

function onBlurSuggest() {
  // Defer to allow mousedown→pick to fire
  setTimeout(() => { suggestOpen.value = false; }, 160);
}

const canSubmit = computed(() => !!selectedContact.value && !!form.date && !!form.time);

async function submit() {
  if (!canSubmit.value) {
    error.value = 'Chọn khách hàng và điền ngày giờ';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const res = await api.post('/appointments', {
      contactId: selectedContact.value!.id,
      appointmentDate: form.date,
      appointmentTime: form.time,
      type: form.type,
      notes: form.notes || null,
      durationMin: form.durationMin,
    });
    emit('created', res.data);
    close();
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Không tạo được lịch hẹn';
  } finally {
    saving.value = false;
  }
}

function close() {
  emit('update:modelValue', false);
}
</script>

<style scoped>
.qc-backdrop {
  position: fixed; inset: 0;
  background: rgba(15,20,25,.45);
  z-index: 60;
  display: grid; place-items: center;
  backdrop-filter: blur(2px);
  animation: fade .12s ease;
}
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }

.qc {
  width: 480px; max-width: 92vw;
  background: #fff; border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0,0,0,.25);
  overflow: hidden;
  animation: pop .18s ease;
}
@keyframes pop {
  from { transform: scale(.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.qc-head {
  padding: 14px 18px;
  border-bottom: 1px solid #e4e8ef;
  display: flex; align-items: center; gap: 8px;
}
.qc-icon { font-size: 18px; color: #2f6ee5; font-weight: 700; }
.qc-head h3 { margin: 0; font-size: 15px; font-weight: 700; flex: 1; }
.qc-hint { font-size: 11px; color: #8d96a4; }
.qc-close {
  background: transparent; border: none; font-size: 16px;
  color: #8d96a4; cursor: pointer; width: 24px; height: 24px; border-radius: 4px;
}
.qc-close:hover { background: #f5f7fb; }

.qc-body { padding: 16px 18px; }
.qc-field { margin-bottom: 12px; }
.qc-field label {
  display: block;
  font-size: 11px; color: #8d96a4;
  text-transform: uppercase; letter-spacing: .04em;
  font-weight: 700; margin-bottom: 4px;
}
.qc-input, .qc-select {
  width: 100%; padding: 8px 10px;
  border: 1px solid #cdd4df; border-radius: 8px;
  font-size: 13px; font-family: inherit; background: #fff;
  box-sizing: border-box;
}
.qc-input.resolved { background: #e8f0fe; border-color: #2f6ee5; font-weight: 600; }
.qc-input:focus, .qc-select:focus {
  outline: none; border-color: #2f6ee5;
  box-shadow: 0 0 0 3px rgba(47,110,229,.18);
}

.qc-row { display: flex; gap: 8px; }
.qc-row > * { flex: 1; }

.cust-search { position: relative; }
.cust-search .clear-btn {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  background: rgba(255,255,255,.6); border: none; cursor: pointer;
  width: 22px; height: 22px; border-radius: 50%;
  color: #5b6573; font-size: 12px;
}
.cust-suggest {
  position: absolute; top: 100%; left: 0; right: 0;
  background: #fff; border: 1px solid #e4e8ef; border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,.1);
  margin-top: 4px; max-height: 240px; overflow-y: auto; z-index: 5;
}
.suggest-loading, .suggest-empty {
  padding: 12px; text-align: center; color: #8d96a4; font-size: 12px;
}
.suggest-item {
  display: flex; gap: 10px; padding: 8px 10px;
  align-items: center; cursor: pointer;
  border-bottom: 1px solid #e4e8ef;
}
.suggest-item:last-child { border-bottom: none; }
.suggest-item:hover { background: #f9fafc; }
.suggest-item .av {
  width: 30px; height: 30px; border-radius: 50%;
  background: linear-gradient(135deg, #94a3b8, #64748b);
  color: #fff; display: grid; place-items: center;
  font-weight: 700; font-size: 12px;
}
.suggest-item .info { flex: 1; min-width: 0; }
.suggest-item .info .name { font-size: 13px; font-weight: 600; }
.suggest-item .info .sub { font-size: 11px; color: #8d96a4; }

.qc-error {
  background: #fee2e2; color: #b91c1c;
  padding: 8px 10px; border-radius: 8px;
  font-size: 12px; margin-top: 6px;
}

.qc-foot {
  padding: 12px 18px; background: #f9fafc;
  border-top: 1px solid #e4e8ef;
  display: flex; gap: 6px; align-items: center;
}
.foot-spacer { flex: 1; }
.qc-btn {
  padding: 8px 14px; border-radius: 8px;
  border: 1px solid #cdd4df; background: #fff;
  cursor: pointer; font-size: 13px; font-weight: 600;
}
.qc-btn:hover { background: #f5f7fb; }
.qc-btn.primary {
  background: #2f6ee5; color: #fff; border-color: #2f6ee5;
}
.qc-btn.primary:hover:not(:disabled) { background: #2356b8; }
.qc-btn:disabled { opacity: .5; cursor: not-allowed; }
</style>
