<template>
  <div class="d-flex" style="gap: 16px;">
    <!-- Folder sidebar -->
    <div style="width: 260px; flex-shrink: 0;">
      <div class="d-flex align-center mb-2">
        <div class="text-subtitle-1">Thư viện block</div>
        <v-spacer />
        <v-btn icon size="small" variant="text" @click="createFolderInline">
          <v-icon size="small">mdi-folder-plus</v-icon>
          <v-tooltip activator="parent">Tạo folder</v-tooltip>
        </v-btn>
      </div>

      <v-list density="compact" nav class="folder-list">
        <v-list-item
          :active="!selectedFolderId"
          @click="selectedFolderId = null"
          prepend-icon="mdi-format-list-bulleted"
          rounded="lg"
        >
          <v-list-item-title>Tất cả ({{ allCount }})</v-list-item-title>
        </v-list-item>

        <v-list-item
          v-for="folder in folders"
          :key="folder.id"
          :active="selectedFolderId === folder.id"
          @click="selectedFolderId = folder.id"
          prepend-icon="mdi-folder"
          rounded="lg"
        >
          <v-list-item-title>{{ folder.name }}</v-list-item-title>
          <template #append>
            <span class="text-caption text-medium-emphasis">{{ folder._count?.blocks ?? 0 }}</span>
          </template>
        </v-list-item>

        <v-list-item
          :active="showArchived"
          @click="showArchived = !showArchived"
          prepend-icon="mdi-archive"
          rounded="lg"
        >
          <v-list-item-title>Đã archive</v-list-item-title>
        </v-list-item>
      </v-list>
    </div>

    <!-- Main: block list -->
    <div class="flex-grow-1">
      <div class="d-flex align-center mb-3">
        <h2 class="text-h6">{{ selectedFolderName }}</h2>
        <v-spacer />
        <v-select
          v-model="actionTypeFilter"
          :items="actionTypeFilterItems"
          label="Lọc loại action"
          variant="outlined"
          density="compact"
          clearable
          style="max-width: 240px"
          class="mr-2"
          hide-details
        />
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">Tạo Block</v-btn>
      </div>

      <v-card>
        <v-table>
          <thead>
            <tr>
              <th>Tên</th>
              <th style="width: 160px">Loại action</th>
              <th style="width: 100px">Dùng</th>
              <th style="width: 140px">Cập nhật</th>
              <th style="width: 160px">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="5" class="text-center pa-4"><v-progress-circular indeterminate size="24" /></td>
            </tr>
            <tr v-else-if="filteredBlocks.length === 0">
              <td colspan="5" class="text-center text-medium-emphasis pa-4">Chưa có block nào</td>
            </tr>
            <tr v-for="block in filteredBlocks" :key="block.id">
              <td>
                <div class="d-flex align-center">
                  <v-icon :icon="ACTION_TYPE_ICONS[block.actionType]" size="small" class="mr-2" />
                  <div>
                    <div>{{ block.name }}</div>
                    <div v-if="block.ownerNick?.displayName" class="text-caption text-medium-emphasis">
                      của {{ block.ownerNick.displayName }}
                    </div>
                  </div>
                  <v-chip v-if="block.archivedAt" size="x-small" color="grey" class="ml-2">archived</v-chip>
                </div>
              </td>
              <td>
                <v-chip size="x-small" variant="tonal">{{ ACTION_TYPE_LABELS[block.actionType] }}</v-chip>
              </td>
              <td>
                <span class="text-caption">{{ block.usageCount }}</span>
              </td>
              <td>
                <span class="text-caption text-medium-emphasis">{{ formatDate(block.updatedAt) }}</span>
              </td>
              <td>
                <v-btn icon size="small" variant="text" @click="openEdit(block)"><v-icon size="small">mdi-pencil</v-icon></v-btn>
                <v-btn icon size="small" variant="text" @click="onDuplicate(block)"><v-icon size="small">mdi-content-copy</v-icon></v-btn>
                <v-btn v-if="!block.archivedAt" icon size="small" variant="text" @click="onArchive(block)"><v-icon size="small">mdi-archive-arrow-down</v-icon></v-btn>
                <v-btn v-else icon size="small" variant="text" @click="onUnarchive(block)"><v-icon size="small">mdi-archive-arrow-up</v-icon></v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </div>

    <BlockEditorDialog
      v-model="editorOpen"
      :block="editingBlock"
      :folders="folders"
      :status-items="statusItems"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { blocksApi } from '@/api/automation';
import { ACTION_TYPE_LABELS, ACTION_TYPE_ICONS, SUPPORTED_ACTION_TYPES, type Block, type BlockFolder, type BlockActionType } from '@/api/automation/types';
import BlockEditorDialog from '@/components/automation/phase7/BlockEditorDialog.vue';
import { api } from '@/api';

const blocks = ref<Block[]>([]);
const folders = ref<BlockFolder[]>([]);
const statusItems = ref<Array<{ id: string; name: string }>>([]);
const loading = ref(true);

const selectedFolderId = ref<string | null>(null);
const showArchived = ref(false);
const actionTypeFilter = ref<BlockActionType | null>(null);

const editorOpen = ref(false);
const editingBlock = ref<Block | null>(null);

const actionTypeFilterItems = SUPPORTED_ACTION_TYPES.map((value) => ({ value, title: ACTION_TYPE_LABELS[value] }));

const selectedFolderName = computed(() => {
  if (showArchived.value) return 'Đã archive';
  if (!selectedFolderId.value) return 'Tất cả block';
  return folders.value.find((f) => f.id === selectedFolderId.value)?.name ?? 'Folder';
});

const allCount = computed(() => blocks.value.filter((b) => !b.archivedAt).length);

const filteredBlocks = computed(() => {
  return blocks.value.filter((b) => {
    if (showArchived.value) { if (!b.archivedAt) return false; }
    else { if (b.archivedAt) return false; }
    if (selectedFolderId.value !== null && b.folderId !== selectedFolderId.value) return false;
    if (actionTypeFilter.value && b.actionType !== actionTypeFilter.value) return false;
    return true;
  });
});

async function loadAll() {
  loading.value = true;
  try {
    const [b, f, statusRes] = await Promise.all([
      blocksApi.listBlocks({ includeArchived: true, limit: 500 }),
      blocksApi.listFolders(),
      api.get<{ statuses: Array<{ id: string; name: string }> }>('/statuses').then((r) => r.data.statuses).catch(() => []),
    ]);
    blocks.value = b;
    folders.value = f;
    statusItems.value = Array.isArray(statusRes) ? statusRes : [];
  } finally {
    loading.value = false;
  }
}

onMounted(loadAll);

function openCreate() {
  editingBlock.value = null;
  editorOpen.value = true;
}
function openEdit(block: Block) {
  editingBlock.value = block;
  editorOpen.value = true;
}

function onSaved(_block: Block) { loadAll(); }

async function onDuplicate(block: Block) {
  await blocksApi.duplicateBlock(block.id);
  loadAll();
}
async function onArchive(block: Block) {
  if (!confirm(`Archive block "${block.name}"? Task đang chạy vẫn dùng snapshot — không bị ảnh hưởng.`)) return;
  await blocksApi.archiveBlock(block.id);
  loadAll();
}
async function onUnarchive(block: Block) {
  await blocksApi.unarchiveBlock(block.id);
  loadAll();
}

async function createFolderInline() {
  const name = prompt('Tên folder?');
  if (!name?.trim()) return;
  await blocksApi.createFolder({ name: name.trim() });
  loadAll();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}
</script>

<style scoped>
.folder-list {
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}
</style>
