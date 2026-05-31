<template>
  <!-- Wave 4a /plan-eng-review M57 2026-05-31. Tag Taxonomy v2 settings page.
       2 tab strip: Friend Tag (per-pair sale × KH) vs CRM Tag (cấp KH).
       Mỗi tab có table + filter source chip + merge tool. Zalo Real readonly. -->
  <div class="tag-v2-page">
    <header class="t2-header">
      <div class="t2-title">
        <span class="t2-icon">🏷</span>
        <h1>Tag Taxonomy v2 — 2 Nhóm</h1>
      </div>
      <p class="t2-subtitle">
        Hệ thống tag mới: <b>Friend Tag</b> (per-pair sale × KH) + <b>CRM Tag</b> (cấp KH chung).
        Wave dual-write — chạy song song Tag CRM cũ.
      </p>
    </header>

    <!-- Tab strip -->
    <nav class="t2-tabs">
      <button
        :class="['t2-tab', { active: activeTab === 'friend' }]"
        @click="activeTab = 'friend'"
      >
        <span class="t2-tab-emoji">👥</span>
        Friend Tag
        <span class="t2-tab-count">{{ stats.friend }}</span>
      </button>
      <button
        :class="['t2-tab', { active: activeTab === 'crm' }]"
        @click="activeTab = 'crm'"
      >
        <span class="t2-tab-emoji">📇</span>
        CRM Tag
        <span class="t2-tab-count">{{ stats.crm }}</span>
      </button>
      <div class="t2-tab-spacer"></div>
      <button class="t2-btn-secondary" @click="recountUsage" :disabled="loading">
        🔄 Recount usage
      </button>
      <button class="t2-btn-primary" @click="openCreateDialog">
        + Tạo Tag
      </button>
    </nav>

    <!-- Filter source chips -->
    <div class="t2-filters">
      <button
        v-for="src in availableSources"
        :key="src.value"
        :class="['t2-chip', { active: filterSource === src.value }]"
        @click="filterSource = filterSource === src.value ? null : src.value"
      >
        <span class="t2-chip-dot" :style="{ background: src.color }"></span>
        {{ src.label }}
      </button>
    </div>

    <!-- Search -->
    <div class="t2-search">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Tìm tag theo tên hoặc slug..."
        @input="onSearchChange"
      />
    </div>

    <!-- Table -->
    <div class="t2-table-wrap" v-if="!loading">
      <table class="t2-table">
        <thead>
          <tr>
            <th class="t2-col-name">Tên</th>
            <th class="t2-col-slug">Slug</th>
            <th class="t2-col-source">Nguồn</th>
            <th class="t2-col-priority">Ưu tiên</th>
            <th class="t2-col-usage">Dùng</th>
            <th class="t2-col-color">Màu</th>
            <th class="t2-col-action">Hành động</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tag in filteredTags" :key="tag.id" :class="{ archived: tag.archivedAt }">
            <td>
              <span v-if="tag.emoji" class="t2-emoji">{{ tag.emoji }}</span>
              <span class="t2-name">{{ tag.name }}</span>
              <span v-if="tag.source === 'zalo_real'" class="t2-readonly-badge" title="Tên sync từ Zalo Real, đổi trên Zalo app">
                🔒
              </span>
            </td>
            <td><code class="t2-slug">{{ tag.slug }}</code></td>
            <td>
              <span class="t2-source-chip" :style="{ background: getSourceColor(tag.source) }">
                {{ getSourceLabel(tag.source) }}
              </span>
            </td>
            <td>{{ tag.priority }}</td>
            <td>{{ tag.usageCount }}</td>
            <td>
              <input
                type="color"
                :value="tag.color"
                :disabled="tag.source === 'zalo_real' && !overrideManaged"
                @change="updateColor(tag.id, ($event.target as HTMLInputElement).value)"
              />
            </td>
            <td>
              <button class="t2-btn-sm" @click="openMergeDialog(tag)" :disabled="tag.source === 'zalo_real'">
                Merge
              </button>
              <button class="t2-btn-sm danger" @click="archiveTag(tag.id)" :disabled="tag.source === 'zalo_real' && !overrideManaged">
                Archive
              </button>
            </td>
          </tr>
          <tr v-if="filteredTags.length === 0">
            <td colspan="7" class="t2-empty">
              Không có tag nào trong scope <b>{{ activeTab }}</b>{{ filterSource ? ` với nguồn ${getSourceLabel(filterSource)}` : '' }}.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="t2-loading">Đang tải...</div>

    <!-- Create dialog (simple inline) -->
    <div v-if="showCreateDialog" class="t2-modal-backdrop" @click.self="showCreateDialog = false">
      <div class="t2-modal">
        <h3>Tạo Tag mới — scope = {{ activeTab }}</h3>
        <label>Tên hiển thị</label>
        <input v-model="newTag.name" type="text" placeholder="VIP, Tiềm năng, ..." />
        <label>Nguồn</label>
        <select v-model="newTag.source">
          <option v-for="src in availableSources.filter(s => s.value !== 'zalo_real')" :key="src.value" :value="src.value">
            {{ src.label }}
          </option>
        </select>
        <label>Màu</label>
        <input v-model="newTag.color" type="color" />
        <div class="t2-modal-actions">
          <button @click="showCreateDialog = false">Huỷ</button>
          <button class="t2-btn-primary" @click="createTag" :disabled="!newTag.name">Tạo</button>
        </div>
      </div>
    </div>

    <!-- Merge dialog -->
    <div v-if="showMergeDialog" class="t2-modal-backdrop" @click.self="showMergeDialog = false">
      <div class="t2-modal">
        <h3>Merge tag</h3>
        <p>Source: <b>{{ mergeSource?.name }}</b> ({{ mergeSource?.usageCount }} usage)</p>
        <label>Chọn target tag</label>
        <select v-model="mergeTargetId">
          <option v-for="t in availableTagsForMerge" :key="t.id" :value="t.id">
            {{ t.name }} ({{ t.usageCount }})
          </option>
        </select>
        <div class="t2-modal-actions">
          <button @click="showMergeDialog = false">Huỷ</button>
          <button class="t2-btn-primary" @click="confirmMerge" :disabled="!mergeTargetId">
            Merge {{ mergeSource?.name }} → {{ availableTagsForMerge.find(t => t.id === mergeTargetId)?.name }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/services/api';

interface TagV2 {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  color: string;
  emoji: string | null;
  scope: 'friend' | 'crm';
  source: string;
  priority: number;
  usageCount: number;
  zaloAccountId: string | null;
  archivedAt: string | null;
}

const activeTab = ref<'friend' | 'crm'>('friend');
const tags = ref<TagV2[]>([]);
const loading = ref(false);
const filterSource = ref<string | null>(null);
const searchQuery = ref('');
const overrideManaged = ref(false);

const showCreateDialog = ref(false);
const newTag = ref({ name: '', source: 'manual_per_nick', color: '#90A4AE' });

const showMergeDialog = ref(false);
const mergeSource = ref<TagV2 | null>(null);
const mergeTargetId = ref<string>('');

const SOURCE_META: Record<string, { label: string; color: string; scope: 'friend' | 'crm' }> = {
  zalo_real: { label: 'Zalo Real', color: '#2196F3', scope: 'friend' },
  manual_per_nick: { label: 'Manual per Nick', color: '#FFA726', scope: 'friend' },
  auto_detect: { label: 'Auto Detect', color: '#66BB6A', scope: 'friend' },
  auto_score: { label: 'Auto Score', color: '#AB47BC', scope: 'friend' },
  auto_engagement: { label: 'Auto Engagement', color: '#EF5350', scope: 'friend' },
  manual_crm: { label: 'Manual CRM', color: '#FFA726', scope: 'crm' },
  ai_suggest: { label: 'AI Suggest', color: '#5C6BC0', scope: 'crm' },
  segment_rule: { label: 'Segment Rule', color: '#26A69A', scope: 'crm' },
  status: { label: 'Status', color: '#8D6E63', scope: 'crm' },
  import: { label: 'Import', color: '#78909C', scope: 'crm' },
};

const availableSources = computed(() =>
  Object.entries(SOURCE_META)
    .filter(([_, m]) => m.scope === activeTab.value)
    .map(([value, m]) => ({ value, label: m.label, color: m.color }))
);

const stats = computed(() => ({
  friend: tags.value.filter((t) => t.scope === 'friend' && !t.archivedAt).length,
  crm: tags.value.filter((t) => t.scope === 'crm' && !t.archivedAt).length,
}));

const filteredTags = computed(() => {
  let arr = tags.value.filter((t) => t.scope === activeTab.value);
  if (filterSource.value) arr = arr.filter((t) => t.source === filterSource.value);
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    arr = arr.filter((t) => t.name.toLowerCase().includes(q) || t.slug.includes(q));
  }
  return arr.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.usageCount - a.usageCount;
  });
});

