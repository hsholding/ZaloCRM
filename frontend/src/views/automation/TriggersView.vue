<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h2 class="text-h6">Kịch bản (Triggers)</h2>
      <v-spacer />
      <v-btn-toggle v-model="tab" mandatory variant="outlined" density="comfortable">
        <v-btn value="configured">Đã cấu hình ({{ configured.length }})</v-btn>
        <v-btn value="catalog">Catalog</v-btn>
      </v-btn-toggle>
    </div>

    <!-- Catalog cards -->
    <div v-if="tab === 'catalog'">
      <v-text-field v-model="catalogSearch" placeholder="Tìm trigger..." variant="outlined" density="compact" prepend-inner-icon="mdi-magnify" hide-details class="mb-3" />

      <div class="d-grid" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; display: grid;">
        <v-card v-for="entry in filteredCatalog" :key="entry.eventType" variant="outlined" class="catalog-card">
          <v-card-text>
            <div class="d-flex align-center mb-2">
              <v-icon :icon="iconForEvent(entry.eventType)" class="mr-2" />
              <span class="text-subtitle-2">{{ entry.title }}</span>
            </div>
            <div class="text-body-2 text-medium-emphasis mb-3" style="min-height: 40px;">{{ entry.description }}</div>
            <div class="d-flex align-center">
              <v-chip size="x-small" variant="tonal" class="mr-1">{{ bindingLabel(entry.recommendedBinding) }}</v-chip>
              <v-spacer />
              <v-btn size="small" color="primary" variant="tonal" @click="openCreateFromCatalog(entry)">Khởi tạo</v-btn>
            </div>
          </v-card-text>
        </v-card>
      </div>
    </div>

    <!-- Configured triggers list -->
    <div v-else>
      <v-card>
        <v-table>
          <thead>
            <tr>
              <th>Tên</th>
              <th style="width: 200px">Event type</th>
              <th style="width: 140px">Bind tới</th>
              <th style="width: 100px">Enabled</th>
              <th style="width: 200px">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="5" class="text-center pa-4"><v-progress-circular indeterminate size="24" /></td>
            </tr>
            <tr v-else-if="configured.length === 0">
              <td colspan="5" class="text-center text-medium-emphasis pa-4">
                Chưa có trigger nào. Vào tab "Catalog" để tạo.
              </td>
            </tr>
            <tr v-for="trig in configured" :key="trig.id">
              <td>{{ trig.name }}</td>
              <td>
                <v-chip size="x-small" variant="tonal">{{ trig.eventType }}</v-chip>
              </td>
              <td>
                <span v-if="trig.sequence" class="text-caption">→ {{ trig.sequence.name }}</span>
                <span v-else-if="trig.broadcast" class="text-caption">→ {{ trig.broadcast.name }}</span>
                <span v-else-if="trig.blockId" class="text-caption">→ Block</span>
                <span v-else class="text-caption text-error">⚠ chưa bind</span>
              </td>
              <td>
                <v-switch
                  :model-value="trig.enabled"
                  hide-details density="compact"
                  @update:model-value="toggleTrigger(trig)"
                />
              </td>
              <td>
                <v-btn icon size="small" variant="text" @click="openEdit(trig)"><v-icon size="small">mdi-pencil</v-icon></v-btn>
                <v-btn icon size="small" variant="text" color="primary" :disabled="!trig.enabled" @click="onManualRun(trig)">
                  <v-icon size="small">mdi-play</v-icon>
                  <v-tooltip activator="parent">Chạy thủ công</v-tooltip>
                </v-btn>
                <v-btn icon size="small" variant="text" color="error" @click="onDelete(trig)"><v-icon size="small">mdi-delete</v-icon></v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </div>

    <!-- Editor dialog -->
    <v-dialog v-model="editorOpen" max-width="640" persistent>
      <v-card v-if="draft">
        <v-card-title>{{ draft.id ? 'Sửa Trigger' : 'Tạo Trigger' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="draft.name" label="Tên" variant="outlined" density="comfortable" class="mb-2" />

          <v-select
            v-model="draft.eventType"
            :items="eventTypeItems"
            label="Event type"
            variant="outlined"
            density="comfortable"
            class="mb-2"
          />

          <v-select
            v-model="draft.bindingKind"
            :items="[
              { value: 'sequence', title: 'Sequence (multi-step flow)' },
              { value: 'block', title: 'Block (1 action)' },
              { value: 'broadcast', title: 'Broadcast (mass send — phase F)', props: { disabled: true } },
            ]"
            label="Bind tới"
            variant="outlined"
            density="comfortable"
            class="mb-2"
          />

          <v-select
            v-if="draft.bindingKind === 'sequence'"
            v-model="draft.sequenceId"
            :items="sequenceOptions"
            label="Sequence"
            variant="outlined"
            density="comfortable"
            class="mb-2"
          />
          <v-select
            v-if="draft.bindingKind === 'block'"
            v-model="draft.blockId"
            :items="blockOptions"
            label="Block"
            variant="outlined"
            density="comfortable"
            class="mb-2"
          />

          <v-switch v-model="draft.enabled" label="Bật trigger ngay" hide-details />

          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">{{ error }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="editorOpen = false">Huỷ</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveTrigger">Lưu</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { triggersApi, sequencesApi, blocksApi } from '@/api/automation';
import type { AutomationTrigger, TriggerCatalogEntry, AutomationSequence, Block, TriggerEventType, TriggerBindingKind } from '@/api/automation/types';

const tab = ref<'configured' | 'catalog'>('configured');
const catalog = ref<TriggerCatalogEntry[]>([]);
const configured = ref<AutomationTrigger[]>([]);
const sequences = ref<AutomationSequence[]>([]);
const blocks = ref<Block[]>([]);
const loading = ref(true);
const catalogSearch = ref('');

const editorOpen = ref(false);
const saving = ref(false);
const error = ref('');

interface Draft {
  id: string | null;
  name: string;
  eventType: TriggerEventType;
  bindingKind: TriggerBindingKind;
  sequenceId: string | null;
  blockId: string | null;
  broadcastId: string | null;
  enabled: boolean;
}
const draft = ref<Draft | null>(null);

const filteredCatalog = computed(() => {
  const q = catalogSearch.value.trim().toLowerCase();
  if (!q) return catalog.value;
  return catalog.value.filter((c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
});

const eventTypeItems = computed(() =>
  catalog.value.map((c) => ({ value: c.eventType, title: `${c.title} (${c.eventType})` })),
);

const sequenceOptions = computed(() =>
  sequences.value.filter((s) => s.enabled).map((s) => ({ value: s.id, title: s.name })),
);

const blockOptions = computed(() =>
  blocks.value.filter((b) => !b.archivedAt).map((b) => ({ value: b.id, title: b.name })),
);

const eventIconMap: Record<string, string> = {
  friendship_accepted: 'mdi-account-check',
  friendship_received: 'mdi-account-question',
  first_message_received: 'mdi-message-text',
  keyword_match: 'mdi-text-search',
  contact_created: 'mdi-account-plus',
  contact_status_changed: 'mdi-tag-arrow-right',
  contact_imported: 'mdi-file-import',
  birthday: 'mdi-cake-variant',
  scheduled_cron: 'mdi-clock',
  order_success: 'mdi-cart-check',
  manual_run: 'mdi-gesture-tap',
};
function iconForEvent(t: string): string { return eventIconMap[t] ?? 'mdi-flash'; }

function bindingLabel(b: string): string {
  return { sequence: 'Sequence', block: 'Block', broadcast: 'Broadcast' }[b] ?? b;
}

async function loadAll() {
  loading.value = true;
  try {
    const [cat, conf, seqs, blks] = await Promise.all([
      triggersApi.listTriggerCatalog(),
      triggersApi.listTriggers(),
      sequencesApi.listSequences(),
      blocksApi.listBlocks({ limit: 500 }),
    ]);
    catalog.value = cat;
    configured.value = conf;
    sequences.value = seqs;
    blocks.value = blks;
  } finally {
    loading.value = false;
  }
}

onMounted(loadAll);

function openCreateFromCatalog(entry: TriggerCatalogEntry) {
  draft.value = {
    id: null,
    name: entry.title,
    eventType: entry.eventType,
    bindingKind: entry.recommendedBinding === 'broadcast' ? 'sequence' : entry.recommendedBinding,
    sequenceId: null,
    blockId: null,
    broadcastId: null,
    enabled: false,
  };
  error.value = '';
  editorOpen.value = true;
  tab.value = 'configured'; // pre-switch so on save user sees the new entry
}

function openEdit(trig: AutomationTrigger) {
  draft.value = {
    id: trig.id,
    name: trig.name,
    eventType: trig.eventType,
    bindingKind: trig.bindingKind,
    sequenceId: trig.sequenceId,
    blockId: trig.blockId,
    broadcastId: trig.broadcastId,
    enabled: trig.enabled,
  };
  error.value = '';
  editorOpen.value = true;
}

async function saveTrigger() {
  if (!draft.value) return;
  error.value = '';
  if (!draft.value.name.trim()) { error.value = 'Tên không rỗng'; return; }
  saving.value = true;
  try {
    const payload = {
      name: draft.value.name.trim(),
      eventType: draft.value.eventType,
      bindingKind: draft.value.bindingKind,
      sequenceId: draft.value.bindingKind === 'sequence' ? draft.value.sequenceId : null,
      blockId: draft.value.bindingKind === 'block' ? draft.value.blockId : null,
      broadcastId: draft.value.bindingKind === 'broadcast' ? draft.value.broadcastId : null,
      enabled: draft.value.enabled,
    };
    if (draft.value.id) {
      await triggersApi.updateTrigger(draft.value.id, payload);
    } else {
      await triggersApi.createTrigger(payload);
    }
    editorOpen.value = false;
    await loadAll();
  } catch (err: any) {
    error.value = err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Lỗi';
  } finally {
    saving.value = false;
  }
}

async function toggleTrigger(trig: AutomationTrigger) {
  if (trig.enabled) await triggersApi.disableTrigger(trig.id);
  else              await triggersApi.enableTrigger(trig.id);
  await loadAll();
}

async function onManualRun(trig: AutomationTrigger) {
  const contactId = prompt(`Chạy "${trig.name}" cho contactId nào? (để trống dùng segmentSpec)`);
  if (contactId === null) return;
  try {
    await triggersApi.runTrigger(trig.id, contactId ? { contactId } : {});
    alert('Event đã emit. Engine sẽ tạo task async (worker poll 10s/lần).');
  } catch (err: any) {
    alert('Lỗi: ' + (err?.response?.data?.error ?? err?.message));
  }
}

async function onDelete(trig: AutomationTrigger) {
  if (!confirm(`Xoá trigger "${trig.name}"?`)) return;
  try {
    await triggersApi.deleteTrigger(trig.id);
    await loadAll();
  } catch (err: any) {
    alert(err?.response?.data?.detail || err?.response?.data?.error || 'Không xoá được');
  }
}
</script>

<style scoped>
.catalog-card {
  transition: transform 0.1s;
}
.catalog-card:hover {
  transform: translateY(-2px);
}
</style>
