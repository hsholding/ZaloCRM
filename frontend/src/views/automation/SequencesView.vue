<template>
  <div class="d-flex" style="gap: 16px;">
    <!-- Sidebar: sequence list -->
    <div style="width: 280px; flex-shrink: 0;">
      <div class="d-flex align-center mb-2">
        <div class="text-subtitle-1">Kịch bản chăm sóc</div>
        <v-spacer />
        <v-btn icon size="small" variant="text" @click="createNew">
          <v-icon size="small">mdi-plus</v-icon>
          <v-tooltip activator="parent">Tạo sequence</v-tooltip>
        </v-btn>
      </div>

      <v-text-field v-model="search" placeholder="Tìm..." variant="outlined" density="compact" prepend-inner-icon="mdi-magnify" hide-details class="mb-2" />

      <v-list density="compact" nav class="seq-list">
        <v-list-item
          v-for="seq in filteredSequences"
          :key="seq.id"
          :active="seq.id === selectedSeqId"
          @click="selectSequence(seq.id)"
          rounded="lg"
        >
          <v-list-item-title>{{ seq.name }}</v-list-item-title>
          <v-list-item-subtitle>
            <span class="text-caption">{{ seq.steps.length }} bước</span>
            <v-chip v-if="!seq.enabled" size="x-small" color="grey" class="ml-2">tắt</v-chip>
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </div>

    <!-- Main: editor -->
    <div class="flex-grow-1">
      <div v-if="!editing" class="d-flex align-center justify-center" style="height: 60vh;">
        <div class="text-center text-medium-emphasis">
          <v-icon size="64" class="mb-3">mdi-format-list-numbered</v-icon>
          <div>Chọn sequence ở sidebar hoặc tạo mới</div>
        </div>
      </div>

      <div v-else>
        <div class="d-flex align-center mb-3">
          <v-text-field
            v-model="editing.name"
            variant="plain"
            density="compact"
            placeholder="Tên kịch bản..."
            hide-details
            class="text-h6"
            style="max-width: 480px;"
          />
          <v-spacer />
          <v-btn size="small" variant="text" :loading="saving" @click="saveSequence">
            <v-icon start>mdi-content-save</v-icon>
            Lưu
          </v-btn>
          <v-btn
            v-if="editing.id"
            size="small" variant="text"
            :color="editing.enabled ? 'success' : 'grey'"
            @click="toggleEnabled"
          >
            <v-icon start>{{ editing.enabled ? 'mdi-toggle-switch' : 'mdi-toggle-switch-off' }}</v-icon>
            {{ editing.enabled ? 'Đang bật' : 'Đang tắt' }}
          </v-btn>
          <v-btn v-if="editing.id" size="small" variant="text" @click="onDuplicate">
            <v-icon start>mdi-content-copy</v-icon> Nhân bản
          </v-btn>
          <v-btn v-if="editing.id" size="small" variant="text" color="error" @click="onDelete">
            <v-icon start>mdi-delete</v-icon> Xoá
          </v-btn>
        </div>

        <v-textarea
          v-model="editing.description"
          variant="outlined"
          density="compact"
          rows="2"
          placeholder="Mô tả ngắn (optional)"
          hide-details
          class="mb-4"
        />

        <!-- Runtime rules collapsible -->
        <v-expansion-panels variant="accordion" class="mb-4">
          <v-expansion-panel>
            <v-expansion-panel-title>
              <v-icon class="mr-2">mdi-cog</v-icon>
              Cấu hình chạy (delay, giờ, throttle, recency, stop-on-accept)
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <div class="d-flex flex-wrap" style="gap: 16px;">
                <div style="min-width: 240px;">
                  <div class="text-caption mb-1">Giờ được phép chạy</div>
                  <div class="d-flex align-center" style="gap: 8px;">
                    <v-text-field :model-value="hourStart" @update:model-value="setHourStart($event)" type="number" min="0" max="23" variant="outlined" density="compact" hide-details style="width: 80px" />
                    <span>→</span>
                    <v-text-field :model-value="hourEnd" @update:model-value="setHourEnd($event)" type="number" min="0" max="23" variant="outlined" density="compact" hide-details style="width: 80px" />
                  </div>
                </div>
                <div style="min-width: 240px;">
                  <div class="text-caption mb-1">Delay ngẫu nhiên giữa mỗi lần gửi (phút)</div>
                  <div class="d-flex align-center" style="gap: 8px;">
                    <v-text-field :model-value="delayMin" @update:model-value="setDelayMin($event)" type="number" min="0" variant="outlined" density="compact" hide-details style="width: 80px" />
                    <span>→</span>
                    <v-text-field :model-value="delayMax" @update:model-value="setDelayMax($event)" type="number" min="0" variant="outlined" density="compact" hide-details style="width: 80px" />
                  </div>
                </div>
                <div style="min-width: 200px;">
                  <div class="text-caption mb-1">Cross-nick recency (ngày)</div>
                  <v-text-field :model-value="recencyDays" @update:model-value="setRecencyDays($event)" type="number" min="0" variant="outlined" density="compact" hide-details style="width: 120px" />
                  <div class="text-caption text-medium-emphasis mt-1">Bỏ qua nếu KH active với nick khác trong N ngày</div>
                </div>
                <v-switch
                  :model-value="editing.runtimeRules.perNickThrottle ?? true"
                  @update:model-value="editing.runtimeRules.perNickThrottle = !!$event"
                  label="Per-nick throttle (cap chia đều)"
                  hide-details
                />
                <v-switch
                  :model-value="editing.runtimeRules.stopOnAccept ?? true"
                  @update:model-value="editing.runtimeRules.stopOnAccept = !!$event"
                  label="Dừng các nick còn lại khi 1 nick đã accept"
                  hide-details
                />
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>

        <!-- Vertical step diagram -->
        <SequenceStepEditor
          :steps="editing.steps"
          :available-blocks="availableBlocks"
          @update:steps="editing.steps = $event"
        />

        <v-alert v-if="error" type="error" variant="tonal" class="mt-4">{{ error }}</v-alert>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { sequencesApi, blocksApi } from '@/api/automation';
