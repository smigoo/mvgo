<template>
  <button
    class="mc-spec-btn"
    v-bind="$attrs"
    :disabled="disabled || !componentId"
    :title="title"
    @click="handleOpen"
  >
    <span v-if="checking" class="mc-spec-spin" />
    <span v-else class="mc-spec-ico">✔</span>
    <span class="mc-spec-txt">{{ checking ? '检查中…' : label }}</span>
  </button>

  <a-drawer
    :open="drawerOpen"
    title="微码规范检查"
    placement="right"
    :width="640"
    @close="drawerOpen = false"
    :body-style="{ padding: '16px 18px', background: '#0f1722' }"
  >
    <!-- 工具行 -->
    <div class="mc-tool-row">
      <template v-if="skills.length > 1">
        <span class="mc-tool-label">检查 skill</span>
        <a-select v-model:value="skillId" size="small" class="mc-skill-select" :options="skillOptions" />
      </template>
      <template v-else>
        <span class="mc-tool-label">检查 skill</span>
        <span class="mc-skill-tag">内置 · {{ skillId || 'frontend-mc-check' }}</span>
      </template>
      <button v-if="isAdmin" class="mc-skill-manage" @click="openSkillManager">
        管理 skill
      </button>
      <button class="mc-rerun" :disabled="checking" @click="run">
        {{ checking ? '检查中…' : '重新检查' }}
      </button>
    </div>

    <!-- AI 修复进行中提示 -->
    <div v-if="fixingId" class="mc-fixing-bar">
      <span class="mc-spec-spin dark" />
      <span>
        正在 AI 修复 <b>[{{ fixingId }}]</b>，修改会直接落盘到组件代码（约 1~2 分钟），完成后自动重新检查。
        可在 Playground 中随时撤销。
      </span>
    </div>

    <div v-if="checking" class="mc-loading">
      <a-spin tip="正在执行规范检查（约 1 秒）..." />
    </div>

    <div v-else-if="error" class="mc-error">
      <a-alert type="error" :message="error" show-icon />
      <p v-if="isDirMissing" class="mc-plain err-hint">
        服务器上没有该组件的产物目录（组件 ID：<code>{{ componentId }}</code>）。
        请在具体组件详情页操作，或先完成生成/发布再检查。
      </p>
    </div>

    <template v-else-if="result">
      <!-- 结论卡 -->
      <section class="mc-card">
        <div class="mc-verdict" :class="result.canRelease ? 'ok' : 'bad'">
          <span class="mc-verdict-badge">{{ result.canRelease ? '允许上线' : '不允许上线' }}</span>
          <span class="mc-verdict-sub">
            规范 {{ result.specVersion || '-' }} · {{ formatTime(result.checkedAt) }}
          </span>
        </div>
        <div class="mc-metrics">
          <div class="mc-metric"><span>通过</span><strong class="ok">{{ result.passCount }}</strong></div>
          <div class="mc-metric"><span>失败</span><strong :class="result.failCount ? 'bad' : ''">{{ result.failCount }}</strong></div>
          <div class="mc-metric"><span>警告</span><strong :class="result.warningCount ? 'warn' : ''">{{ result.warningCount }}</strong></div>
        </div>
        <p class="mc-hint">
          M1~M5 系列必须 100% 通过（warning 不阻断）才可投放；当前判定
          <b>{{ result.canRelease ? '通过' : '未通过' }}</b>。
        </p>
        <div class="mc-actions">
          <button v-if="result.reportUrl" class="mc-btn primary" @click="openReport">查看完整报告</button>
          <button v-if="result.errors?.length" class="mc-btn" @click="copyErrors">复制失败项</button>
        </div>
      </section>

      <!-- 失败项（按 M 系列分组） -->
      <section v-if="groupedErrors.length" class="mc-card">
        <div class="mc-card-head">
          <h4>必须修复（{{ result.errors.length }}）</h4>
        </div>
        <div v-for="g in groupedErrors" :key="g.series" class="mc-group">
          <div class="mc-group-title">{{ g.label }}（{{ g.items.length }}）</div>
          <div v-for="it in g.items" :key="it.id" class="mc-issue">
            <div class="mc-issue-top">
              <span class="mc-issue-id">{{ it.id }}</span>
              <span class="mc-issue-name">{{ it.name }}</span>
              <button
                class="mc-fix-btn"
                :disabled="!!fixingId"
                :title="fixingId === it.id ? 'AI 修复中（约 1~2 分钟）' : 'AI 修复该项并落盘到组件代码'"
                @click="fixItem(it)"
              >
                <span v-if="fixingId === it.id" class="mc-spec-spin" />
                {{ fixingId === it.id ? '修复中…' : 'AI 修复' }}
              </button>
            </div>
            <div class="mc-issue-msg">{{ it.message || '未提供说明' }}</div>
          </div>
        </div>
      </section>

      <section v-else class="mc-card">
        <div class="mc-card-head"><h4>必须修复（0）</h4></div>
        <p class="mc-plain">M 系列全部通过，未发现阻断项。</p>
      </section>

      <!-- 警告（折叠） -->
      <section v-if="result.warnings?.length" class="mc-card">
        <div class="mc-card-head clickable" @click="showWarnings = !showWarnings">
          <h4>警告（{{ result.warnings.length }}）</h4>
          <span class="mc-fold">{{ showWarnings ? '收起' : '展开' }}</span>
        </div>
        <template v-if="showWarnings">
          <div v-for="it in result.warnings" :key="`w-${it.id}`" class="mc-issue warn">
            <div class="mc-issue-top">
              <span class="mc-issue-id">{{ it.id }}</span>
              <span class="mc-issue-name">{{ it.name }}</span>
              <button
                class="mc-fix-btn"
                :disabled="!!fixingId"
                @click="fixItem(it)"
              >
                <span v-if="fixingId === it.id" class="mc-spec-spin" />
                {{ fixingId === it.id ? '修复中…' : 'AI 修复' }}
              </button>
            </div>
            <div class="mc-issue-msg">{{ it.message || '未提供说明' }}</div>
          </div>
        </template>
      </section>
    </template>

    <div v-else class="mc-plain">尚未执行检查。</div>
  </a-drawer>

  <!-- 自定义 skill 管理（仅管理员） -->
  <a-modal
    v-model:open="skillMgrOpen"
    title="自定义检查 skill"
    :width="560"
    :footer="null"
    :body-style="{ background: '#0f1722', padding: '16px 18px' }"
  >
    <p class="mc-plain skm-tip">
      上传 zip 包注册自定义规范检查 skill。zip 内必须含约定入口
      <code>scripts/mc-check.cjs</code>；若包内含单一顶层目录会自动剥离。
      安装目录：<code>backend-node/data/skills/&lt;skillId&gt;</code>。
    </p>

    <div class="skm-row">
      <input
        ref="fileInputRef"
        type="file"
        accept=".zip,application/zip"
        class="skm-file"
        @change="onPickFile"
      />
    </div>

    <div class="skm-row">
      <span class="skm-label">skill 标识</span>
      <a-input
        v-model:value="uploadSkillId"
        size="small"
        class="skm-input"
        placeholder="留空则取 zip 顶层目录名 / 文件名（小写字母数字 - _）"
      />
    </div>

    <div class="skm-row">
      <a-checkbox v-model:checked="uploadOverwrite">同名已存在时覆盖</a-checkbox>
      <button class="mc-btn primary skm-upload" :disabled="uploading || !pickedFile" @click="doUpload">
        {{ uploading ? '上传中…' : '上传并注册' }}
      </button>
    </div>

    <div class="skm-list">
      <div class="skm-list-head">已注册的自定义 skill（{{ customSkills.length }}）</div>
      <div v-if="!customSkills.length" class="mc-plain">暂无自定义 skill，当前使用内置 skill。</div>
      <div v-for="s in customSkills" :key="s.id" class="skm-item">
        <div class="skm-item-main">
          <span class="skm-item-id">{{ s.id }}</span>
          <span v-if="s.version" class="skm-item-ver">{{ s.version }}</span>
          <span class="skm-item-desc">{{ s.description || s.name }}</span>
        </div>
        <div class="skm-item-side">
          <span v-if="!s.available" class="skm-bad">入口缺失</span>
          <button class="mc-btn skm-del" :disabled="removingId === s.id" @click="doRemove(s.id)">
            {{ removingId === s.id ? '卸载中…' : '卸载' }}
          </button>
        </div>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, computed, useAttrs } from 'vue'
