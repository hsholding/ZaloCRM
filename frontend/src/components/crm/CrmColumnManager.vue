<template>
  <div class="col-mgr-wrap">
    <button class="btn" @click.stop="open = !open">
      ⚙ Cột <span class="count-label">{{ visibleCount }}/{{ cols.length }}</span>
    </button>

    <div v-if="open" class="dropdown">
      <div class="head">
        <span class="title">Quản lý cột hiển thị</span>
        <span class="badge-count">{{ visibleCount }}/{{ cols.length }}</span>
      </div>

      <div class="body">
        <div class="section">
          <h6>
            <span>Đang hiển thị · drag ⋮⋮ để đổi thứ tự</span>
            <button class="small-btn" @click="hideAll">Ẩn tất cả</button>
          </h6>
          <div
            v-for="(c, idx) in shownCols"
            :key="c.key"
            class="col-item"
            :draggable="!isSticky(c.key)"
            @dragstart="onDragStart(c.key, $event)"
            @dragover.prevent="onDragOver(c.key, $event)"
            @drop.prevent="onDrop(c.key)"
            @dragend="onDragEnd"
            :class="{ dragging: draggingKey === c.key, 'drag-over': dragOverKey === c.key, sticky: isSticky(c.key) }"
          >
            <span class="grip" :title="isSticky(c.key) ? 'Cột sticky — không thể đổi' : 'Kéo để đổi thứ tự'">⋮⋮</span>
            <input
              type="checkbox"
              :checked="true"
              :disabled="isSticky(c.key)"
              :title="isSticky(c.key) ? 'Cột sticky — không thể ẩn' : 'Ẩn cột'"
              @change="hideCol(c.key)"
            />
            <span class="label">{{ labelFor(c.key) }}</span>
            <span class="order-num">#{{ idx + 1 }}</span>
          </div>
        </div>

        <div class="section">
          <h6>
            <span>Cột ẩn · click <b>+</b> để hiện</span>
            <button class="small-btn" @click="showAll">Hiện tất cả</button>
          </h6>
          <div
            v-for="c in hiddenCols"
            :key="c.key"
            class="col-item hidden-item"
            @click="showCol(c.key)"
          >
            <span class="grip">⋮⋮</span>
            <input type="checkbox" :checked="false" @click.stop="showCol(c.key)" />
            <span class="label">{{ labelFor(c.key) }}</span>
            <span class="plus">+</span>
          </div>
          <div v-if="!hiddenCols.length" class="empty-list">Tất cả cột đang hiện</div>
        </div>
      </div>

      <div class="foot">
        <button class="btn-foot" @click="reset">↻ Mặc định</button>
        <button class="btn-foot primary" @click="open = false">✓ Xong</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import type { CrmColumnDef } from '@/constants/crm-columns';
import type { ColPref } from '@/composables/use-crm-state';

const props = defineProps<{
  /** Cột hiện tại theo state (đã ordered + visible flag). */
  cols: ColPref[];
  /** Định nghĩa đầy đủ cột — lấy label + sticky. */
  defs: CrmColumnDef[];
}>();

const emit = defineEmits<{
  /** Reorder: cols mới theo thứ tự. */
  (e: 'update:cols', cols: ColPref[]): void;
  /** Reset về default của tab hiện tại. */
  (e: 'reset'): void;
}>();

const open = ref(false);

// Drag state
const draggingKey = ref<string | null>(null);
const dragOverKey = ref<string | null>(null);

const stickyKeys = computed(() => new Set(props.defs.filter(d => d.sticky).map(d => d.key)));
const labelMap = computed(() => new Map(props.defs.map(d => [d.key, d.label])));

const shownCols = computed(() => props.cols.filter(c => c.visible));
const hiddenCols = computed(() => props.cols.filter(c => !c.visible));
const visibleCount = computed(() => shownCols.value.length);

function isSticky(key: string): boolean { return stickyKeys.value.has(key); }
function labelFor(key: string): string { return labelMap.value.get(key) ?? key; }

function hideCol(key: string) {
  if (isSticky(key)) return;
  const next = props.cols.map(c => c.key === key ? { ...c, visible: false } : c);
  emit('update:cols', next);
}
function showCol(key: string) {
  const next = props.cols.map(c => c.key === key ? { ...c, visible: true } : c);
  emit('update:cols', next);
}
function hideAll() {
  const next = props.cols.map(c => isSticky(c.key) ? c : { ...c, visible: false });
  emit('update:cols', next);
}
function showAll() {
  const next = props.cols.map(c => ({ ...c, visible: true }));
  emit('update:cols', next);
}
function reset() {
  emit('reset');
}