const availableTagsForMerge = computed(() => {
  if (!mergeSource.value) return [];
  return tags.value.filter(
    (t) => t.scope === mergeSource.value!.scope && t.id !== mergeSource.value!.id && !t.archivedAt
  );
});

function getSourceLabel(src: string): string {
  return SOURCE_META[src]?.label ?? src;
}

function getSourceColor(src: string): string {
  return SOURCE_META[src]?.color ?? '#999';
}

async function loadTags() {
  loading.value = true;
  try {
    const res = await api.get('/api/v1/tags', { params: { scope: activeTab.value, limit: 100 } });
    tags.value = res.data.tags ?? [];
  } catch (err) {
    console.error('[TagTaxonomyV2] load error', err);
  } finally {
    loading.value = false;
  }
}

function onSearchChange() {
  // Debounce simple — load lại sau 300ms
}

async function recountUsage() {
  loading.value = true;
  try {
    await api.get('/api/v1/tags', { params: { recount: 1, scope: activeTab.value } });
    await loadTags();
  } finally {
    loading.value = false;
  }
}

function openCreateDialog() {
  newTag.value = {
    name: '',
    source: activeTab.value === 'friend' ? 'manual_per_nick' : 'manual_crm',
    color: '#90A4AE',
  };
  showCreateDialog.value = true;
}

