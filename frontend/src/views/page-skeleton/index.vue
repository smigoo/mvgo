<template>
  <div class="ps-page">
    <header class="ps-head">
      <h1 class="ps-title">页面骨架生成器</h1>
      <p class="ps-sub">
        上传大屏截图或粘贴 Figma 链接，AI 分析布局并生成自适应 Vue3 页面骨架（vw/vh 响应式 + 地图压底 + 公司 Vue3 规范）。
      </p>
    </header>

    <!-- ═══ 创建区 ═══ -->
    <section class="ps-card ps-create">
      <div class="ps-source-tabs" role="tablist" aria-label="输入来源">
        <button
          type="button"
          class="ps-tab"
          :class="{ active: source === 'screenshot' }"
          :aria-selected="source === 'screenshot'"
          @click="source = 'screenshot'"
        >
          上传截图
        </button>
        <button
          type="button"
          class="ps-tab"
          :class="{ active: source === 'figma' }"
          :aria-selected="source === 'figma'"
          @click="source = 'figma'"
        >
          Figma 链接
        </button>
      </div>

      <div class="ps-fields">
        <div class="ps-field">
          <label>名称</label>
          <input v-model="name" class="ps-input" placeholder="留空则用 AI 识别的标题" />
        </div>
        <div class="ps-field">
          <label>分组 groupId</label>
          <input v-model="groupId" class="ps-input" placeholder="default-group" />
        </div>
      </div>

      <!-- 截图上传 -->
      <div v-if="source === 'screenshot'" class="ps-field">
        <label>大屏截图</label>
        <div
          class="ps-dropzone"
          :class="{ 'is-dragging': dragging }"
          @click="pickFile"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile" />
          <img v-if="previewUrl" :src="previewUrl" class="ps-preview" alt="截图预览" />
          <div v-else class="ps-drop-hint">
            <span class="ps-drop-icon">+</span>
            <span>点击或拖拽大屏截图到此处</span>
          </div>
        </div>
      </div>

      <!-- Figma URL -->
      <div v-else class="ps-field">
        <label>Figma 链接</label>
        <div
          v-if="!figmaEnabled"
          style="color:var(--warning);background:var(--warning-bg);border:1px solid var(--warning-border);padding:8px 10px;border-radius:8px;font-size:12px;margin-bottom:8px;line-height:1.5;"
        >
          Figma 模式当前环境暂不可用，请改用「上传截图」：figma 连接器未导出 getImageUrl
        </div>
        <input
          v-model="figmaUrl"
          class="ps-input"
          :disabled="!figmaEnabled"
          placeholder="https://www.figma.com/file/..."
        />
      </div>

      <div class="ps-actions">
        <button class="ps-btn ps-btn-primary" :disabled="!canSubmit || busy" @click="submit">
          {{ busy ? '生成中…' : '生成页面骨架' }}
        </button>
        <button v-if="result" class="ps-btn" @click="reset">新建</button>
      </div>

      <p v-if="error" class="ps-error">{{ error }}</p>
    </section>

    <!-- ═══ 结果区 ═══ -->
    <section v-if="resultDetail" class="ps-card ps-result">
      <div class="ps-result-head">
        <div class="ps-result-titles">
          <h2 class="ps-result-title">{{ resultDetail.structure?.title || result?.name }}</h2>
          <span class="ps-badge">{{ result?.path }}</span>
        </div>
        <div class="ps-result-actions" v-if="result">
          <button class="ps-btn ps-btn-primary" @click="openSource(result)">查看源码</button>
          <button class="ps-btn" @click="download(result)">下载 ZIP</button>
          <button class="ps-btn ps-btn-danger" @click="remove(result)">删除</button>
        </div>
      </div>

      <div class="ps-meta-row" v-if="resultDetail.structure?.theme">
        <div class="ps-theme">
          <span class="ps-swatch" :style="{ background: resultDetail.structure.theme.bg }" title="bg"></span>
          <span class="ps-swatch" :style="{ background: resultDetail.structure.theme.accent }" title="accent"></span>
          <span class="ps-swatch" :style="{ background: resultDetail.structure.theme.header }" title="header"></span>
          <span class="ps-swatch" :style="{ background: resultDetail.structure.theme.text }" title="text"></span>
          <span class="ps-theme-label">主题色板</span>
        </div>
        <div class="ps-dims" v-if="resultDetail.structure?.width">
          基线尺寸：{{ resultDetail.structure.width }} × {{ resultDetail.structure.height }}（vw/vh 自适应）
        </div>
      </div>

      <div class="ps-comps" v-if="resultDetail.structure?.components?.length">
        <h3 class="ps-comps-title">组件清单（{{ resultDetail.structure.components.length }}）</h3>
        <div class="ps-comp-grid">
          <div class="ps-comp" v-for="(c, i) in resultDetail.structure.components" :key="i">
            <div class="ps-comp-name">{{ c.name || '组件' + (i + 1) }}</div>
            <div class="ps-comp-tags">
              <span class="ps-tag">{{ c.region }}</span>
              <span class="ps-tag ps-tag-type">{{ c.type }}</span>
              <span class="ps-tag ps-tag-ratio" v-if="c.heightRatio != null">H {{ c.heightRatio }}%</span>
              <span class="ps-tag ps-tag-ph" v-if="c.placeholder">占位</span>
            </div>
            <div class="ps-comp-note" v-if="c.note">{{ c.note }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ 已有列表 ═══ -->
    <section class="ps-card ps-list">
      <h2 class="ps-list-head">我的页面骨架</h2>
      <div v-if="!list.length" class="ps-empty">暂无生成记录</div>
      <div class="ps-list-grid" v-else>
        <div class="ps-list-item" v-for="item in list" :key="item.id">
          <div class="ps-list-info">
            <div class="ps-list-name">{{ item.name }}</div>
            <div class="ps-list-meta">
              {{ item.groupId }} · {{ item.source === 'figma' ? 'Figma' : '截图' }} · {{ fmtDate(item.createdAt) }}
            </div>
          </div>
          <div class="ps-list-actions">
            <button class="ps-btn ps-btn-sm" @click="preview(item)">预览</button>
            <button class="ps-btn ps-btn-sm" @click="openSource(item)">源码</button>
            <button class="ps-btn ps-btn-sm" @click="download(item)">下载</button>
            <button class="ps-btn ps-btn-sm ps-btn-danger" @click="remove(item)">删除</button>
          </div>
        </div>
      </div>
    </section>

    <div v-if="toastMsg" class="ps-toast" :class="'ps-toast-' + toastType">{{ toastMsg }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  listPageSkeletons,
  createPageSkeletonByScreenshot,
  createPageSkeletonByFigma,
  getPageSkeleton,
  downloadPageSkeletonZip,
  removePageSkeleton,
  getPagePreviewUrl,
  type PageSkeletonItem,
  type PageSkeletonCreated,
  type PageSkeletonDetail,
} from '@/api/page-skeleton'

const source = ref<'screenshot' | 'figma'>('screenshot')
// Figma 真实管线已接入：后端 renderFigmaImage 通过 FigmaConnector 取图（需配置 Figma Token）
const figmaEnabled = true
const name = ref('')
const groupId = ref('default-group')
const figmaUrl = ref('')
const file = ref<File | null>(null)
const previewUrl = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

const busy = ref(false)
const error = ref('')
const result = ref<PageSkeletonCreated | null>(null)
const resultDetail = ref<PageSkeletonDetail | null>(null)
const list = ref<PageSkeletonItem[]>([])

const toastMsg = ref('')
const toastType = ref<'success' | 'error'>('success')
let toastTimer: ReturnType<typeof setTimeout> | undefined

const router = useRouter()

const canSubmit = computed(() => {
  if (!groupId.value.trim()) return false
  if (source.value === 'screenshot') return !!file.value
  if (!figmaEnabled) return false
  return !!figmaUrl.value.trim()
})

function toast(msg: string, type: 'success' | 'error' = 'success') {
  toastMsg.value = msg
  toastType.value = type
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastMsg.value = ''), 2600)
}

