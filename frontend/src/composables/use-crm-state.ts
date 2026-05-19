/**
 * Persistent UI state cho /crm — 2 tab (Khách hàng / Bạn bè Zalo) + sidebar dual-context
 * + column order/visibility per tab + density.
 *
 * Priority restore:
 *   1. URL params (?tab=&sale=&nick=) — deep-link wins
 *   2. localStorage v3 — last session
 *   3. Defaults
 *
 * Column định nghĩa ở /constants/crm-columns.ts (single source of truth).
 */
import { ref, watch, computed } from 'vue';
import { COLS_KH, COLS_BB } from '@/constants/crm-columns';

const STORAGE_KEY = 'zalocrm.crm.state.v3';

export type CrmTab = 'khachhang' | 'banbe';
export type DensityMode = 'compact' | 'normal' | 'detailed';

export interface ColPref {
  key: string;
  visible: boolean;
}

export interface PersistedCrmState {
  tab: CrmTab;
  saleUserId: string;      // 'all' or user.id
  zaloNickId: string | null;  // null when scope = user, set when scope = specific nick
  density: DensityMode;
  colsKH: ColPref[];
  colsBB: ColPref[];
  ts: number;
}

function defaultColsKH(): ColPref[] {
  return COLS_KH.map(c => ({ key: c.key, visible: c.default }));
}
function defaultColsBB(): ColPref[] {
  return COLS_BB.map(c => ({ key: c.key, visible: c.default }));
}

/** Merge stored cols với current defs (xử lý khi defs thêm cột mới sau restore). */
function reconcileCols(stored: ColPref[] | undefined, defs: typeof COLS_KH): ColPref[] {
  if (!stored?.length) return defs.map(d => ({ key: d.key, visible: d.default }));
  const storedMap = new Map(stored.map(c => [c.key, c]));
  const out: ColPref[] = [];
  // Keep stored order for known keys
  for (const c of stored) {
    if (defs.find(d => d.key === c.key)) out.push(c);
  }
  // Append any new keys not in stored, using their defaults
  for (const d of defs) {
    if (!storedMap.has(d.key)) out.push({ key: d.key, visible: d.default });
  }
  return out;
}

function readUrlParams(): Partial<PersistedCrmState> {
  if (typeof window === 'undefined') return {};
  const url = new URL(window.location.href);
  const out: Partial<PersistedCrmState> = {};
  const t = url.searchParams.get('tab');
  if (t === 'khachhang' || t === 'banbe') out.tab = t;
  const s = url.searchParams.get('sale');
  if (s) out.saleUserId = s;
  const n = url.searchParams.get('nick');
  if (n) out.zaloNickId = n;
  return out;
}

function readStorage(): PersistedCrmState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedCrmState;
  } catch {
    return null;
  }
}

function writeStorage(s: PersistedCrmState) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function syncUrl(s: PersistedCrmState) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('tab', s.tab);
  if (s.saleUserId && s.saleUserId !== 'all') url.searchParams.set('sale', s.saleUserId); else url.searchParams.delete('sale');
  if (s.zaloNickId) url.searchParams.set('nick', s.zaloNickId); else url.searchParams.delete('nick');
  window.history.replaceState(null, '', url);
}

export function useCrmState() {
  const urlParams = readUrlParams();
  const stored = readStorage();
  const hadStored = !!stored;

  const initial: PersistedCrmState = {
    tab: urlParams.tab ?? stored?.tab ?? 'khachhang',
    saleUserId: urlParams.saleUserId ?? stored?.saleUserId ?? 'all',
    zaloNickId: urlParams.zaloNickId ?? stored?.zaloNickId ?? null,
    density: stored?.density ?? 'normal',
    colsKH: reconcileCols(stored?.colsKH, COLS_KH),
    colsBB: reconcileCols(stored?.colsBB, COLS_BB),
    ts: Date.now(),
  };

  const tab = ref<CrmTab>(initial.tab);
  const saleUserId = ref<string>(initial.saleUserId);
  const zaloNickId = ref<string | null>(initial.zaloNickId);
  const density = ref<DensityMode>(initial.density);
  const colsKH = ref<ColPref[]>(initial.colsKH);
  const colsBB = ref<ColPref[]>(initial.colsBB);

  const restoredFromStorage = ref(hadStored && !urlParams.tab);

  function persist() {
    const s: PersistedCrmState = {
      tab: tab.value,
      saleUserId: saleUserId.value,
      zaloNickId: zaloNickId.value,
      density: density.value,
      colsKH: colsKH.value,
      colsBB: colsBB.value,
      ts: Date.now(),
    };
    writeStorage(s);
    syncUrl(s);
  }

  watch([tab, saleUserId, zaloNickId, density, colsKH, colsBB], persist, { deep: true });

  /** Reset toàn bộ về default (xoá localStorage + URL params). */
  function reset() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      const url = new URL(window.location.href);
      ['tab', 'sale', 'nick'].forEach(k => url.searchParams.delete(k));
      window.history.replaceState(null, '', url);
    }
    tab.value = 'khachhang';
    saleUserId.value = 'all';
    zaloNickId.value = null;
    density.value = 'normal';
    colsKH.value = defaultColsKH();
    colsBB.value = defaultColsBB();
    restoredFromStorage.value = false;
  }

  /** Reset chỉ cols của tab hiện tại về default. */
  function resetColsCurrentTab() {
    if (tab.value === 'khachhang') colsKH.value = defaultColsKH();
    else colsBB.value = defaultColsBB();
  }

  function dismissRestoreToast() {
    restoredFromStorage.value = false;
  }

  /** Cols của tab hiện tại — computed để các component dùng. */
  const currentCols = computed<ColPref[]>(() => tab.value === 'khachhang' ? colsKH.value : colsBB.value);

  /** Hiển thị "X/Y cột visible". */
  const colCountLabel = computed(() => {
    const cols = currentCols.value;
    return `${cols.filter(c => c.visible).length}/${cols.length}`;
  });

  return {
    tab, saleUserId, zaloNickId, density,
    colsKH, colsBB, currentCols, colCountLabel,
    restoredFromStorage, dismissRestoreToast, reset, resetColsCurrentTab,
    persist,
  };
}
