<template>
  <div class="lab-panel">
    <div class="lab-head" role="button" tabindex="0" @click="open = !open" @keydown.enter.prevent="open = !open">
      <div class="lab-title">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M9 3h6M10 3v6.5L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.5V3" />
        </svg>
        实验管线：lite 布局 + 真值回填
      </div>
      <span class="lab-toggle">{{ open ? '收起' : '展开' }}</span>
    </div>

    <div v-if="open" class="lab-body">

      <div class="lab-field">
        <span class="lab-label">Figma 链接（含 node-id）</span>
        <div class="lab-input-row">
          <input
            v-model="figmaUrl"
            class="lab-input"
            placeholder="https://www.figma.com/file/...?node-id=1-2"
            :disabled="running"
            autocomplete="off"
            @focus="onUrlFocus"
            @blur="onUrlBlur"
          />
          <button
            v-if="historyItems.length"
            type="button"
            class="lab-hist-btn"
            :class="{ active: historyOpen }"
            :disabled="running"
            title="最近使用（与正常生成入口同一列表）"
            @click="toggleHistory"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </button>
        </div>
        <!-- 🔴 2026-11-05：历史列表**只有一个数据源** —— 正常生成入口的 `figmaHistoryTasks`
             （/api/tasks/recent 任务维度重建链接）经 props 传入，实验面板不另存一份。
             实验任务自身也带 fileKey/nodeId 落库，跑完即进同一列表。 -->
        <div v-if="historyOpen && historyItems.length" class="lab-history">
          <div class="lab-history-head">
            <span>最近生成任务</span>
            <span class="lab-history-hint">与正常入口共用</span>
          </div>
          <div
            v-for="h in historyItems"
            :key="h.sessionId || h.url"
            class="lab-history-item"
            :title="`${h.kindLabel || ''} ${h.nodeId || ''}`.trim()"
            @mousedown.prevent="pickHistory(h)"
          >
            <span class="lab-history-dot" :class="`is-${h.status || 'unknown'}`"></span>
            <span class="lab-history-name">{{ h.name || h.url }}</span>
            <span v-if="h.kindLabel" class="lab-history-kind">{{ h.kindLabel }}</span>
            <span class="lab-history-node">{{ h.nodeId || '整个文件' }}</span>
            <span class="lab-history-time">{{ timeText(h.startTime) }}</span>
          </div>
        </div>
      </div>

      <label class="lab-field">
        <span class="lab-label">组件类型</span>
        <select v-model="compType" class="lab-input" :disabled="running">
          <option value="microcode">微码 microcode</option>
          <option value="vue3">Vue3</option>
        </select>
      </label>

      <button class="lab-btn" :disabled="running || !figmaUrl.trim()" @click="run">
        {{ running ? '运行中…' : '运行实验管线' }}
      </button>

      <div v-if="logs.length" class="lab-logs">
        <div v-for="(l, i) in logs" :key="i" class="lab-log" :class="`lab-log--${l.kind}`">{{ l.text }}</div>
      </div>

      <div v-if="report" class="lab-result">
        <div v-if="report.status === 'error'" class="lab-err">实验失败：{{ report.error }}</div>
        <template v-else>
          <div class="lab-sec-title">匹配统计（判据单一来源 truthBackfill）</div>
          <div class="lab-stat-grid">
            <div class="lab-stat"><b>{{ s.evaluated ?? 0 }}</b><span>figma 文本</span></div>
            <div class="lab-stat"><b>{{ s.exact ?? 0 }}</b><span>精确命中</span></div>
            <div class="lab-stat"><b>{{ s.substr ?? 0 }}</b><span>子串命中</span></div>
            <div class="lab-stat"><b>{{ s.miss ?? 0 }}</b><span>未命中</span></div>
            <div class="lab-stat"><b>{{ s.colorApplied ?? 0 }}</b><span>颜色回填</span></div>
            <div class="lab-stat"><b>{{ s.fontSizeApplied ?? 0 }}</b><span>字号回填</span></div>
            <div class="lab-stat"><b>{{ s.sizeApplied ?? 0 }}</b><span>尺寸回填</span></div>
            <div class="lab-stat"><b>{{ s.assetMounted ?? 0 }}/{{ s.assets ?? 0 }}</b><span>资源挂载</span></div>
          </div>
          <div v-if="s.assetNoAnchor || s.assetNoSiblingTexts || s.assetNoFile" class="lab-preview-note">
            资源未挂载原因：无锚点 {{ s.assetNoAnchor ?? 0 }} · 图标无兄弟文本 {{ s.assetNoSiblingTexts ?? 0 }} · 文件缺失 {{ s.assetNoFile ?? 0 }}
          </div>

          <div class="lab-sec-title">回填明细（前 12 条）</div>
          <div class="lab-edits">
            <div v-for="(e, i) in editList.slice(0, 12)" :key="i" class="lab-edit">
              <span class="lab-edit-tag">{{ e.tag }}</span>
              <span class="lab-edit-text" :title="e.anchorText">{{ e.anchorText }}</span>
              <span class="lab-edit-type" :class="`lab-edit-type--${e.matchType}`">{{ e.matchType === 'exact' ? '精确' : '子串' }}</span>
              <span class="lab-edit-applied">{{ formatApplied(e.applied) }}</span>
            </div>
            <div v-if="!editList.length" class="lab-empty">无回填明细（可能全部未命中或产物为插值文本）</div>
          </div>

          <div class="lab-sec-title">产物预览</div>
          <div v-if="report.workspaceSynced" class="lab-sync-ok">
            ✅ 回填已同步 workspace ——
            <a class="lab-link" :href="`#/tasks/${report.sessionId}`" target="_blank">打开任务详情页看回填后实时预览 →</a>
          </div>
          <div class="lab-preview-note">下方截图是 Stage A（回填前）的静态渲染，仅供对照；回填后的真实效果看上面任务详情页。</div>
          <img
            v-if="report.outputPath"
            class="lab-preview"
            :src="artifactUrl('mc-preview.png')"
            alt="Stage A 回填前渲染"
            @error="previewFailed = true"
          />
          <div v-if="previewFailed" class="lab-empty">预览图不存在（mc-preview.png）</div>
          <details class="lab-code-wrap">
            <summary>查看回填后 index.vue</summary>
            <div class="lab-code-actions">
              <button class="lab-btn lab-btn--mini" @click="loadCode">加载代码</button>
            </div>
            <pre v-if="codeText" class="lab-code">{{ codeText }}</pre>
          </details>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { createLiteProgressStream } from '@/api/lite'