import { message } from 'ant-design-vue'
import {
  listMcSpecSkills,
  checkMcSpec,
  fixMcSpecItem,
  uploadMcSpecSkill,
  removeMcSpecSkill,
  MC_SERIES_LABEL,
  type McSpecCheckResult,
  type McSpecSkill,
  type McSpecItem,
} from '@/api/mc-spec'
import { usePermission } from '@/composables/usePermission'

const props = withDefaults(
  defineProps<{
    /** 组件 ID（微码组件目录名） */
    componentId: string
    /** 按钮文案 */
    label?: string
    /** 外部禁用 */
    disabled?: boolean
  }>(),
  { label: '微码规范检查', disabled: false },
)

// 父组件传入的 class/style 需要落到按钮上，而不是 drawer
defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
// 父组件显式传 title 时优先（如 Playground 占位组件禁用时的说明）
const title = computed(
  () =>
    String(attrs.title || '') ||
    `使用规范检查 skill（默认内置 mc-check.cjs，M1~M5）检查 ${props.componentId} 是否符合上线标准`,
)

const drawerOpen = ref(false)
const checking = ref(false)
const error = ref('')
const result = ref<McSpecCheckResult | null>(null)
const skills = ref<McSpecSkill[]>([])
const skillId = ref('frontend-mc-check')
const showWarnings = ref(false)
/** 正在 AI 修复的检查项 id（同一时刻只允许一个，避免并发写盘冲突） */
const fixingId = ref('')

