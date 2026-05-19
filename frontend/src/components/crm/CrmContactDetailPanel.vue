<template>
  <Teleport to="body">
    <div v-if="contact" class="panel-overlay" @click="$emit('close')" />
    <aside class="side-panel" :class="{ open: !!contact }">
      <template v-if="contact">
        <div class="panel-head">
          <div class="pav" :class="avatarClass(contact.id)">{{ initials(contact.crmName || contact.fullName) }}</div>
          <h3>{{ contact.crmName || contact.fullName || 'Khách hàng' }}</h3>
          <button class="close" @click="$emit('close')">✕</button>
        </div>

        <div class="panel-body">
          <div class="panel-section">
            <h5>Định danh KH</h5>
            <div class="kv"><span class="k">📱 SĐT</span><span class="v"><b>{{ contact.phone || '—' }}</b></span></div>
            <div class="kv"><span class="k">🌐 Global ID</span><span class="v">
              <span v-if="contact.zaloGlobalId || contact.aggregateZaloGlobalId" class="uid-tag">
                {{ contact.zaloGlobalId || contact.aggregateZaloGlobalId }}
              </span>
              <span v-else style="color:#8d96a4">—</span>
            </span></div>
            <div class="kv"><span class="k">✅ Có Zalo</span><span class="v">
              <span v-if="contact.hasZalo" class="badge yes">Có</span>
              <span v-else class="badge no">Chưa</span>
            </span></div>
            <div v-if="contact.childrenCount && contact.childrenCount > 0" class="kv">
              <span class="k">👨‍👦 KH cha</span>
              <span class="v">có <b>{{ contact.childrenCount }}</b> con</span>
            </div>
            <div v-if="contact.parentContactId" class="kv">
              <span class="k">👨‍👦 KH con</span>
              <span class="v">của KH khác</span>
            </div>
          </div>

          <div v-if="friendRows && friendRows.length" class="panel-section">
            <h5>{{ friendRows.length }} cặp chăm</h5>
            <table class="nick-table">
              <thead>
                <tr>
                  <th>Nick</th><th>UID</th><th>Alias</th><th>KB</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in friendRows" :key="f.id">
                  <td>
                    <span class="nick-mini">
                      <span class="av-mini" :class="nickAvatarClass(f.zaloAccount?.id || '')">
                        {{ initials(f.zaloAccount?.displayName) }}
                      </span>
                      {{ f.zaloAccount?.displayName || '—' }}
                    </span>
                  </td>
                  <td>
                    <span class="uid-tag" :title="f.zaloUidInNick">
                      {{ f.zaloUidInNick ? `${f.zaloUidInNick.slice(0, 6)}...${f.zaloUidInNick.slice(-4)}` : '—' }}
                    </span>
                  </td>
                  <td>
                    <span v-if="f.aliasInNick">{{ f.aliasInNick }}</span>
                    <span v-else style="color:#8d96a4;font-style:italic">—</span>
                  </td>
                  <td><span class="badge" :class="kbClass(f.relationshipKind)">{{ kbLabel(f.relationshipKind) }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="panel-section">
            <h5>Aggregate</h5>
            <div class="kv"><span class="k">Score</span><span class="v"><b>{{ contact.leadScore ?? 0 }}/100</b></span></div>
            <div v-if="contact.statusRef" class="kv">
              <span class="k">Trạng thái</span>
              <span class="v"><span class="badge grey">{{ contact.statusRef.name }}</span></span>
            </div>
            <div class="kv">
              <span class="k">Tin tổng</span>
              <span class="v">📥 {{ contact.totalInbound ?? 0 }} / 📤 {{ contact.totalOutbound ?? 0 }}</span>
            </div>
            <div v-if="contact.lastInteractionAt" class="kv">
              <span class="k">Tương tác cuối</span>
              <span class="v">{{ formatRelative(contact.lastInteractionAt) }}</span>
            </div>
          </div>

          <div v-if="friendRows && friendRows.length" class="panel-section">
            <button class="btn primary" style="width:100%" @click="$emit('jump-bb', contact)">
              🔗 Mở các cặp này ở tab "Bạn bè Zalo" →
            </button>
          </div>
        </div>

        <div class="panel-foot">
          <button class="btn" @click="$emit('open-chat', contact)">💬 Chat</button>
          <button class="btn" @click="$emit('call', contact)">📞 Gọi</button>
          <button class="btn primary" @click="$emit('open-profile', contact)">👤 Hồ sơ</button>
        </div>
      </template>
    </aside>
  </Teleport>
</template>

<script setup lang="ts">
import type { Contact } from '@/composables/use-contacts';
import type { DbFriend } from '@/composables/use-friends';

defineProps<{
  contact: Contact | null;
  friendRows?: DbFriend[];
}>();

defineEmits<{
  (e: 'close'): void;
  (e: 'jump-bb', c: Contact): void;
  (e: 'open-chat', c: Contact): void;
  (e: 'call', c: Contact): void;
  (e: 'open-profile', c: Contact): void;
}>();

function initials(name?: string | null): string {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[p.length - 2][0] + p[p.length - 1][0]).toUpperCase();
}