import type { AutomationSequence, SequenceStep, SequenceRuntimeRules, Block } from '@/api/automation/types';
import SequenceStepEditor from '@/components/automation/phase7/SequenceStepEditor.vue';

const sequences = ref<AutomationSequence[]>([]);
const availableBlocks = ref<Block[]>([]);
const selectedSeqId = ref<string | null>(null);
const search = ref('');
const error = ref('');
const saving = ref(false);

interface DraftSequence {
  id: string | null;
  name: string;
  description: string;
  channel: string;
  enabled: boolean;
  steps: SequenceStep[];
  runtimeRules: SequenceRuntimeRules;
}
const editing = ref<DraftSequence | null>(null);

const filteredSequences = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return sequences.value;
  return sequences.value.filter((s) => s.name.toLowerCase().includes(q));
});

const hourStart = computed(() => editing.value?.runtimeRules.allowedHourRange?.[0] ?? 6);
const hourEnd   = computed(() => editing.value?.runtimeRules.allowedHourRange?.[1] ?? 22);
const delayMin  = computed(() => editing.value?.runtimeRules.randomDelayPerSend?.min ?? 15);
const delayMax  = computed(() => editing.value?.runtimeRules.randomDelayPerSend?.max ?? 45);
const recencyDays = computed(() => editing.value?.runtimeRules.crossNickRecencyDays ?? 30);

