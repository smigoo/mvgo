<template>
  <a-drawer
    :open="open"
    title="反馈给管理员"
    placement="right"
    :width="560"
    :body-style="{ padding: '0', background: 'var(--bg-card)' }"
    :header-style="{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-default)' }"
    @close="handleClose"
  >
    <div class="fb-shell">
      <div class="fb-scroll">
        <!-- 任务摘要：先把「反馈的是哪个任务」钉死，避免管理端来回对号 -->
        <div class="fb-card">
          <div class="fb-card-title">任务</div>
          <div class="fb-kv">
            <span class="fb-k">任务号</span>
            <span class="fb-v fb-mono">{{ sessionId || '-' }}</span>
          </div>
          <div class="fb-kv">
            <span class="fb-k">组件</span>
            <span class="fb-v">{{ task?.displayName || task?.componentName || '未命名组件' }}</span>
          </div>
          <div class="fb-kv">
            <span class="fb-k">状态</span>
            <span class="fb-v">
              <span class="fb-status" :class="'fb-status--' + (task?.status || 'unknown')">{{ task?.status || '-' }}</span>
              <span v-if="task?.target" class="fb-tag">{{ task.target }}</span>
            </span>
          </div>
        </div>

        <!-- 类别 -->
        <div class="fb-field">
          <div class="fb-label">问题类型</div>
          <div class="fb-cats">
            <button
              v-for="c in CATEGORIES"
              :key="c.value"
              type="button"
              class="fb-cat"
              :class="{ 'fb-cat--on': category === c.value }"
              @click="category = c.value"
            >
              {{ c.label }}
            </button>
          </div>
        </div>

        <!-- 描述 -->
        <div class="fb-field">
          <div class="fb-label">
            问题描述
            <span class="fb-required">*</span>
            <span class="fb-counter">{{ description.length }}/2000</span>
          </div>
          <textarea
            v-model="description"
            class="fb-textarea"
            maxlength="2000"
            rows="4"
            placeholder="哪里不对？例如：预览时图表高度被压扁、文字与设计稿不符、接口绑定后数据不显示…"
          ></textarea>
        </div>

        <!-- 数据项勾选 -->
        <div class="fb-field">
          <div class="fb-label">随附数据</div>
          <div class="fb-tip">
            模型 / Figma 链接 / Token 指纹由服务端从任务与你的配置读取，前端不传原始值。
          </div>
          <label v-for="item in dataItems" :key="item.key" class="fb-check" :class="{ 'fb-check--off': !item.available }">
            <input v-model="includes" type="checkbox" :value="item.key" :disabled="!item.available" />
            <span class="fb-check-body">
              <span class="fb-check-title">{{ item.label }}</span>
              <span class="fb-check-desc">{{ item.desc }}</span>
            </span>
          </label>
        </div>

        <!-- 🆕 2026-11-06 自动随附：输入图 / 输出效果图（服务端快照自动带，无勾选项） -->
        <div class="fb-field" v-if="taskImagesPreview.length && brokenImages.size < taskImagesPreview.length">
          <div class="fb-label">任务图片（自动随附）</div>
          <div class="fb-tip">输入图与产物截图随反馈自动提交给管理员，用于对照定位生成质量问题。</div>
          <div class="fb-images">
            <div v-for="img in taskImagesPreview" :key="img.label" class="fb-img-card">
              <!-- 🔴 2026-11-06 修：图不存在（如任务未产出 rendered.png）时不要再渲染 <img>，
                   否则页面出现破图。onerror 后降级为占位说明。 -->
              <div v-if="brokenImages.has(img.label)" class="fb-img-missing">
                <span class="fb-img-missing-icon">🖼️</span>
                <span>{{ img.label === '输出效果' ? '该任务未生成产物截图' : '输入图缺失' }}</span>
              </div>
              <img
                v-else
                :src="img.url"
                :alt="img.label"
                class="fb-img"
                loading="lazy"
                @error="markImageBroken(img.label)"
              />
              <span class="fb-img-label">{{ img.label }}</span>
            </div>
          </div>
        </div>

        <!-- 截图 -->
        <div class="fb-field">
          <div class="fb-label">截图（可选）</div>
          <div class="fb-tip">最多 8MB，支持 PNG / JPG / WebP。截图会存到服务端并只对管理员可见。</div>
          <div v-if="!screenshot" class="fb-upload">
            <input ref="fileInputRef" type="file" accept="image/png,image/jpeg,image/webp" class="fb-file" @change="onPickFile" />
            <button type="button" class="fb-upload-btn" @click="fileInputRef?.click()">＋ 选择截图</button>
          </div>
          <div v-else class="fb-shot">
            <img :src="screenshotUrl || ''" class="fb-shot-img" alt="截图预览" />
            <div class="fb-shot-meta">
              <span class="fb-shot-name">{{ screenshot.name }}</span>
              <span class="fb-shot-size">{{ formatSize(screenshot.size) }}</span>
            </div>
            <button type="button" class="fb-shot-del" @click="clearScreenshot">移除</button>
          </div>
        </div>
      </div>

      <div class="fb-footer">
        <a-button :disabled="submitting" @click="handleClose">取消</a-button>
        <a-button type="primary" :loading="submitting" :disabled="!description.trim()" @click="handleSubmit">
          提交反馈
        </a-button>
      </div>
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { submitTaskFeedback, type FeedbackCategory, type FeedbackInclude } from '@/api/feedback'