function onDragStart(key: string, e: DragEvent) {
  if (isSticky(key)) {
    e.preventDefault();
    return;
  }
  draggingKey.value = key;
  e.dataTransfer?.setData('text/plain', key);
  e.dataTransfer && (e.dataTransfer.effectAllowed = 'move');
}
function onDragOver(key: string, e: DragEvent) {
  e.dataTransfer && (e.dataTransfer.dropEffect = 'move');
  dragOverKey.value = key;
}
function onDrop(targetKey: string) {
  const sourceKey = draggingKey.value;
  draggingKey.value = null;
  dragOverKey.value = null;
  if (!sourceKey || sourceKey === targetKey) return;
  if (isSticky(targetKey)) return; // không cho thả vào trước sticky
  const next = [...props.cols];
  const fromIdx = next.findIndex(c => c.key === sourceKey);
  const toIdx = next.findIndex(c => c.key === targetKey);
  if (fromIdx < 0 || toIdx < 0) return;
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  emit('update:cols', next);
}
function onDragEnd() {
  draggingKey.value = null;
  dragOverKey.value = null;
}

// Đóng dropdown khi click ngoài
function onDocClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (!t.closest('.col-mgr-wrap')) open.value = false;
}
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
</script>

<style scoped>
.col-mgr-wrap { position: relative; }
.btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: 6px;
  border: 1px solid #cdd4df; background: #fff;
  color: #1a2433; font-weight: 600; font-size: 12px;
  cursor: pointer; font-family: inherit;
}
.btn:hover { background: #f9fafc; }
.count-label { opacity: .5; font-weight: 500; }

.dropdown {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 35;
  background: #fff; border: 1px solid #e4e8ef; border-radius: 10px;
  box-shadow: 0 12px 36px rgba(0,0,0,.15);
  width: 360px; max-width: 90vw;
}

.head {
  padding: 12px 14px; border-bottom: 1px solid #e4e8ef;
  display: flex; align-items: center; gap: 6px;
}
.head .title { font-size: 13px; font-weight: 700; flex: 1; }
.head .badge-count {
  font-size: 11px;
  background: #e8f0fe; color: #2f6ee5;
  padding: 2px 8px; border-radius: 10px; font-weight: 600;
}

.body { max-height: 440px; overflow-y: auto; }
.section { padding: 8px 14px 4px; }
.section h6 {
  font-size: 10px; text-transform: uppercase; color: #8d96a4;
  letter-spacing: .04em; margin: 0 0 6px; font-weight: 700;
  display: flex; justify-content: space-between; align-items: center;
}
.small-btn {
  background: transparent; border: none; color: #2f6ee5;
  font-size: 10px; cursor: pointer; font-family: inherit;
  text-transform: none; letter-spacing: 0; font-weight: 600;
}

.col-item {
  display: grid; grid-template-columns: 18px 14px 1fr auto;
  gap: 8px; align-items: center;
  padding: 6px 8px; border-radius: 6px;
  cursor: grab; font-size: 12.5px;
  border: 1px solid transparent;
  user-select: none;
}
.col-item:hover { background: #f9fafc; }
.col-item.dragging {
  opacity: .4;
  border-color: #2f6ee5;
  background: #e8f0fe;
  cursor: grabbing;
}
.col-item.drag-over { border-top: 2px solid #2f6ee5; }
.col-item.sticky { opacity: .65; cursor: default; }
.col-item.hidden-item { cursor: pointer; }
.col-item.hidden-item:hover .plus { color: #fff; background: #2f6ee5; border-radius: 50%; }
.col-item .grip { color: #8d96a4; font-size: 13px; line-height: 1; }
.col-item input[type=checkbox] { accent-color: #2f6ee5; }
.col-item .label { font-size: 12px; }
.col-item .order-num {
  font-size: 9px; color: #8d96a4;
  background: #f9fafc; padding: 1px 5px;
  border-radius: 8px; font-weight: 700;
}
.col-item .plus {
  color: #2f6ee5; font-size: 14px; font-weight: 700;
  width: 18px; height: 18px;
  display: grid; place-items: center;
  transition: all .12s;
}
.empty-list {
  font-size: 11px; color: #8d96a4;
  padding: 8px; text-align: center;
}

.foot {
  padding: 10px 14px; border-top: 1px solid #e4e8ef;
  background: #f9fafc; display: flex; gap: 6px;
  border-radius: 0 0 10px 10px;
}
.btn-foot {
  flex: 1; padding: 5px 10px;
  font-size: 11px; font-family: inherit;
  border: 1px solid #e4e8ef; background: #fff;
  border-radius: 5px; cursor: pointer; font-weight: 600;
}
.btn-foot.primary { background: #2f6ee5; color: #fff; border-color: #2f6ee5; }
.btn-foot:hover:not(.primary) { background: #f9fafc; }
.btn-foot.primary:hover { background: #2356b8; }
</style>