import { fetchLabReport, labArtifactUrl, runLiteLab, type LabReport } from '@/api/lite-lab'

/**
 * 🔴 2026-11-05：历史 URL 列表**由父级传入**（`components.vue` 的 figmaHistoryTasks）。
 *   原因：那是「最近生成任务」下拉的唯一数据源（/api/tasks/recent 按 fileKey/nodeId
 *   重建链接 + 按 链接×类型 去重）。实验面板若自己再存一份 localStorage，
 *   同一个设计稿在两边就是两条互不可见的历史。这里只接收、只回填，不落库。
 */
interface LabHistoryItem {
  sessionId?: string
  name?: string
  url?: string
  fileKey?: string
  nodeId?: string
  status?: string
  kindLabel?: string
  kindClass?: string
  /** 🧪 实验任务标记：components.vue#taskKindInfo 的 lab 分支产出 */
  isLab?: boolean
  /** 实验任务的真实产物类型（is-lab 只管徽章配色，类型靠这个还原） */
  labTarget?: 'microcode' | 'vue3'
  startTime?: number | null
}
const props = defineProps<{ history?: LabHistoryItem[] }>()
const emit = defineEmits<{ finished: [] }>()

const open = ref(false)
const figmaUrl = ref('')
const historyOpen = ref(false)
const historyItems = computed(() => props.history || [])
const compType = ref<'microcode' | 'vue3'>('microcode')
const running = ref(false)
const logs = ref<Array<{ kind: 'info' | 'warn' | 'error' | 'ok'; text: string }>>([])
const sessionId = ref('')
const report = ref<LabReport | null>(null)
const codeText = ref('')
const previewFailed = ref(false)

let es: EventSource | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let pollCount = 0

const s = computed(() => report.value?.stats || {})
const editList = computed(() => {
  const all: any[] = []
  for (const f of report.value?.edits || []) all.push(...(f.edits || []))
  return all
})

function log(kind: 'info' | 'warn' | 'error' | 'ok', text: string) {
  logs.value.push({ kind, text })
  if (logs.value.length > 200) logs.value.splice(0, logs.value.length - 200)
}

function artifactUrl(path: string) {
  return labArtifactUrl(sessionId.value, path)
}

function formatApplied(applied: Record<string, string>) {
  return Object.entries(applied)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')
}

