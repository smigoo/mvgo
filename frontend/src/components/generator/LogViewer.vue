<template>
  <div class="log-viewer" :class="{ collapsed: isCollapsed }">
    <div class="log-header" @click="toggleCollapse">
      <div class="log-title">
        <span>详细日志</span>
        <span class="log-count">({{ logs.length }})</span>
      </div>
      <button class="toggle-btn" @click.stop="toggleCollapse">
        {{ isCollapsed ? '展开' : '收起' }}
      </button>
    </div>

    <div v-if="!isCollapsed" class="log-content">
      <div class="log-controls">
        <button class="clear-btn" @click="clearLogs">清空日志</button>
        <div class="log-controls-right">
          <label class="auto-scroll-label" :class="{ disabled: !autoScroll }">
            <input type="checkbox" v-model="autoScroll" />
            自动滚动
          </label>
          <button
            v-if="!autoScroll && logs.length > 0"
            class="scroll-to-latest-btn"
            @click="scrollToLatest(true)"
            title="跳转到最新一条"
          >
            ↓ 最新
          </button>
        </div>
      </div>

      <div class="log-list" ref="logList" @scroll="onLogScroll">
        <div
          v-for="(log, index) in logs"
          :key="`${index}-${log.time}`"
          :ref="el => setEntryRef(el, index)"
          class="log-entry"
          :class="[log.level, { 'has-meta': !!log.meta, 'is-latest': index === latestIndex }]"
        >
          <span class="log-time">{{ log.time }}</span>
          <span class="log-level">{{ log.level.toUpperCase() }}</span>
          <span v-if="log.meta?.role" class="log-role" :class="getRoleClass(log.meta.role)">
            [{{ log.meta.role }}]
          </span>
          <span class="log-agent" v-else-if="log.agent">[{{ log.agent }}]</span>
          <span class="log-message">{{ log.message }}</span>

          <!-- JSON Meta：折叠展开 + 语法高亮 + 代码块样式 -->
          <div
            v-if="log.meta"
            class="log-meta-toggle"
            :class="{ expanded: expandedMetas.has(index) }"
            @click.stop="toggleMeta(index)"
          >
            <span class="meta-arrow">{{ expandedMetas.has(index) ? '▼' : '▶' }}</span>
            <span class="meta-summary">
              <template v-if="expandedMetas.has(index)">收起详情</template>
              <template v-else>{{ getMetaSummary(log.meta) }}</template>
            </span>
          </div>
          <div
            v-if="log.meta && expandedMetas.has(index)"
            class="log-meta"
            v-html="highlightJson(log.meta)"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue'

interface LogEntry {
  time: string
  level: 'debug' | 'info' | 'warn' | 'error'
  agent?: string
  message: string
  meta?: any
}

const props = defineProps<{
  logs: LogEntry[]
}>()

const emit = defineEmits<{
  clear: []
}>()

const isCollapsed = ref(false)
const autoScroll = ref(true)
const logList = ref<HTMLElement | null>(null)
const entryRefs = ref<HTMLElement[]>([])
// 用户主动向上滚动时临时关闭自动滚动
const userScrolledAway = ref(false)

// 记录哪些日志的 meta 已展开
const expandedMetas = reactive(new Set<number>())

// "最新一条" 的索引：始终是最后一条
const latestIndex = computed(() => Math.max(0, props.logs.length - 1))