async function createTag() {
  if (!newTag.value.name) return;
  try {
    await api.post('/api/v1/tags', {
      name: newTag.value.name,
      scope: activeTab.value,
      source: newTag.value.source,
      color: newTag.value.color,
    });
    showCreateDialog.value = false;
    await loadTags();
  } catch (err) {
    alert('Tạo tag thất bại: ' + (err as Error).message);
  }
}

async function updateColor(tagId: string, color: string) {
  try {
    await api.patch(`/api/v1/tags/${tagId}`, { color });
    await loadTags();
  } catch (err) {
    alert('Đổi màu thất bại');
  }
}

async function archiveTag(tagId: string) {
  if (!confirm('Archive tag này? Junction sẽ giữ nguyên nhưng tag không xuất hiện trong autocomplete.')) return;
  try {
    await api.delete(`/api/v1/tags/${tagId}`);
    await loadTags();
  } catch (err) {
    alert('Archive thất bại');
  }
}

function openMergeDialog(tag: TagV2) {
  mergeSource.value = tag;
  mergeTargetId.value = '';
  showMergeDialog.value = true;
}

async function confirmMerge() {
  if (!mergeSource.value || !mergeTargetId.value) return;
  try {
    const res = await api.post('/api/v1/tags/merge', {
      sourceTagId: mergeSource.value.id,
      targetTagId: mergeTargetId.value,
    });
    if (res.data.skipped) {
      alert(`Merge bỏ qua: ${res.data.skipped}`);
    } else {
      alert(`Merge thành công. ${res.data.moved} junction rows moved.`);
    }
    showMergeDialog.value = false;
    await loadTags();
  } catch (err) {
    const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Merge thất bại';
    alert(msg);
  }
}

onMounted(loadTags);
</script>