// ── 自定义 skill 管理（仅管理员：后端 assertAdmin 二次把关）──
const { isAdmin } = usePermission()
const skillMgrOpen = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const pickedFile = ref<File | null>(null)
const uploadSkillId = ref('')
const uploadOverwrite = ref(false)
const uploading = ref(false)
const removingId = ref('')

const customSkills = computed(() => skills.value.filter((s) => !s.builtin))

const skillOptions = computed(() =>
  skills.value.map((s) => ({
    label: s.available ? s.name : `${s.name}（入口缺失）`,
    value: s.id,
  })),
)

/** 后端返回「组件目录不存在」时给出针对性解释，避免只看到 404 */
const isDirMissing = computed(() => /组件目录不存在/.test(error.value))

/** 失败项按 M 系列分组 */
const groupedErrors = computed(() => {
  const map = new Map<string, McSpecItem[]>()
  for (const it of result.value?.errors || []) {
    const series = String(it.id || '').split('-')[0] || '其他'
    if (!map.has(series)) map.set(series, [])
    map.get(series)!.push(it)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([series, items]) => ({ series, label: MC_SERIES_LABEL[series] || series, items }))
})

function formatTime(iso?: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function loadSkills() {
  try {
    skills.value = await listMcSpecSkills()
    const first = skills.value.find((s) => s.available)
    if (first && !skills.value.some((s) => s.id === skillId.value)) skillId.value = first.id
  } catch (e: any) {
    // skill 列表失败不阻断：仍可用内置默认 skill 检查
    console.warn('[mc-spec] 加载 skill 列表失败', e)
  }
}

async function run() {
  if (!props.componentId) {
    message.warning('缺少组件 ID')
    return
  }
  checking.value = true
  error.value = ''
  try {
    result.value = await checkMcSpec(props.componentId, skillId.value || undefined)
    showWarnings.value = false
  } catch (e: any) {
    // HttpError.data 是后端响应体，含可读 message（如「组件目录不存在: xxx」），
    // 只显示「请求失败(404)」会吞掉真因，因此优先取后端描述。
    error.value = e?.data?.message || e?.message || String(e)
    result.value = null
  } finally {
    checking.value = false
  }
}

async function handleOpen() {
  drawerOpen.value = true
  if (!skills.value.length) await loadSkills()
  // 打开即跑一次（P1：手动触发，不做生成后自动检查）
  await run()
}

/**
 * AI 修复单个失败项：走 Playground 对话式修改管线（ai-chat）落盘，
 * 完成后自动重新检查，直观看到该项由失败变通过。
 */
async function fixItem(it: McSpecItem) {
  if (fixingId.value) return
  fixingId.value = it.id
  try {
    await fixMcSpecItem(props.componentId, it)
    message.success(`[${it.id}] AI 修复完成，正在重新检查`)
    await run()
  } catch (e: any) {
    message.error(`[${it.id}] AI 修复失败：${e?.data?.message || e?.message || String(e)}`)
  } finally {
    fixingId.value = ''
  }
}

function openReport() {
  const url = result.value?.reportUrl
  if (url) window.open(url, '_blank', 'noopener')
}

/** 打开 skill 管理弹窗（仅管理员入口） */
function openSkillManager() {
  skillMgrOpen.value = true
  pickedFile.value = null
  uploadSkillId.value = ''
  uploadOverwrite.value = false
  if (fileInputRef.value) fileInputRef.value.value = ''
  void loadSkills()
}

function onPickFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input?.files?.[0] || null
  pickedFile.value = f
  // 未手填标识时，用文件名兜底预览（后端同样逻辑）
  if (f && !uploadSkillId.value) {
    console.info('[mc-spec] 选中 skill 包', f.name, `${Math.round(f.size / 1024)}KB`)
  }
}