function setEntryRef(el: any, index: number) {
  if (el) {
    entryRefs.value[index] = el as HTMLElement
  } else {
    delete entryRefs.value[index]
  }
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function clearLogs() {
  emit('clear')
  expandedMetas.clear()
}

function toggleMeta(index: number) {
  if (expandedMetas.has(index)) {
    expandedMetas.delete(index)
  } else {
    expandedMetas.add(index)
  }
}

/** 折叠状态下的摘要（最多 80 字符） */
function getMetaSummary(meta: any): string {
  if (!meta) return '{}'
  const arr = Object.entries(meta).slice(0, 3)
  const parts = arr.map(([k, v]) => {
    const val = typeof v === 'string' ? `"${v}"` : JSON.stringify(v)
    return `${k}: ${val}`
  })
  const suffix = Object.keys(meta).length > 3 ? ', ...' : ''
  return `{ ${parts.join(', ')}${suffix} }`
}

function getRoleClass(role: string): string {
  if (role.includes('Vision')) return 'role-vision'
  if (role.includes('CodeGenerator')) return 'role-codegen'
  if (role.includes('Validator')) return 'role-validator'
  if (role.includes('Figma')) return 'role-figma'
  return 'role-default'
}

/** HTML 转义 */
function escapeHtml(str: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
  return str.replace(/[&<>"]/g, c => map[c])
}

/** JSON 语法高亮：key=蓝色、字符串=绿色、数字=橙色、布尔/null=粉色 */
function highlightJson(obj: any): string {
  if (!obj) return ''
  const raw = JSON.stringify(obj, null, 2)
  // 先 HTML 转义，再对特定 token 打高亮标签
  return escapeHtml(raw)
    .replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)\s*:/g,
      '<span class="hl-key">$1</span>:')
    .replace(/:\s*(&quot;(?:[^&]|&(?!quot;))*?&quot;)/g,
      ': <span class="hl-string">$1</span>')
    .replace(/:\s*(\d+\.?\d*(?:[eE][+-]?\d+)?)/g,
      ': <span class="hl-number">$1</span>')
    .replace(/:\s*\b(true|false)\b/gi,
      ': <span class="hl-bool">$1</span>')
    .replace(/:\s*\b(null)\b/gi,
      ': <span class="hl-null">$1</span>')
}

/** 滚到"最新一条"；force=true 时即使 autoScroll=false 也强制跳转 */
function scrollToLatest(force = false) {
  if (!logList.value) return
  if (!force && !autoScroll.value) return

  nextTick(() => {
    const container = logList.value
    if (!container) return

    // 优先使用最新一条对应 DOM 元素，定位更精确
    const latestEl = entryRefs.value[latestIndex.value]
    if (latestEl) {
      const containerRect = container.getBoundingClientRect()
      const elRect = latestEl.getBoundingClientRect()
      const offsetInContainer = elRect.top - containerRect.top + container.scrollTop
      // 让"最新一条"贴在容器底部上方 8px
      const targetTop = container.scrollHeight - container.clientHeight
      container.scrollTop = targetTop
    } else {
      container.scrollTop = container.scrollHeight
    }

    userScrolledAway.value = false
  })
}

/** 用户手动滚动时检测：若已离开底部 → 临时禁用自动滚动 */
function onLogScroll() {
  if (!logList.value) return
  const el = logList.value
  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  // 距离底部超过 12px 就认为是"用户主动向上滚动了"
  if (distanceToBottom > 12 && autoScroll.value) {
    userScrolledAway.value = true
  } else if (distanceToBottom <= 2) {
    // 回到底部时重置
    userScrolledAway.value = false
  }
}

/** 监听日志数变化：若仍处于"跟随最新"状态，则滚动到底部 */
watch(
  () => props.logs.length,
  (newLen, oldLen) => {
    if (newLen <= oldLen) return
    if (!autoScroll.value) return
    // 用户主动向上滚动时也不要抢
    if (userScrolledAway.value) return
    scrollToLatest(false)
  }
)

/** 切换自动滚动：开启时立即跳到最新 */
watch(autoScroll, (val) => {
  if (val) {
    userScrolledAway.value = false
    scrollToLatest(true)
  }
})

/** 用户点击展开/折叠面板或外部触发更新时，确保最新条可见 */
watch(isCollapsed, (val) => {
  if (!val) {
    nextTick(() => {
      if (autoScroll.value) scrollToLatest(false)
    })
  }
})

/** 初始挂载时滚到最新 */
onMounted(() => {
  scrollToLatest(true)
})
</script>

<style scoped>
.log-viewer {
  margin-top: 20px;
  background: var(--bg-card);
  border: 2px solid var(--border-default);
  border-radius: var(--radius-xs);
  overflow: hidden;
}

.log-viewer.collapsed .log-content {
  display: none;
}

.log-header {
  padding: 16px 20px;
  background: var(--bg-hover);
  border-bottom: 1px solid var(--border-default);
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.log-header:hover {
  background: var(--bg-alt);
}

.log-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--text-primary);
}

.log-icon {
  font-size: 1.2em;
}

.log-count {
  color: var(--text-tertiary);
  font-size: 0.9em;
  font-weight: normal;
}

.toggle-btn {
  padding: 6px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 0.9em;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-secondary);
}

.toggle-btn:hover {
  background: var(--bg-hover);
  border-color: var(--text-tertiary);
}

.log-content {
  padding: 16px;
  font-size: 10px;
}

.log-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-default);
}

.log-controls-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.clear-btn {
  padding: 6px 14px;
  background: var(--bg-card);
  color: var(--text-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 0.9em;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: var(--bg-hover);
  border-color: var(--text-tertiary);
}

.auto-scroll-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9em;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.auto-scroll-label.disabled {
  color: var(--text-tertiary);
}

.scroll-to-latest-btn {
  padding: 4px 12px;
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
  border: none;
  border-radius: var(--radius-lg);
  font-size: 0.82em;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  animation: latest-btn-pulse 1.6s ease-in-out infinite;
  transition: transform 0.15s;
}

.scroll-to-latest-btn:hover {
  transform: translateY(-1px);
  background: var(--button-primary-bg-hover);
}

@keyframes latest-btn-pulse {
  0%, 100% { box-shadow: var(--shadow-sm); }
  50% { box-shadow: var(--shadow-md); }
}

.log-list {
  max-height: 400px;
  overflow-y: auto;
  background: var(--bg-hover);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  padding: 12px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 0.85em;
  color: var(--text-secondary);
}

.log-entry {
  position: relative;
  padding: 6px 0 6px 10px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-secondary);
  line-height: 1.6;
}