const props = defineProps<{
  open: boolean
  sessionId: string
  task: Record<string, any> | null
  /** TaskDetail 的 logLines（完整日志行，非筛选后） */
  logs: any[]
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'submitted'): void
}>()

const CATEGORIES: Array<{ value: FeedbackCategory; label: string }> = [
  { value: 'bug', label: '功能异常' },
  { value: 'quality', label: '生成质量' },
  { value: 'suggestion', label: '体验建议' },
  { value: 'other', label: '其他' },
]

/** 单个截图体积上限，与后端 FEEDBACK_MAX_FILE_BYTES 对齐 */
const MAX_SHOT_BYTES = 8 * 1024 * 1024
/** 日志体积上限，与后端 DEFAULT_LOG_MAX_BYTES 对齐（前端先截一层省带宽） */
const MAX_LOG_BYTES = 512 * 1024

const category = ref<FeedbackCategory>('bug')
const description = ref('')
const includes = ref<FeedbackInclude[]>(['logs', 'models', 'figmaUrl', 'token'])
const submitting = ref(false)

const fileInputRef = ref<HTMLInputElement | null>(null)
const screenshot = ref<File | null>(null)
const screenshotUrl = ref('')

const modelsPreview = computed<string[]>(() => {
  const cm = props.task?.completionModels
  const used = new Set<string>()
  const split = (s: any) =>
    String(s || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  if (cm) {
    split(cm.visionModel).forEach((m) => used.add(m))
    split(cm.textModel).forEach((m) => used.add(m))
    if (used.size) return Array.from(used)
  }
  const snap = props.task?.configSnapshot
  if (!snap) return []
  if (snap.unifiedModel && snap.modelMode === 'unified') used.add(snap.unifiedModel)
  else {
    if (snap.visionModel) used.add(snap.visionModel)
    if (snap.textModel) used.add(snap.textModel)
  }
  return Array.from(used)
})

const figmaUrlPreview = computed(() => {
  const fileKey = props.task?.fileKey
  const nodeId = props.task?.nodeId
  if (!fileKey || !nodeId) return ''
  const name = encodeURIComponent(props.task?.componentName || 'design')
  return `https://www.figma.com/design/${fileKey}/${name}?node-id=${String(nodeId).replace(/:/g, '-')}`
})

/**
 * 🆕 2026-11-06 自动随附的任务图片预览（仅展示，提交时服务端按任务产物路径自动落快照）：
 * - input：Figma 输入图 resources/images/mc-preview.png
 * - output：产物渲染截图 .mc-gen/screenshots/<sessionId>-rendered.png
 * 取图走 /api/component/:cid/file?path=...&raw=1（SessionGuard，前端 http 通道自动带 Token）。
 */
/** 加载失败的图（按 label 记），用于把破图降级成占位说明 */
const brokenImages = ref<Set<string>>(new Set())
const markImageBroken = (label: string) => {
  const next = new Set(brokenImages.value)
  next.add(label)
  brokenImages.value = next
}

const taskImagesPreview = computed(() => {
  const t = props.task
  if (!t) return []
  const cid = t.componentId || t.sessionId
  if (!cid) return []
  const fileUrl = (path: string) =>
    `/api/component/${encodeURIComponent(String(cid))}/file?path=${encodeURIComponent(path)}&raw=1`
  const list: Array<{ label: string; url: string }> = []
  list.push({ label: '输入图', url: fileUrl('resources/images/mc-preview.png') })
  if (t.sessionId) {
    const safe = String(t.sessionId).replace(/[^a-zA-Z0-9._-]/g, '_')
    list.push({ label: '输出效果', url: fileUrl(`.mc-gen/screenshots/${safe}-rendered.png`) })
  }
  return list
})

/** 日志行 → 纯文本（与详情页日志面板展示同构，用户所见即所提） */
const logsText = computed(() => {
  const lines = Array.isArray(props.logs) ? props.logs : []
  if (!lines.length) return ''
  const render = (l: any) => {
    const ts = l?.time || '-'
    const model = l?.model ? `[${l.model}]` : ''
    const lv = String(l?.level || 'info').toUpperCase()
    const msg = l?.message ?? l?.label ?? ''
    const count = l?.count > 1 ? ` ×${l.count}` : ''
    return `[${ts}]${model} ${lv} ${msg}${count}`
  }
  const all = lines.map(render)
  const text = all.join('\n')
  if (new TextEncoder().encode(text).length <= MAX_LOG_BYTES) return text
  // 超限：首 200 行（从哪个阶段开始）+ 尾 300 行（错误通常在末尾）
  const head = all.slice(0, 200).join('\n')
  const tail = all.slice(-300).join('\n')
  return `${head}\n\n... [前端已截断：共 ${all.length} 行，仅提交首 200 + 尾 300 行；服务端会再按 512KB 截断] ...\n\n${tail}`
})

const logsBytes = computed(() => new TextEncoder().encode(logsText.value).length)

const dataItems = computed(() => [
  {
    key: 'logs' as FeedbackInclude,
    label: '任务日志',
    desc: logsText.value ? `${props.logs.length} 行 · 约 ${formatSize(logsBytes.value)}（自动脱敏后截断）` : '当前没有日志可提交',
    available: Boolean(logsText.value),
  },
  {
    key: 'models' as FeedbackInclude,
    label: '模型',
    desc: modelsPreview.value.length ? modelsPreview.value.join(' / ') : '未记录到实际调用的模型',
    available: modelsPreview.value.length > 0,
  },
  {
    key: 'figmaUrl' as FeedbackInclude,
    label: 'Figma 链接',
    desc: figmaUrlPreview.value || '该任务没有 Figma 来源',
    available: Boolean(figmaUrlPreview.value),
  },
  {
    key: 'token' as FeedbackInclude,
    label: 'Figma Token 指纹',
    desc: '提交任务实际使用的那个 Token 的指纹（前 6 位 + 后 4 位），用于核对是哪个 Token，不含明文',
    available: true,
  },
])

/** 不可用的数据项从勾选中剔除（否则用户会以为提交了实际没提交的内容） */
watch(
  dataItems,
  (items) => {
    const available = new Set(items.filter((i) => i.available).map((i) => i.key))
    const next = includes.value.filter((k) => available.has(k))
    if (next.length !== includes.value.length) includes.value = next
  },
  { immediate: true },
)

watch(
  () => props.open,
  (open) => {
    if (open) return
    // 关闭时释放预览 URL，避免内存泄漏
    if (screenshotUrl.value) {
      URL.revokeObjectURL(screenshotUrl.value)
      screenshotUrl.value = ''
    }
  },
)

// 换任务 / 重开抽屉时，清掉上一次的「破图」标记（否则旧任务缺图会一直显示占位）
watch(
  () => [props.open, props.sessionId],
  () => {
    if (brokenImages.value.size) brokenImages.value = new Set()
  },
)

onBeforeUnmount(() => {
  if (screenshotUrl.value) URL.revokeObjectURL(screenshotUrl.value)
})

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function onPickFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许连续选同一个文件
  if (!file) return
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
    message.warning('截图仅支持 PNG / JPG / WebP')
    return
  }
  if (file.size > MAX_SHOT_BYTES) {
    message.warning(`截图不能超过 ${formatSize(MAX_SHOT_BYTES)}`)
    return
  }
  if (screenshotUrl.value) URL.revokeObjectURL(screenshotUrl.value)
  screenshot.value = file
  screenshotUrl.value = URL.createObjectURL(file)
}