// ── 历史列表交互（数据来自 props，见文件头说明） ──
function timeText(t?: number | null) {
  if (!t) return ''
  const diff = Date.now() - Number(t)
  if (!Number.isFinite(diff) || diff < 0) return ''
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  return new Date(Number(t)).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function toggleHistory() {
  if (running.value) return
  historyOpen.value = !historyOpen.value
}

function onUrlFocus() {
  if (historyItems.value.length && !running.value) historyOpen.value = true
}

function onUrlBlur() {
  // 延迟关闭：让 mousedown 先命中条目（与 component.vue 同策略）
  setTimeout(() => {
    historyOpen.value = false
  }, 200)
}

function pickHistory(h: LabHistoryItem) {
  if (h.url) figmaUrl.value = h.url
  // 类型跟随条目：微码 / Vue3 是不同产物，只回填链接会跑成另一类。
  // 🧪 实验任务（kindClass='is-lab'）的真实类型在 labTarget —— 徽章类名不携带类型。
  if (h.kindClass === 'is-vue3') compType.value = 'vue3'
  else if (h.kindClass === 'is-lab') compType.value = h.labTarget === 'vue3' ? 'vue3' : 'microcode'
  else if (h.kindClass === 'is-mc' || h.kindClass === 'is-max' || h.kindClass === 'is-lite') {
    compType.value = 'microcode'
  }
  historyOpen.value = false
}

function stopStreams() {
  if (es) {
    es.close()
    es = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function startPoll() {
  if (pollTimer) return
  pollCount = 0
  pollTimer = setInterval(async () => {
    pollCount += 1
    if (pollCount > 120) {
      stopStreams()
      log('error', '轮询超时：未拿到 lab 报告')
      running.value = false
      return
    }
    try {
      const r = await fetchLabReport(sessionId.value)
      if (r?.status === 'done' || r?.status === 'error') {
        stopStreams()
        report.value = r
        running.value = false
        log(r.status === 'done' ? 'ok' : 'error', r.status === 'done' ? '实验完成' : `实验失败：${r.error}`)
        // 实验任务已带 fileKey/nodeId 落库 ⇒ 通知父级重取 recent，
        // 让这次实验立刻出现在（两边共用的）历史列表里。
        emit('finished')
      }
    } catch {
      /* 404 = 报告未生成，继续轮询 */
    }
  }, 2000)
}

function listenProgress() {
  es = createLiteProgressStream(sessionId.value)
  es.onmessage = (ev) => {
    try {
      const d = JSON.parse(ev.data)
      if (d.type === 'progress') {
        log('info', `[${d.stage}] ${d.message || ''}`)
      } else if (d.type === 'complete') {
        // Stage A 的 lite 会先发一次 complete 关掉 SSE；
        // 重连继续收 Stage B/C 进度，报告以轮询为准
        es?.close()
        es = null
        if (running.value) {
          log('info', 'lite 布局阶段完成，继续真值回填阶段…')
          setTimeout(listenProgress, 500)
          startPoll()
        }
      } else if (d.type === 'error') {
        log('error', d.message || '任务失败')
      }
    } catch {
      /* 非 JSON 心跳忽略 */
    }
  }
  es.onerror = () => {
    /* SSE 断开由轮询兜底 */
  }
}

async function run() {
  if (running.value || !figmaUrl.value.trim()) return
  stopStreams()
  logs.value = []
  report.value = null
  codeText.value = ''
  previewFailed.value = false
  running.value = true
  log('info', '提交 lite-lab 实验任务…')
  try {
    const r = await runLiteLab({
      figmaUrl: figmaUrl.value.trim(),
      componentType: compType.value,
      groupId: localStorage.getItem('currentGroupId') || 'default-group',
      applyColor: true,
      applyFontSize: true,
      applySizes: true,
    })
    sessionId.value = r.sessionId
    log('ok', `已启动：${r.sessionId}`)
    // 任务已落库（含 fileKey/nodeId）⇒ 立刻让历史列表可见，不必等跑完
    emit('finished')
    listenProgress()
    startPoll()
  } catch (e: any) {
    running.value = false
    log('error', e?.response?.data?.message || e?.message || '启动失败')
  }
}

async function loadCode() {
  try {
    const res = await fetch(artifactUrl('package/index.vue'))
    codeText.value = await res.text()
  } catch (e: any) {
    codeText.value = `加载失败：${e?.message}`
  }
}

onBeforeUnmount(stopStreams)
</script>

<style scoped>
.lab-panel {
  margin-top: var(--s3, 12px);
  border: 1px solid rgba(125, 125, 145, 0.28);
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
}
.lab-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
}
.lab-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}
.lab-toggle {
  font-size: 12px;
  opacity: 0.6;
}
.lab-body {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lab-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.7;
}
.lab-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lab-label {
  font-size: 11px;
  opacity: 0.65;
}
.lab-input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border: 1px solid rgba(125, 125, 145, 0.35);
  border-radius: 999px;
  font-size: 12px;
  background: transparent;
  color: inherit;
  outline: none;
}
.lab-input:focus {
  border-color: rgba(90, 120, 255, 0.7);
}
/* 输入行 + 历史按钮（历史按钮只在有记录时出现，与正常入口同条件） */
.lab-input-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}
.lab-input-row .lab-input {
  flex: 1;
  min-width: 0;
}
.lab-hist-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(125, 125, 145, 0.35);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
}
.lab-hist-btn:hover:not(:disabled),
.lab-hist-btn.active {
  opacity: 1;
  border-color: rgba(90, 120, 255, 0.7);
  color: #4c6ef5;
}
.lab-hist-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.lab-history {
  margin-top: 6px;
  border: 1px solid var(--border, rgba(125, 125, 145, 0.28));
  border-radius: 8px;
  background: var(--surface, #fff);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  overflow: hidden;
  max-height: 240px;
  overflow-y: auto;
}
.lab-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-soft, rgba(125, 125, 145, 0.16));
}
.lab-history-hint {
  font-weight: 400;
  opacity: 0.5;
}
.lab-history-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 11px;
  cursor: pointer;
}
.lab-history-item:hover {
  background: rgba(76, 110, 245, 0.08);
}
.lab-history-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(125, 125, 145, 0.5);
}
.lab-history-dot.is-completed { background: #2f9e44; }
.lab-history-dot.is-running { background: #4c6ef5; }
.lab-history-dot.is-failed,
.lab-history-dot.is-error { background: #e03131; }
.lab-history-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lab-history-kind {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(76, 110, 245, 0.12);
  color: #4c6ef5;
  font-size: 10px;
}
.lab-history-node {
  flex-shrink: 0;
  opacity: 0.55;
  font-size: 10px;
}
.lab-history-time {
  flex-shrink: 0;
  opacity: 0.45;
  font-size: 10px;
}
.lab-btn {
  align-self: flex-start;
  padding: 7px 18px;
  border: none;
  border-radius: 999px;
  background: #4c6ef5;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.lab-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.lab-btn--mini {
  padding: 4px 12px;
  font-size: 12px;
}
.lab-logs {
  max-height: 150px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px dashed rgba(125, 125, 145, 0.3);
  border-radius: 8px;
  padding: 8px;
}
.lab-log {
  font-size: 11px;
  line-height: 1.5;
  word-break: break-all;
  opacity: 0.75;
}
.lab-log--ok { color: #2f9e44; }
.lab-log--warn { color: #e8890c; }
.lab-log--error { color: #e03131; }
.lab-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lab-sec-title {
  font-size: 12px;
  font-weight: 600;
  margin-top: 4px;
}
.lab-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.lab-stat {
  border: 1px solid rgba(125, 125, 145, 0.25);
  border-radius: 8px;
  padding: 6px 4px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lab-stat b {
  font-size: 15px;
}
.lab-stat span {
  font-size: 10px;
  opacity: 0.6;
}
.lab-edits {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}
.lab-edit {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  border: 1px solid rgba(125, 125, 145, 0.2);
  border-radius: 6px;
  padding: 4px 8px;
}
.lab-edit-tag {
  opacity: 0.55;
  flex-shrink: 0;
}
.lab-edit-text {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lab-edit-type {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 10px;
}
.lab-edit-type--exact { background: rgba(47, 158, 68, 0.15); color: #2f9e44; }
.lab-edit-type--substr { background: rgba(232, 137, 12, 0.15); color: #e8890c; }
.lab-edit-applied {
  margin-left: auto;
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lab-empty {
  font-size: 12px;
  opacity: 0.55;
}
.lab-err {
  font-size: 12px;
  color: #e03131;
}
.lab-preview {
  width: 100%;
  border: 1px solid rgba(125, 125, 145, 0.3);
  border-radius: 8px;
}
.lab-sync-ok {
  font-size: 12px;
  color: #2f9e44;
}
.lab-link {
  color: #4c6ef5;
  text-decoration: none;
}
.lab-preview-note {
  font-size: 11px;
  opacity: 0.55;
}
.lab-code-wrap summary {
  font-size: 12px;
  cursor: pointer;
  opacity: 0.75;
}
.lab-code-actions {
  margin: 6px 0;
}
.lab-code {
  max-height: 260px;
  overflow: auto;
  font-size: 11px;
  line-height: 1.5;
  background: rgba(127, 127, 145, 0.08);
  border-radius: 8px;
  padding: 8px;
  margin: 0;
}
</style>