/** 上传并注册自定义 skill（后端逐条校验 zip 路径安全与约定入口） */
async function doUpload() {
  if (!pickedFile.value) {
    message.warning('请先选择 zip 文件')
    return
  }
  uploading.value = true
  try {
    const skill = await uploadMcSpecSkill(pickedFile.value, {
      skillId: uploadSkillId.value.trim() || undefined,
      overwrite: uploadOverwrite.value,
    })
    message.success(`skill「${skill?.id || ''}」已注册`)
    pickedFile.value = null
    uploadSkillId.value = ''
    uploadOverwrite.value = false
    if (fileInputRef.value) fileInputRef.value.value = ''
    await loadSkills()
    // 新装的 skill 若是当前列表里第一个可用项，自动切过去
    if (skill?.id && skills.value.some((s) => s.id === skill.id)) skillId.value = skill.id
  } catch (e: any) {
    message.error(`上传失败：${e?.data?.message || e?.message || String(e)}`)
  } finally {
    uploading.value = false
  }
}

async function doRemove(id: string) {
  removingId.value = id
  try {
    await removeMcSpecSkill(id)
    message.success(`skill「${id}」已卸载`)
    if (skillId.value === id) skillId.value = 'frontend-mc-check'
    await loadSkills()
  } catch (e: any) {
    message.error(`卸载失败：${e?.data?.message || e?.message || String(e)}`)
  } finally {
    removingId.value = ''
  }
}

async function copyErrors() {
  const lines = (result.value?.errors || []).map((it) => `[${it.id}] ${it.name}：${it.message}`)
  const text = [`组件：${result.value?.componentId}`, `规范：${result.value?.specVersion}`, '', ...lines].join('\n')
  try {
    await navigator.clipboard.writeText(text)
    message.success('失败项已复制')
  } catch {
    message.info('复制失败，请手动选择文本')
  }
}
</script>