const PALETTE = ['av-c1', 'av-c2', 'av-c3', 'av-c4', 'av-c5', 'av-c6', 'av-c7'];
function hash(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function avatarClass(id: string): string { return hash(id); }
function nickAvatarClass(id: string): string { return id ? hash(id) : 'av-c1'; }

function kbClass(kind: string): string {
  const m: Record<string, string> = { friend: 'success', pending_friend: 'warn', chatting_stranger: 'info', ghost: 'grey' };
  return m[kind] ?? 'grey';
}
function kbLabel(kind: string): string {
  const m: Record<string, string> = {
    friend: '● Đã KB', pending_friend: '◐ Đã mời', chatting_stranger: '◯ Đang nhắn', ghost: '✕ Ngắt',
  };
  return m[kind] ?? '—';
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}
</script>

<style scoped>
.panel-overlay { position: fixed; inset: 0; background: rgba(15,20,25,.18); z-index: 39; }
.side-panel {
  position: fixed; top: var(--smax-topnav-h, 52px); right: 0; bottom: 0;
  width: 420px; max-width: 100vw;
  background: #fff; border-left: 1px solid #e4e8ef;
  box-shadow: -8px 0 30px rgba(0,0,0,.08);
  transform: translateX(100%); transition: transform .25s;
  display: flex; flex-direction: column;
  z-index: 40;
}
.side-panel.open { transform: translateX(0); }

@media (max-width: 768px) { .side-panel { width: 100vw; top: 0; } }

.panel-head {
  padding: 12px 16px; border-bottom: 1px solid #e4e8ef;
  display: flex; align-items: center; gap: 10px;
}
.pav {
  width: 42px; height: 42px; border-radius: 50%;
  color: #fff; display: grid; place-items: center;
  font-weight: 700; flex-shrink: 0;
}
.panel-head h3 {
  margin: 0; font-size: 14px; flex: 1; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.close {
  background: transparent; border: none; font-size: 18px;
  color: #8d96a4; cursor: pointer;
  width: 28px; height: 28px; border-radius: 5px;
  font-family: inherit;
}
.close:hover { background: #f9fafc; }

.panel-body { flex: 1; overflow-y: auto; padding: 14px 16px; font-size: 13px; }
.panel-section { margin-bottom: 18px; }
.panel-section h5 {
  font-size: 11px; color: #8d96a4; text-transform: uppercase;
  letter-spacing: .04em; margin: 0 0 8px; font-weight: 700;
}

.kv { display: flex; padding: 5px 0; border-bottom: 1px dashed #e4e8ef; font-size: 12.5px; }
.kv:last-child { border-bottom: none; }
.kv .k { color: #8d96a4; width: 110px; flex-shrink: 0; }
.kv .v { flex: 1; color: #1a2433; word-break: break-word; }

.uid-tag {
  font-family: 'SF Mono', Menlo, monospace; font-size: 10px;
  background: #f9fafc; color: #8d96a4;
  padding: 1px 5px; border-radius: 4px;
}

.badge {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 1px 7px; border-radius: 9px;
  font-size: 10.5px; font-weight: 600;
}
.badge.success { background: #dcfce7; color: #166534; }
.badge.warn { background: #fef3c7; color: #92400e; }
.badge.info { background: #cffafe; color: #155e75; }
.badge.grey { background: #f1f5f9; color: #475569; }
.badge.yes { background: #dcfce7; color: #166534; }
.badge.no { background: #fee2e2; color: #991b1b; }

.nick-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 11.5px; }
.nick-table th {
  padding: 6px 8px;
  font-size: 10px; color: #8d96a4; text-transform: uppercase;
  font-weight: 700; background: #f9fafc; text-align: left;
  border-bottom: 1px solid #e4e8ef;
}
.nick-table td { padding: 6px 8px; border-bottom: 1px solid #e4e8ef; vertical-align: middle; }
.nick-table tr:last-child td { border-bottom: none; }

.nick-mini { display: inline-flex; align-items: center; gap: 5px; }
.av-mini {
  width: 20px; height: 20px; border-radius: 50%;
  color: #fff; display: grid; place-items: center;
  font-size: 8px; font-weight: 800;
}

.panel-foot {
  padding: 10px 16px; border-top: 1px solid #e4e8ef;
  background: #f9fafc; display: flex; gap: 6px;
}
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  padding: 7px 10px; border-radius: 7px;
  border: 1px solid #cdd4df; background: #fff;
  color: #1a2433; font-weight: 600; font-size: 12px;
  cursor: pointer; font-family: inherit;
}
.btn:hover { background: #f5f7fb; }
.btn.primary { background: #2f6ee5; color: #fff; border-color: #2f6ee5; }
.btn.primary:hover { background: #2356b8; }
.panel-foot .btn { flex: 1; }

.av-c1 { background: linear-gradient(135deg, #2f6ee5, #1d4ed8); }
.av-c2 { background: linear-gradient(135deg, #16a34a, #15803d); }
.av-c3 { background: linear-gradient(135deg, #d97706, #b45309); }
.av-c4 { background: linear-gradient(135deg, #7c3aed, #6d28d9); }
.av-c5 { background: linear-gradient(135deg, #db2777, #be185d); }
.av-c6 { background: linear-gradient(135deg, #0891b2, #0e7490); }
.av-c7 { background: linear-gradient(135deg, #ea580c, #c2410c); }
</style>