function clearScreenshot() {
  if (screenshotUrl.value) URL.revokeObjectURL(screenshotUrl.value)
  screenshotUrl.value = ''
  screenshot.value = null
}

function handleClose() {
  if (submitting.value) return
  emit('update:open', false)
}

function resetForm() {
  category.value = 'bug'
  description.value = ''
  includes.value = ['logs', 'models', 'figmaUrl', 'token']
  clearScreenshot()
}

async function handleSubmit() {
  if (submitting.value) return
  const text = description.value.trim()
  if (!text) {
    message.warning('请先描述遇到的问题')
    return
  }
  submitting.value = true
  try {
    const res = await submitTaskFeedback(props.sessionId, {
      category: category.value,
      description: text,
      includes: includes.value,
      logsText: includes.value.includes('logs') ? logsText.value : undefined,
      pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      screenshot: screenshot.value,
    })
    if (res?.duplicate) {
      message.warning(res.message || '该任务刚提交过反馈，请等管理员处理')
      return
    }
    message.success('反馈已提交，管理员会尽快处理')
    resetForm()
    emit('submitted')
    emit('update:open', false)
  } catch (error: any) {
    // 后端 403（非任务所有者）/ 404（任务不存在）/ 400（参数非法）都会带 message
    message.error(error?.message || '反馈提交失败')
  } finally {
    submitting.value = false
  }
}
</script>