<style scoped>
.mc-spec-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid #2a3a4d;
  background: #16222f;
  color: #cfe3f5;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  white-space: nowrap;
}
.mc-spec-btn:hover:not(:disabled) {
  background: #1d2f40;
  border-color: #3d7ea8;
  color: #ffffff;
}
.mc-spec-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.mc-spec-ico {
  color: #4ec9a0;
  font-size: 12px;
}
.mc-spec-spin {
  width: 11px;
  height: 11px;
  border: 2px solid #3d7ea8;
  border-top-color: transparent;
  border-radius: 50%;
  display: inline-block;
  animation: mcspin 0.8s linear infinite;
}
@keyframes mcspin {
  to {
    transform: rotate(360deg);
  }
}

.mc-tool-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}
.mc-tool-label {
  font-size: 12px;
  color: #7c8fa3;
}
.mc-skill-select {
  min-width: 220px;
}
.mc-skill-tag {
  font-size: 12px;
  color: #8fb8d8;
  background: #17293a;
  border: 1px solid #24405a;
  border-radius: 999px;
  padding: 2px 10px;
}
.mc-rerun {
  margin-left: auto;
  border-radius: 999px;
  border: 1px solid #2a3a4d;
  background: #16222f;
  color: #cfe3f5;
  font-size: 12px;
  padding: 4px 12px;
  cursor: pointer;
}
.mc-rerun:hover:not(:disabled) {
  border-color: #3d7ea8;
  color: #fff;
}
.mc-rerun:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* 「管理 skill」按钮接管右推，重新检查紧随其后 */
.mc-skill-manage {
  margin-left: auto;
  border-radius: 999px;
  border: 1px dashed #3a4e63;
  background: transparent;
  color: #8fb8d8;
  font-size: 12px;
  padding: 4px 12px;
  cursor: pointer;
}
.mc-skill-manage:hover {
  border-color: #3d7ea8;
  color: #fff;
}
.mc-skill-manage + .mc-rerun {
  margin-left: 0;
}

/* ── 自定义 skill 管理弹窗 ── */
.skm-tip {
  line-height: 1.7;
  margin-bottom: 14px;
}
.skm-tip code {
  color: #e0a44a;
  background: rgba(224, 164, 74, 0.1);
  border-radius: 4px;
  padding: 1px 5px;
}
.skm-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.skm-label {
  font-size: 12px;
  color: #7c8fa3;
  flex-shrink: 0;
}
.skm-input {
  flex: 1;
}
.skm-file {
  flex: 1;
  font-size: 12px;
  color: #a9c8e0;
}
.skm-file::file-selector-button {
  margin-right: 10px;
  border-radius: 999px;
  border: 1px solid #2d5a7a;
  background: rgba(61, 126, 168, 0.14);
  color: #7db8dd;
  font-size: 12px;
  padding: 4px 12px;
  cursor: pointer;
}
.skm-upload {
  margin-left: auto;
}
.skm-upload:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.skm-list {
  margin-top: 6px;
  border-top: 1px solid #1f2f3d;
  padding-top: 12px;
}
.skm-list-head {
  font-size: 12px;
  color: #8fb8d8;
  margin-bottom: 8px;
}
.skm-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #131f2b;
  border: 1px solid #22323f;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 6px;
}
.skm-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.skm-item-id {
  font-size: 12px;
  color: #e6f0fa;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.skm-item-ver {
  font-size: 11px;
  color: #4ec9a0;
  background: rgba(78, 201, 160, 0.12);
  border-radius: 4px;
  padding: 1px 6px;
}
.skm-item-desc {
  font-size: 12px;
  color: #8ba1b6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skm-item-side {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.skm-bad {
  font-size: 11px;
  color: #f06060;
}
.skm-del {
  padding: 3px 10px;
}
.skm-del:hover:not(:disabled) {
  border-color: #f06060;
  color: #f06060;
}
.skm-del:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mc-loading {
  padding: 40px 0;
  text-align: center;
}
.mc-error {
  margin-bottom: 12px;
}