<style scoped>
.tag-v2-page {
  padding: 24px;
  max-width: 1366px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #181d26;
}
.t2-header { margin-bottom: 20px; }
.t2-title { display: flex; align-items: center; gap: 10px; }
.t2-title h1 { font-size: 22px; font-weight: 700; margin: 0; color: #181d26; }
.t2-icon { font-size: 24px; }
.t2-subtitle { font-size: 13px; color: #41454d; margin: 8px 0 0 0; }

.t2-tabs { display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #dddddd; padding-bottom: 0; margin-bottom: 14px; }
.t2-tab {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 16px; border: 1px solid transparent; border-bottom: none;
  background: transparent; color: #41454d; font-size: 13px; font-weight: 500;
  cursor: pointer; border-radius: 8px 8px 0 0; margin-bottom: -1px;
}
.t2-tab.active {
  background: #fff; border-color: #dddddd; color: #181d26; font-weight: 600;
}
.t2-tab-emoji { font-size: 14px; }
.t2-tab-count {
  background: #eef0f3; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;
}
.t2-tab-spacer { flex: 1; }

.t2-btn-primary {
  background: #181d26; color: white; border: 1px solid #181d26;
  padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;
}
.t2-btn-primary:hover { background: #2a2f3a; }
.t2-btn-primary:disabled { background: #999; cursor: not-allowed; }

.t2-btn-secondary {
  background: white; color: #41454d; border: 1px solid #dddddd;
  padding: 8px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;
}
.t2-btn-secondary:hover { background: #f5f7fa; }

.t2-btn-sm {
  background: white; color: #41454d; border: 1px solid #dddddd;
  padding: 4px 10px; border-radius: 4px; font-size: 11px; cursor: pointer; margin-right: 4px;
}
.t2-btn-sm.danger { color: #d32f2f; border-color: #ef9a9a; }
.t2-btn-sm:hover:not(:disabled) { background: #f5f7fa; }
.t2-btn-sm:disabled { opacity: 0.4; cursor: not-allowed; }

.t2-filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.t2-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; background: white; border: 1px solid #dddddd;
  border-radius: 14px; font-size: 11px; cursor: pointer; color: #41454d;
}
.t2-chip.active { background: #181d26; color: white; border-color: #181d26; }
.t2-chip-dot { width: 8px; height: 8px; border-radius: 50%; }

.t2-search { margin-bottom: 12px; }
.t2-search input {
  width: 100%; padding: 8px 12px; border: 1px solid #dddddd; border-radius: 6px;
  font-size: 13px; box-sizing: border-box;
}

.t2-table-wrap { background: white; border: 1px solid #dddddd; border-radius: 8px; overflow: hidden; }
.t2-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.t2-table th {
  text-align: left; padding: 8px 10px; background: #f5f7fa; color: #41454d;
  font-weight: 600; border-bottom: 1px solid #dddddd; font-size: 11px;
}
.t2-table td {
  padding: 8px 10px; border-bottom: 1px solid #eef0f3;
}
.t2-table tr:hover td { background: #fafbfc; }
.t2-table tr.archived td { opacity: 0.5; }

.t2-emoji { margin-right: 6px; }
.t2-name { font-weight: 500; }
.t2-readonly-badge { margin-left: 6px; cursor: help; }
.t2-slug { background: #eef0f3; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 11px; color: #41454d; }
.t2-source-chip {
  display: inline-block; padding: 2px 8px; border-radius: 10px;
  color: white; font-size: 10px; font-weight: 500;
}

.t2-empty { text-align: center; padding: 40px; color: #999; }
.t2-loading { text-align: center; padding: 40px; color: #999; }

.t2-modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.t2-modal {
  background: white; padding: 24px; border-radius: 8px;
  min-width: 400px; max-width: 500px;
}
.t2-modal h3 { margin: 0 0 16px 0; font-size: 16px; }
.t2-modal label { display: block; font-size: 12px; color: #41454d; margin: 12px 0 4px; font-weight: 500; }
.t2-modal input, .t2-modal select {
  width: 100%; padding: 6px 10px; border: 1px solid #dddddd; border-radius: 4px;
  font-size: 13px; box-sizing: border-box;
}
.t2-modal input[type="color"] { width: 60px; padding: 2px; height: 32px; }
.t2-modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }
.t2-modal-actions button { padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.t2-modal-actions button:not(.t2-btn-primary) {
  background: white; color: #41454d; border: 1px solid #dddddd;
}
</style>