function setHourStart(v: string | number) {
  if (!editing.value) return;
  editing.value.runtimeRules.allowedHourRange = [Number(v) || 0, hourEnd.value];
}
function setHourEnd(v: string | number) {
  if (!editing.value) return;
  editing.value.runtimeRules.allowedHourRange = [hourStart.value, Number(v) || 0];
}
function setDelayMin(v: string | number) {
  if (!editing.value) return;
  editing.value.runtimeRules.randomDelayPerSend = { min: Number(v) || 0, max: delayMax.value };
}
function setDelayMax(v: string | number) {
  if (!editing.value) return;
  editing.value.runtimeRules.randomDelayPerSend = { min: delayMin.value, max: Number(v) || 0 };
}
function setRecencyDays(v: string | number) {
  if (!editing.value) return;
  editing.value.runtimeRules.crossNickRecencyDays = Number(v) || 0;
}

async function loadAll() {
  const [seqs, blocks] = await Promise.all([
    sequencesApi.listSequences(),
    blocksApi.listBlocks({ limit: 500 }),
  ]);
  sequences.value = seqs;
  availableBlocks.value = blocks;
}

onMounted(loadAll);

function selectSequence(id: string) {
  const seq = sequences.value.find((s) => s.id === id);
  if (!seq) return;
  selectedSeqId.value = id;
  editing.value = {
    id: seq.id,
    name: seq.name,
    description: seq.description ?? '',
    channel: seq.channel,
    enabled: seq.enabled,
    steps: JSON.parse(JSON.stringify(seq.steps)),
    runtimeRules: JSON.parse(JSON.stringify(seq.runtimeRules ?? {})),
  };
  error.value = '';
}

function createNew() {
  selectedSeqId.value = null;
  editing.value = {
    id: null,
    name: '',
    description: '',
    channel: 'zalo_user',
    enabled: false,
    steps: [],
    runtimeRules: {
      allowedHourRange: [6, 22],
      randomDelayPerSend: { min: 15, max: 45 },
      perNickThrottle: true,
      crossNickRecencyDays: 30,
      stopOnAccept: true,
    },
  };
  error.value = '';
}

async function saveSequence() {
  if (!editing.value) return;
  error.value = '';
  if (!editing.value.name.trim()) { error.value = 'Tên không được rỗng'; return; }
  if (editing.value.steps.length === 0) { error.value = 'Cần ít nhất 1 bước'; return; }
  saving.value = true;
  try {
    const input = {
      name: editing.value.name.trim(),
      description: editing.value.description,
      channel: editing.value.channel,
      steps: editing.value.steps,
      runtimeRules: editing.value.runtimeRules,
      enabled: editing.value.enabled,
    };
    let saved: AutomationSequence;
    if (editing.value.id) {
      saved = await sequencesApi.updateSequence(editing.value.id, input);
    } else {
      saved = await sequencesApi.createSequence(input);
    }
    await loadAll();
    selectSequence(saved.id);
  } catch (err: any) {
    error.value = err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Lỗi không xác định';
  } finally {
    saving.value = false;
  }
}

async function toggleEnabled() {
  if (!editing.value?.id) return;
  if (editing.value.enabled) {
    await sequencesApi.disableSequence(editing.value.id);
  } else {
    await sequencesApi.enableSequence(editing.value.id);
  }
  editing.value.enabled = !editing.value.enabled;
  await loadAll();
}

async function onDuplicate() {
  if (!editing.value?.id) return;
  const copy = await sequencesApi.duplicateSequence(editing.value.id);
  await loadAll();
  selectSequence(copy.id);
}

async function onDelete() {
  if (!editing.value?.id) return;
  if (!confirm(`Xoá sequence "${editing.value.name}"? Chỉ được xoá khi chưa có campaign.`)) return;
  try {
    await sequencesApi.deleteSequence(editing.value.id);
    editing.value = null;
    selectedSeqId.value = null;
    await loadAll();
  } catch (err: any) {
    error.value = err?.response?.data?.detail || err?.response?.data?.error || 'Không xoá được';
  }
}
</script>

<style scoped>
.seq-list {
  max-height: calc(100vh - 240px);
  overflow-y: auto;
}
</style>
