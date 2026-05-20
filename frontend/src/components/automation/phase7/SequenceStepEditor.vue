<template>
  <div class="sequence-step-editor">
    <!-- START node -->
    <div class="step-node start-node mb-1">
      <v-icon class="mr-2" color="success">mdi-play-circle</v-icon>
      <span class="text-subtitle-2">Bắt đầu (KH được enroll)</span>
    </div>

    <!-- Steps with delay arrows -->
    <template v-for="(step, idx) in steps" :key="step.stepId">
      <!-- Delay arrow above this step (delay BEFORE this step runs) -->
      <div class="delay-arrow d-flex align-center justify-center">
        <v-icon size="small" class="mr-1">mdi-clock-outline</v-icon>
        <v-text-field
          :model-value="step.delayMinutes"
          @update:model-value="updateDelay(idx, $event)"
          variant="plain"
          density="compact"
          type="number"
          min="0"
          hide-details
          style="max-width: 90px;"
        />
        <span class="text-caption ml-1">phút</span>
      </div>

      <!-- Step card -->
      <v-card class="step-card" variant="outlined">
        <v-card-text class="d-flex align-center py-2">
          <v-icon class="mr-3">{{ blockIcon(step.blockId) }}</v-icon>
          <div class="flex-grow-1">
            <div class="text-caption text-medium-emphasis">Bước {{ idx + 1 }}</div>
            <div class="text-body-2 font-weight-medium">{{ blockName(step.blockId) }}</div>
            <div class="text-caption text-medium-emphasis">
              {{ ACTION_TYPE_LABELS[blockActionType(step.blockId)] }}
              <span v-if="blockArchived(step.blockId)" class="text-error ml-1">(archived — sẽ skip)</span>
            </div>
          </div>
          <v-btn icon size="small" variant="text" :disabled="idx === 0" @click="moveUp(idx)">
            <v-icon size="small">mdi-arrow-up</v-icon>
          </v-btn>
          <v-btn icon size="small" variant="text" :disabled="idx === steps.length - 1" @click="moveDown(idx)">
            <v-icon size="small">mdi-arrow-down</v-icon>
          </v-btn>
          <v-btn icon size="small" variant="text" @click="editStep(idx)">
            <v-icon size="small">mdi-pencil</v-icon>
          </v-btn>
          <v-btn icon size="small" variant="text" color="error" @click="removeStep(idx)">
            <v-icon size="small">mdi-close</v-icon>
          </v-btn>
        </v-card-text>
      </v-card>
    </template>

    <!-- END node -->
    <div v-if="steps.length > 0" class="step-node end-node mt-1">
      <v-icon class="mr-2" color="grey">mdi-stop-circle</v-icon>
      <span class="text-caption text-medium-emphasis">Kết thúc flow</span>
    </div>

    <!-- Add step button -->
    <div class="text-center mt-3">
      <v-btn variant="tonal" prepend-icon="mdi-plus" @click="addStep">Thêm bước</v-btn>
    </div>

    <!-- Block picker dialog -->
    <v-dialog v-model="pickerOpen" max-width="600">
      <v-card>
        <v-card-title>Chọn block cho bước {{ pickerStepIdx !== null ? pickerStepIdx + 1 : '' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="pickerSearch" placeholder="Tìm block..." variant="outlined" density="compact" prepend-inner-icon="mdi-magnify" clearable />
          <v-text-field
            v-if="pickerStepIdx !== null"
            :model-value="steps[pickerStepIdx].delayMinutes"
            @update:model-value="updateDelay(pickerStepIdx, $event)"
            type="number" min="0"
            label="Delay trước bước này (phút)"
            variant="outlined" density="compact"
            class="mt-2"
          />
          <v-list density="compact" class="block-picker-list" style="max-height: 360px; overflow-y: auto;">
            <v-list-item
              v-for="block in filteredPickerBlocks"
              :key="block.id"
              @click="pickBlock(block.id)"
              rounded="lg"
            >
              <template #prepend>
                <v-icon :icon="ACTION_TYPE_ICONS[block.actionType]" />
              </template>
              <v-list-item-title>{{ block.name }}</v-list-item-title>
              <v-list-item-subtitle>{{ ACTION_TYPE_LABELS[block.actionType] }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="pickerOpen = false">Huỷ</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ACTION_TYPE_LABELS, ACTION_TYPE_ICONS, type SequenceStep, type Block, type BlockActionType } from '@/api/automation/types';

const props = defineProps<{
  steps: SequenceStep[];
  availableBlocks: Block[];
}>();
const emit = defineEmits<{ 'update:steps': [SequenceStep[]] }>();

const pickerOpen = ref(false);
const pickerStepIdx = ref<number | null>(null);
const pickerSearch = ref('');

const blockMap = computed(() => {
  const m = new Map<string, Block>();
  for (const b of props.availableBlocks) m.set(b.id, b);
  return m;
});

function blockName(id: string): string { return blockMap.value.get(id)?.name ?? '⚠ Block đã xoá'; }
function blockIcon(id: string): string {
  const b = blockMap.value.get(id);
  return b ? ACTION_TYPE_ICONS[b.actionType] : 'mdi-help-circle-outline';
}
function blockActionType(id: string): BlockActionType {
  return blockMap.value.get(id)?.actionType ?? 'send_message';
}
function blockArchived(id: string): boolean {
  return Boolean(blockMap.value.get(id)?.archivedAt);
}

const filteredPickerBlocks = computed(() => {
  const q = pickerSearch.value.trim().toLowerCase();
  return props.availableBlocks.filter((b) => {
    if (b.archivedAt) return false;
    if (!q) return true;
    return b.name.toLowerCase().includes(q) || ACTION_TYPE_LABELS[b.actionType].toLowerCase().includes(q);
  });
});

function emitSteps(newSteps: SequenceStep[]) { emit('update:steps', newSteps); }

function addStep() {
  pickerStepIdx.value = null;
  pickerOpen.value = true;
}
function editStep(idx: number) {
  pickerStepIdx.value = idx;
  pickerOpen.value = true;
}
function pickBlock(blockId: string) {
  if (pickerStepIdx.value === null) {
    // Adding new step at end
    const newStep: SequenceStep = {
      stepId: `s${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      blockId,
      delayMinutes: props.steps.length === 0 ? 0 : 30,
    };
    emitSteps([...props.steps, newStep]);
  } else {
    // Editing existing step's block
    const newSteps = [...props.steps];
    newSteps[pickerStepIdx.value] = { ...newSteps[pickerStepIdx.value], blockId };
    emitSteps(newSteps);
  }
  pickerOpen.value = false;
}
function updateDelay(idx: number, value: string | number) {
  const newSteps = [...props.steps];
  const n = Math.max(0, Number(value) || 0);
  newSteps[idx] = { ...newSteps[idx], delayMinutes: n };
  emitSteps(newSteps);
}
function moveUp(idx: number) {
  if (idx === 0) return;
  const newSteps = [...props.steps];
  [newSteps[idx - 1], newSteps[idx]] = [newSteps[idx], newSteps[idx - 1]];
  emitSteps(newSteps);
}
function moveDown(idx: number) {
  if (idx === props.steps.length - 1) return;
  const newSteps = [...props.steps];
  [newSteps[idx + 1], newSteps[idx]] = [newSteps[idx], newSteps[idx + 1]];
  emitSteps(newSteps);
}
function removeStep(idx: number) {
  if (!confirm('Xoá bước này?')) return;
  emitSteps(props.steps.filter((_, i) => i !== idx));
}
</script>

<style scoped>
.step-node {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  max-width: 320px;
  margin: 0 auto;
}
.delay-arrow {
  height: 40px;
  position: relative;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.delay-arrow::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(var(--v-theme-on-surface), 0.15);
  transform: translateX(-50%);
  z-index: 0;
}
.delay-arrow > * {
  position: relative;
  z-index: 1;
  background: rgb(var(--v-theme-surface));
  padding: 0 4px;
}
.step-card {
  max-width: 560px;
  margin: 0 auto;
}
</style>