.mc-card {
  background: #131f2b;
  border: 1px solid #22323f;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 14px;
}
.mc-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.mc-card-head.clickable {
  cursor: pointer;
}
.mc-card-head h4 {
  margin: 0;
  font-size: 13px;
  color: #e6f0fa;
  font-weight: 600;
}
.mc-fold {
  font-size: 12px;
  color: #7c8fa3;
}

.mc-verdict {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.mc-verdict-badge {
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 13px;
  font-weight: 600;
}
.mc-verdict.ok .mc-verdict-badge {
  background: rgba(78, 201, 160, 0.16);
  color: #4ec9a0;
  border: 1px solid rgba(78, 201, 160, 0.45);
}
.mc-verdict.bad .mc-verdict-badge {
  background: rgba(240, 96, 96, 0.16);
  color: #f06060;
  border: 1px solid rgba(240, 96, 96, 0.45);
}
.mc-verdict-sub {
  font-size: 12px;
  color: #7c8fa3;
}

.mc-metrics {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}
.mc-metric {
  flex: 1;
  background: #0f1a25;
  border: 1px solid #1f2f3d;
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mc-metric span {
  font-size: 11px;
  color: #7c8fa3;
}
.mc-metric strong {
  font-size: 18px;
  color: #e6f0fa;
}
.mc-metric strong.ok {
  color: #4ec9a0;
}
.mc-metric strong.bad {
  color: #f06060;
}
.mc-metric strong.warn {
  color: #e0a44a;
}

.mc-hint {
  font-size: 12px;
  color: #8ba1b6;
  margin: 0 0 12px;
  line-height: 1.6;
}
.mc-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.mc-btn {
  border-radius: 999px;
  border: 1px solid #2a3a4d;
  background: #16222f;
  color: #cfe3f5;
  font-size: 12px;
  padding: 5px 14px;
  cursor: pointer;
}
.mc-btn:hover {
  border-color: #3d7ea8;
  color: #fff;
}
.mc-btn.primary {
  background: #1d4a63;
  border-color: #3d7ea8;
  color: #fff;
}

.mc-group {
  margin-bottom: 12px;
}
.mc-group-title {
  font-size: 12px;
  color: #8fb8d8;
  margin-bottom: 6px;
  padding-left: 6px;
  border-left: 2px solid #3d7ea8;
}
.mc-issue {
  background: #0f1a25;
  border: 1px solid #1f2f3d;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 6px;
}
.mc-issue.warn {
  border-color: #4a3a1c;
}
.mc-issue-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.mc-fix-btn {
  margin-left: auto;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  border: 1px solid #2d5a7a;
  background: rgba(61, 126, 168, 0.14);
  color: #7db8dd;
  font-size: 11px;
  padding: 2px 10px;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}
.mc-fix-btn:hover:not(:disabled) {
  background: #1d4a63;
  color: #fff;
}
.mc-fix-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.mc-fixing-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(61, 126, 168, 0.1);
  border: 1px solid #2d5a7a;
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #a9c8e0;
  line-height: 1.6;
}
.mc-fixing-bar b {
  color: #7db8dd;
}
.mc-spec-spin.dark {
  border-color: #7db8dd;
  border-top-color: transparent;
}
.mc-issue-id {
  font-size: 11px;
  color: #f06060;
  background: rgba(240, 96, 96, 0.12);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mc-issue.warn .mc-issue-id {
  color: #e0a44a;
  background: rgba(224, 164, 74, 0.12);
}
.mc-issue-name {
  font-size: 12px;
  color: #e6f0fa;
}
.mc-issue-msg {
  font-size: 12px;
  color: #94a9bd;
  line-height: 1.6;
  word-break: break-all;
}
.mc-plain {
  font-size: 12px;
  color: #8ba1b6;
  margin: 0;
}
.err-hint {
  margin-top: 8px;
  line-height: 1.7;
}
.err-hint code {
  color: #e0a44a;
  background: rgba(224, 164, 74, 0.1);
  border-radius: 4px;
  padding: 1px 5px;
}
</style>
