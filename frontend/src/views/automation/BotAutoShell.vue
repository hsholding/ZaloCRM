<template>
  <div class="bot-auto-shell d-flex" style="height: calc(100vh - 64px);">
    <!-- Left sidebar — 4 nav items (smax.ai pattern) -->
    <div class="bot-auto-sidebar pa-3" style="width: 220px; border-right: 1px solid rgba(0,0,0,0.08); overflow-y: auto;">
      <div class="text-h6 mb-4 px-2">Bot-Auto</div>
      <v-list density="compact" nav>
        <v-list-item
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :prepend-icon="item.icon"
          :title="item.label"
          rounded="lg"
        />
      </v-list>

      <div class="text-caption text-medium-emphasis mt-6 px-2">
        Phase 7 — Automation framework cho Zalo cá nhân.
        Block / Sequence / Trigger / Broadcast.
      </div>
    </div>

    <!-- Main content area -->
    <div class="flex-grow-1 pa-4" style="overflow-y: auto;">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
const navItems = [
  { to: '/automation/bot/triggers',   label: 'Kịch bản',                  icon: 'mdi-lightning-bolt' },
  { to: '/automation/bot/blocks',     label: 'Thư viện block',            icon: 'mdi-puzzle' },
  { to: '/automation/bot/sequences',  label: 'Kịch bản chăm sóc',         icon: 'mdi-format-list-numbered' },
  { to: '/automation/bot/broadcasts', label: 'Broadcast & Re-marketing',  icon: 'mdi-bullhorn' },
];
</script>

<style scoped>
.bot-auto-sidebar {
  background: rgb(var(--v-theme-surface));
}
</style>