function fmtDate(s?: string) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function setFile(f?: File) {
  if (!f) return
  if (!f.type.startsWith('image/')) {
    toast('请上传图片文件', 'error')
    return
  }
  file.value = f
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(f)
}

function onFile(e: Event) {
  setFile((e.target as HTMLInputElement).files?.[0])
}

function onDrop(e: DragEvent) {
  dragging.value = false
  setFile(e.dataTransfer?.files?.[0])
}

function pickFile() {
  fileInput.value?.click()
}

function reset() {
  result.value = null
  resultDetail.value = null
  file.value = null
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  name.value = ''
  figmaUrl.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

async function loadList() {
  try {
    list.value = await listPageSkeletons()
  } catch {
    /* 列表加载失败不影响主流程 */
  }
}

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = ''
  // 🔍 诊断：请求前打印实际发出的字段，便于定位 400 无声失败（空文件 / 类型异常）
  const g = groupId.value.trim() || 'default-group'
  const diag = {
    source: source.value,
    groupId: g,
    fileName: file.value?.name,
    fileSize: file.value?.size,
    fileType: file.value?.type,
    figmaUrl: figmaUrl.value?.trim(),
  }
  console.log('[page-skeleton] 提交请求诊断', diag)
  try {
    let created: PageSkeletonCreated
    if (source.value === 'screenshot') {
      // 前置拦截：空文件会触发 Multer 静默 400（无后端日志），在此提前报错
      if (!file.value || file.value.size === 0) {
        throw new Error('截图文件为空或 0 字节，请重新选择图片后提交')
      }
      created = await createPageSkeletonByScreenshot({ name: name.value, groupId: g, file: file.value })
    } else {
      created = await createPageSkeletonByFigma({ name: name.value, groupId: g, figmaUrl: figmaUrl.value.trim() })
    }
    result.value = created
    // 生成已在后端异步启动（status=running），详情页通过 SSE 实时展示进度。
    // 这里直接跳转，不等待产物落盘，避免 list/detail 在生成的早期阶段失败而阻断跳转。
    try {
      await getPageSkeleton(created.groupId, created.id)
    } catch {
      /* 生成中详情可能尚未就绪，忽略 */
    }
    try {
      await loadList()
    } catch {
      /* 生成中列表可能尚未包含新页面，忽略 */
    }
    // 直接跳转到生成详情页（与组件任务一致的 TaskDetail /tasks/:sessionId）
    router.push('/tasks/' + created.id)
  } catch (e: any) {
    // 完整透传后端错误（含 status / data / url），直接在页面与 console 暴露根因
    console.error('[page-skeleton] 提交失败', e)
    const msg = e?.message || '生成失败'
    const detail =
      e?.data && typeof e.data === 'object' ? e.data.message || e.data.detail || '' : ''
    error.value = detail ? `${msg}（${detail}）` : msg
    toast(error.value, 'error')
  } finally {
    busy.value = false
  }
}