.log-entry.has-meta {
  padding-left: 14px;
}

/* "最新一条" 视觉标记：细品牌色左线 + 极浅高亮底，弱化视觉冲击 */
.log-entry.is-latest {
  background: var(--brand-bg);
  border-left: 2px solid var(--brand);
  margin-left: -10px;
  padding-left: 18px;
  border-radius: var(--radius-sm);
}

.log-entry.is-latest.has-meta {
  margin-left: -14px;
  padding-left: 22px;
}

/* "最新" 角标 */
.log-entry.is-latest::after {
  content: '最新';
  position: absolute;
  right: 8px;
  top: 6px;
  font-size: 0.7em;
  font-weight: 600;
  color: var(--brand-text);
  background: var(--bg-card);
  border: 1px solid var(--brand-border);
  padding: 1px 8px;
  border-radius: var(--radius-md);
  letter-spacing: 0.5px;
  pointer-events: none;
}

.log-entry:last-child {
  border-bottom: none;
}

.log-time {
  color: var(--text-tertiary);
  margin-right: 8px;
}

.log-level {
  display: inline-block;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  font-weight: 600;
  margin-right: 8px;
  font-size: 0.85em;
  white-space: nowrap;
}

.log-entry.debug .log-level {
  background: var(--bg-alt);
  color: var(--text-tertiary);
}

.log-entry.info .log-level {
  background: var(--brand-bg);
  color: var(--brand-text);
}

.log-entry.warn .log-level {
  background: var(--warning-bg);
  color: var(--warning-text, var(--warning));
}

.log-entry.error .log-level {
  background: var(--error-bg);
  color: var(--error);
}

.log-agent {
  color: var(--brand-text);
  font-weight: 600;
  margin-right: 8px;
  white-space: nowrap;
  display: inline-block;
}

.log-role {
  font-weight: 600;
  margin-right: 8px;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  font-size: 0.85em;
}

.log-role.role-vision {
  background: color-mix(in srgb, var(--c-purple-500, #805ad5) 12%, var(--bg-card));
  color: var(--c-purple-600, #6b46c1);
}

.log-role.role-codegen {
  background: color-mix(in srgb, var(--c-teal-500, #38b2ac) 12%, var(--bg-card));
  color: var(--c-teal-600, #0d9488);
}

.log-role.role-validator {
  background: var(--warning-bg);
  color: var(--warning-text, var(--warning));
}

.log-role.role-figma {
  background: var(--brand-bg);
  color: var(--brand-text);
}

.log-role.role-default {
  background: var(--bg-alt);
  color: var(--text-secondary);
}

.log-message {
  color: var(--text-primary);
}

/* ===== JSON Meta 折叠/展开 ===== */
.log-meta-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding: 3px 10px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
  color: var(--text-tertiary);
  font-size: 0.9em;
}
.log-meta-toggle:hover {
  background: var(--brand-bg-hover);
  color: var(--brand-text);
}
.log-meta-toggle.expanded {
  color: var(--brand-text);
}
.meta-arrow {
  font-size: 0.75em;
  transition: transform 0.15s;
  width: 12px;
  text-align: center;
}
.meta-summary {
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 0.85em;
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 480px;
}

/* ===== JSON 代码块 ===== */
.log-meta {
  margin-top: 6px;
  margin-left: 0;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-left: 3px solid var(--brand);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 0.88em;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-x: auto;
}

/* JSON 语法高亮色（适配浅色底） */
.log-meta :deep(.hl-key) {
  color: var(--brand);
}
.log-meta :deep(.hl-string) {
  color: var(--c-green-600, #15803d);
}
.log-meta :deep(.hl-number) {
  color: var(--warning-text, var(--warning));
}
.log-meta :deep(.hl-bool) {
  color: var(--error);
}
.log-meta :deep(.hl-null) {
  color: var(--text-tertiary);
}

/* 滚动条样式 */
.log-list::-webkit-scrollbar {
  width: 8px;
}

.log-list::-webkit-scrollbar-track {
  background: var(--bg-alt);
  border-radius: var(--radius-xs);
}

.log-list::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: var(--radius-xs);
}

.log-list::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}
</style>
