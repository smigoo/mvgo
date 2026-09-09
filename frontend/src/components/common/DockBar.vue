<template>
  <div class="dock-bar">
    <div class="dock-chips">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="dock-chip"
        tabindex="0"
        role="button"
        @click="openEntry(entry)"
        @keydown.enter.prevent="openEntry(entry)"
        @keydown.space.prevent="openEntry(entry)"
      >
        <img v-if="entry.icon" :src="entry.icon" class="dock-chip-icon" alt="" />
        <span class="dock-chip-name">{{ entry.name }}</span>
        <button class="dock-chip-remove" @click.stop="removeEntry(entry.id)" title="移除">×</button>
      </div>
      <div v-if="entries.length === 0" class="dock-empty">
        点击下方 + 按钮添加常用工具
      </div>
    </div>
    <div class="dock-add">
      <button class="dock-add-btn" @click="toggleAddMenu" title="添加工具">+</button>
      <div v-if="showAddMenu" class="dock-add-menu">
        <div
          v-for="opt in availableOptions"
          :key="opt.id"
          class="dock-add-menu-item"
          @click="addEntry(opt)"
        >
          <img v-if="opt.icon" :src="opt.icon" class="dock-menu-icon" alt="" />
          <span>{{ opt.name }}</span>
        </div>
        <div v-if="availableOptions.length === 0" class="dock-add-menu-empty">
          所有工具已添加
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const STORAGE_KEY = 'mvgo_dock_entries'

// 预置工具选项池
const PRESET_OPTIONS = [
  { id: 'figma', name: 'Figma', url: 'https://figma.com', icon: '' },
  { id: 'gitlab', name: 'GitLab', url: 'https://scm.microvideo.cn', icon: '' },
  { id: 'docs', name: '腾讯文档', url: 'https://docs.qq.com', icon: '' },
  { id: 'jira', name: 'Jira', url: 'https://jira.microvideo.cn', icon: '' },
]

const DEFAULT_ENTRIES = []

const entries = ref([])
const showAddMenu = ref(false)

const entryIds = computed(() => new Set(entries.value.map((e) => e.id)))
const availableOptions = computed(() =>
  PRESET_OPTIONS.filter((opt) => !entryIds.value.has(opt.id)),
)

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      entries.value = DEFAULT_ENTRIES.map((id) => PRESET_OPTIONS.find((o) => o.id === id)).filter(
        Boolean,
      )
      saveEntries()
      return
    }
    const parsed = JSON.parse(raw)
    entries.value = parsed
      .map((id) => PRESET_OPTIONS.find((o) => o.id === id))
      .filter(Boolean)
  } catch {
    entries.value = DEFAULT_ENTRIES.map((id) => PRESET_OPTIONS.find((o) => o.id === id)).filter(
      Boolean,
    )
  }
}

function saveEntries() {
  const ids = entries.value.map((e) => e.id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}

function addEntry(opt) {
  if (entryIds.value.has(opt.id)) return
  entries.value.push({ ...opt })
  saveEntries()
  showAddMenu.value = false
}

function removeEntry(id) {
  entries.value = entries.value.filter((e) => e.id !== id)
  saveEntries()
}

function openEntry(entry) {
  window.open(entry.url, '_blank', 'noopener,noreferrer')
}

function toggleAddMenu() {
  showAddMenu.value = !showAddMenu.value
}

function onDocClick(e) {
  if (!e.target.closest('.dock-add')) {
    showAddMenu.value = false
  }
}

onMounted(() => {
  loadEntries()
  document.addEventListener('click', onDocClick, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick, true)
})
</script>

<style scoped>
.dock-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--border-default, #e5e7eb);
  background: var(--bg-card, #fff);
  min-height: 48px;
  flex-shrink: 0;
}

.dock-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}

.dock-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-secondary, #f3f4f6);
  border: 1px solid var(--border-default, #e5e7eb);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary, #111827);
  white-space: nowrap;
  transition: all 0.15s ease;
  user-select: none;
}

.dock-chip:hover {
  background: var(--bg-hover, #e5e7eb);
  border-color: var(--border-hover, #d1d5db);
}

.dock-chip:focus-visible {
  outline: 2px solid var(--color-primary, #2563eb);
  outline-offset: 2px;
}

.dock-chip-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.dock-chip-name {
  line-height: 1;
}

.dock-chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--text-tertiary, #9ca3af);
  cursor: pointer;
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  transition: all 0.15s ease;
}

.dock-chip-remove:hover {
  background: var(--color-danger-bg, #fef2f2);
  color: var(--color-danger, #dc2626);
}

.dock-empty {
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
  padding: 4px 8px;
}

.dock-add {
  position: relative;
  flex-shrink: 0;
}

.dock-add-btn {
  width: 28px;
  height: 28px;
  border: 1px dashed var(--border-default, #e5e7eb);
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  color: var(--text-tertiary, #9ca3af);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.dock-add-btn:hover {
  border-color: var(--color-primary, #2563eb);
  color: var(--color-primary, #2563eb);
  background: var(--color-primary-bg, #eff6ff);
}

.dock-add-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  min-width: 160px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-default, #e5e7eb);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  z-index: 100;
  overflow: hidden;
}

.dock-add-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary, #111827);
  transition: background 0.1s ease;
}

.dock-add-menu-item:hover {
  background: var(--bg-secondary, #f3f4f6);
}

.dock-menu-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.dock-add-menu-empty {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
  text-align: center;
}
</style>