function preview(item: PageSkeletonItem) {
  window.open(getPagePreviewUrl(item.groupId, item.id), '_blank')
}

async function openSource(item: PageSkeletonItem) {
  // 源码进入 Playground 全功能编辑（文件树 / 读写 / 重命名 / 删除 / 实时预览）
  window.open(`/demo/${item.id}?type=page&groupId=${encodeURIComponent(item.groupId)}`, '_blank')
}

async function download(item: PageSkeletonItem) {
  try {
    await downloadPageSkeletonZip(item.groupId, item.id)
    toast('已开始下载', 'success')
  } catch (e: any) {
    toast(e?.message || '下载失败', 'error')
  }
}

async function remove(item: PageSkeletonItem) {
  if (!confirm(`确认删除「${item.name}」？该操作同时删除任务记录与磁盘目录，不可恢复。`)) return
  try {
    await removePageSkeleton(item.groupId, item.id)
    toast('已删除', 'success')
    if (result.value && result.value.id === item.id) reset()
    await loadList()
  } catch (e: any) {
    toast(e?.message || '删除失败', 'error')
  }
}

onMounted(loadList)
</script>

<style scoped>
/* 与其他 /generator/* 页面保持一致：不限宽、水平内边距 40px（对齐 components 页的 --s8）。
   此前这里是 max-width: 1080px + margin: 0 auto，导致本页比同级页面窄一截。 */
.ps-page {
  padding: 32px 40px 64px;
  color: var(--text-primary);
}
.ps-head {
  margin-bottom: 20px;
}
.ps-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 6px;
}
.ps-sub {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.ps-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 14px;
  padding: 20px;
  margin-bottom: 18px;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}

/* 来源 Tab */
.ps-source-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
}
.ps-tab {
  flex: 1;
  border: 1px solid var(--border-default);
  background: var(--bg-alt);
  color: var(--text-secondary);
  padding: 10px 0;
  border-radius: 999px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.ps-tab.active {
  background: var(--brand-bg);
  border-color: var(--brand);
  color: var(--brand);
  font-weight: 600;
}

/* 表单 */
.ps-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
}
.ps-field {
  margin-bottom: 14px;
}
.ps-field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}
.ps-input {
  width: 100%;
  height: 38px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  padding: 0 12px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-input);
  outline: none;
  transition: border-color 0.15s;
}
.ps-input:focus {
  border-color: var(--brand);
}