<!--
  配色一律走 themes/tokens.css 的语义令牌，禁止硬编码 hex：
  <html data-theme="light|dark"> 切换时本组件自动跟随，无需任何 JS 分支。
  按钮直接用 <a-button>，由 ConfigProvider 的 algorithm + ui-components.less 的 .ant-btn 统一接管，
  不要再手写 .fb-btn（旧实现写死 #1890ff/#131c27，浅色主题下整块是深色石板）。
-->
<style scoped>
.fb-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--text-primary);
  font-size: 13px;
}

.fb-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 8px;
}

.fb-card {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--bg-alt);
  padding: 12px 14px;
  margin-bottom: 16px;
}

.fb-card-title {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 8px;
  letter-spacing: 0.04em;
}

.fb-kv {
  display: flex;
  gap: 10px;
  line-height: 22px;
}

.fb-k {
  color: var(--text-secondary);
  flex: 0 0 56px;
}

.fb-v {
  flex: 1;
  min-width: 0;
  color: var(--text-primary);
  word-break: break-all;
}

.fb-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.fb-status {
  display: inline-block;
  padding: 0 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  line-height: 18px;
  background: var(--bg-alt);
  color: var(--text-secondary);
}

.fb-status--failed {
  background: var(--task-failed-bg);
  color: var(--task-failed-text);
}

.fb-status--completed {
  background: var(--task-success-bg);
  color: var(--task-success-text);
}

.fb-status--running {
  background: var(--task-running-bg);
  color: var(--task-running-text);
}

.fb-tag {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-alt);
  color: var(--brand-text);
  font-size: 11px;
}

.fb-field {
  margin-bottom: 18px;
}

.fb-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.fb-required {
  color: var(--error);
}

.fb-counter {
  margin-left: auto;
  color: var(--text-quaternary);
  font-size: 11px;
}

.fb-tip {
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 16px;
  margin: -4px 0 8px;
}

.fb-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fb-cat {
  padding: 5px 14px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  background: var(--bg-alt);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.fb-cat:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.fb-cat--on {
  border-color: var(--brand);
  background: var(--brand-bg);
  color: var(--brand-text);
}

.fb-textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 84px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.6;
  outline: none;
  font-family: inherit;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.fb-textarea:focus {
  border-color: var(--brand);
  box-shadow: var(--shadow-focus);
}

.fb-textarea::placeholder {
  color: var(--text-tertiary);
}

.fb-check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 9px 12px;
  margin-bottom: 6px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-alt);
  cursor: pointer;
}

.fb-check--off {
  opacity: 0.45;
  cursor: not-allowed;
}

.fb-check input {
  margin-top: 2px;
  accent-color: var(--brand);
}

.fb-check-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.fb-check-title {
  color: var(--text-primary);
  font-size: 12px;
}

.fb-check-desc {
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 16px;
  word-break: break-all;
}

.fb-upload {
  display: flex;
  align-items: center;
}

.fb-file {
  display: none;
}

.fb-upload-btn {
  padding: 6px 16px;
  border-radius: var(--radius-full);
  border: 1px dashed var(--border-strong);
  background: transparent;
  color: var(--brand-text);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.fb-upload-btn:hover {
  border-color: var(--brand);
  background: var(--brand-bg);
}

.fb-shot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-alt);
}

.fb-shot-img {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: var(--radius-md);
  background: var(--bg-disabled);
}

.fb-shot-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.fb-shot-name {
  color: var(--text-primary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fb-shot-size {
  color: var(--text-tertiary);
  font-size: 11px;
}

.fb-shot-del {
  border: none;
  background: transparent;
  color: var(--error);
  font-size: 12px;
  cursor: pointer;
}

/* 🆕 2026-11-06 自动随附任务图片（输入图 / 输出效果） */
.fb-images {
  display: flex;
  gap: 10px;
}
.fb-img-card {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-alt);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.fb-img {
  width: 100%;
  height: 96px;
  object-fit: cover;
  object-position: top;
  border-radius: var(--radius-sm);
  background: var(--bg-disabled);
}
.fb-img-label {
  font-size: 11px;
  color: var(--text-tertiary);
  text-align: center;
}
/* 图缺失时的占位（与 .fb-img 同高，避免布局跳动） */
.fb-img-missing {
  width: 100%;
  height: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: var(--radius-sm);
  background: var(--bg-disabled);
  color: var(--text-tertiary);
  font-size: 11px;
  text-align: center;
  padding: 0 6px;
}
.fb-img-missing-icon {
  font-size: 16px;
  opacity: 0.6;
}

.fb-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid var(--border-default);
  background: var(--bg-card);
}
</style>