/* 拖拽区 */
.ps-dropzone {
  border: 1.5px dashed var(--border-default);
  border-radius: 12px;
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: var(--bg-alt);
  transition: all 0.15s;
  overflow: hidden;
}
.ps-dropzone.is-dragging {
  border-color: var(--brand);
  background: var(--brand-bg);
}
.ps-preview {
  max-width: 100%;
  max-height: 320px;
  object-fit: contain;
}
.ps-drop-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-tertiary);
  font-size: 13px;
}
.ps-drop-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: var(--text-tertiary);
}

/* 按钮 */
.ps-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.ps-btn {
  height: 38px;
  padding: 0 20px;
  border-radius: 999px;
  border: 1px solid var(--border-default);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.ps-btn:hover {
  border-color: var(--border-strong);
  background: var(--bg-hover);
}
.ps-btn-primary {
  background: var(--brand);
  border-color: var(--brand);
  color: var(--text-on-brand);
}
.ps-btn-primary:hover {
  background: var(--brand-hover);
  border-color: var(--brand-hover);
}
.ps-btn-primary:disabled {
  background: var(--brand-bg);
  border-color: var(--brand-border);
  color: var(--text-tertiary);
  cursor: not-allowed;
}
.ps-btn-danger {
  color: var(--error);
  border-color: var(--error-border);
}
.ps-btn-danger:hover {
  background: var(--error-bg);
  border-color: var(--error);
}
.ps-btn-sm {
  height: 30px;
  padding: 0 14px;
  font-size: 12.5px;
}

.ps-error {
  margin: 10px 0 0;
  color: var(--error-text);
  font-size: 13px;
}

/* 结果区 */
.ps-result-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.ps-result-title {
  margin: 0 0 6px;
  font-size: 18px;
  color: var(--text-primary);
}
.ps-badge {
  display: inline-block;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-alt);
  border-radius: 6px;
  padding: 2px 8px;
}
.ps-result-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.ps-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-alt);
  border-radius: 10px;
  margin-bottom: 16px;
}
.ps-theme {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ps-swatch {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid var(--border-light);
}
.ps-theme-label {
  margin-left: 8px;
  font-size: 12.5px;
  color: var(--text-secondary);
}
.ps-dims {
  font-size: 13px;
  color: var(--text-secondary);
}

.ps-comps-title {
  font-size: 15px;
  margin: 0 0 12px;
  color: var(--text-primary);
}
.ps-comp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.ps-comp {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 12px;
  background: var(--bg-card);
}
.ps-comp-name {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
  color: var(--text-primary);
}
.ps-comp-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ps-tag {
  font-size: 11.5px;
  color: var(--text-secondary);
  background: var(--bg-alt);
  border-radius: 6px;
  padding: 2px 7px;
}
.ps-tag-type {
  color: var(--brand);
  background: var(--brand-bg);
}
.ps-tag-ratio {
  color: var(--success);
  background: var(--success-bg);
}
.ps-tag-ph {
  color: var(--warning);
  background: var(--warning-bg);
}
.ps-comp-note {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.5;
}

/* 列表 */
.ps-list-head {
  font-size: 17px;
  margin: 0 0 14px;
  color: var(--text-primary);
}
.ps-empty {
  color: var(--text-tertiary);
  font-size: 13px;
  padding: 24px 0;
  text-align: center;
}
.ps-list-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ps-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-card);
}
.ps-list-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}
.ps-list-meta {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 3px;
}
.ps-list-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

/* 弹窗 */
.ps-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 35, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.ps-modal {
  width: min(860px, 92vw);
  max-height: 84vh;
  background: var(--bg-card);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ps-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-light);
  font-weight: 600;
  color: var(--text-primary);
}
.ps-code {
  margin: 0;
  padding: 16px 18px;
  overflow: auto;
  background: #0f1726;
  color: #e6edf3;
  font-size: 12.5px;
  line-height: 1.6;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  white-space: pre;
}

/* Toast */
.ps-toast {
  position: fixed;
  left: 50%;
  bottom: 40px;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 999px;
  font-size: 14px;
  color: #fff;
  z-index: 1100;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
}
.ps-toast-success {
  background: #16a34a;
}
.ps-toast-error {
  background: #e5484d;
}
</style>
