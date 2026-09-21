<template>
  <button
    class="qs-btn"
    v-bind="$attrs"
    :disabled="disabled || !componentId || scoring"
    title="管理员预览：确定性 specScore + styleScore（不含 LLM）"
    @click="handleOpen"
  >
    <span v-if="scoring" class="qs-spin" />
    <span v-else class="qs-ico">★</span>
    <span class="qs-txt">{{ scoring ? '评分中…' : buttonLabel }}</span>
  </button>

  <a-drawer
    :open="drawerOpen"
    title="质量评分 v1（管理员预览）"
    placement="right"
    :width="520"
    @close="drawerOpen = false"
    :body-style="{ padding: '16px 18px', background: '#0f1722' }"
  >
    <div class="qs-tool">
      <button class="qs-fix" :disabled="fixing || !quality" @click="runFix">
        {{ fixing ? '修复中…' : '自动修复' }}
      </button>
      <button class="qs-rerun" :disabled="scoring" @click="run(true)">
        {{ scoring ? '评分中…' : '重新评分并写入' }}
      </button>
    </div>

    <div v-if="scoring" class="qs-loading">
      <a-spin tip="正在离线评分（不调 LLM）..." />
    </div>
    <div v-else-if="error" class="qs-error">
      <a-alert type="error" :message="error" show-icon />
    </div>
    <template v-else-if="quality">
      <section class="qs-card">
        <div class="qs-scores">
          <div class="qs-metric">
            <span>规范分</span>
            <strong :class="tone(quality.specScore)">{{ fmt(quality.specScore) }}</strong>
          </div>
          <div class="qs-metric">
            <span>样式分</span>
            <strong :class="tone(quality.styleScore)">{{ fmt(quality.styleScore) }}</strong>
          </div>
        </div>
        <p class="qs-hint">
          v1 只含 specScore / styleScore。Vision、对抗评分、直方图不进总分。
          无 Figma 期望时样式分为「—」（不是 0）。
        </p>
        <p v-if="quality.scoredAt" class="qs-meta">
          {{ quality.version || 'v1' }} · {{ formatTime(quality.scoredAt) }} · {{ quality.fileCount ?? '-' }} 文件
        </p>
      </section>

      <section class="qs-card" v-if="quality.spec">
        <div class="qs-card-head"><h4>规范分明细</h4></div>
        <p class="qs-plain">
          BLOCK {{ quality.spec.blockCount }} × 8 + WARN {{ quality.spec.warnCount }} × 3；有 BLOCK 时硬顶 79。
        </p>
        <div v-if="quality.spec.issues?.length" class="qs-issues">
          <div v-for="(it, i) in quality.spec.issues" :key="i" class="qs-issue">
            <span class="qs-issue-sev" :class="String(it.severity).toLowerCase()">{{ it.severity }}</span>
            <span class="qs-issue-id">{{ it.id }}</span>
            <span class="qs-issue-msg">{{ it.message }}</span>
          </div>
        </div>
        <p v-if="quality.l0bError" class="qs-plain err">L0-B 无法执行：{{ quality.l0bError }}</p>
      </section>

      <section class="qs-card" v-if="quality.style">
        <div class="qs-card-head"><h4>样式分明细</h4></div>
        <p class="qs-plain">
          原因 {{ quality.style.reason }} · 覆盖率 {{ pct(quality.style.coverage) }}
        </p>
        <div v-if="quality.style.diffs?.length" class="qs-issues">
          <div v-for="(d, i) in quality.style.diffs" :key="i" class="qs-issue">
            <span class="qs-issue-id">{{ d.dimension }}</span>
            <span class="qs-issue-msg">期望 {{ d.expected }} / {{ d.actual }}</span>
          </div>
        </div>
        <p v-else-if="quality.styleScore == null" class="qs-plain">无 Figma 节点树，样式分不伪造。</p>
      </section>
    </template>
    <p v-else class="qs-plain">尚未评分。点「重新评分并写入」对当前产物离线打分。</p>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import { readQualityV1, scoreQualityV1, fixQualityIssues, type QualityScoreV1 } from '@/api/mc-spec'

const props = withDefaults(
  defineProps<{
    componentId: string
    disabled?: boolean
  }>(),
  { disabled: false },
)

defineOptions({ inheritAttrs: false })

const drawerOpen = ref(false)
const scoring = ref(false)
const fixing = ref(false)
const error = ref('')
const quality = ref<QualityScoreV1 | null>(null)

const buttonLabel = computed(() => {
  const s = quality.value?.specScore
  const y = quality.value?.styleScore
  if (s == null && y == null) return '质量评分'
  return `评分 ${fmt(s)}/${fmt(y)}`
})

function fmt(n: number | null | undefined) {
  return n == null || Number.isNaN(Number(n)) ? '—' : String(n)
}

function pct(n: number | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return `${Math.round(n * 100)}%`
}

function tone(n: number | null | undefined) {
  if (n == null) return 'muted'
  if (n >= 80) return 'ok'
  if (n >= 60) return 'warn'
  return 'bad'
}

function formatTime(iso?: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function loadCached() {
  if (!props.componentId) return
  try {
    const r = await readQualityV1(props.componentId)
    quality.value = r?.quality || null
  } catch {
    quality.value = null
  }
}

async function run(persist: boolean) {
  if (!props.componentId) {
    message.warning('缺少组件 ID')
    return
  }
  scoring.value = true
  error.value = ''
  try {
    const r = await scoreQualityV1(props.componentId, { persist })
    quality.value = r?.quality || null
    message.success(persist ? '已评分并写入 component-meta.json' : '已评分（未写盘）')
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || String(e)
  } finally {
    scoring.value = false
  }
}

async function handleOpen() {
  drawerOpen.value = true
  if (!quality.value) await loadCached()
}

async function runFix() {
  if (!props.componentId) {
    message.warning('缺少组件 ID')
    return
  }
  fixing.value = true
  error.value = ''
  try {
    const r = await fixQualityIssues(props.componentId)
    if (r.fixed.length === 0) {
      message.info('没有可自动修复的问题')
    } else {
      quality.value = r.newQuality || null
      const parts = []
      if (r.summary.code008 > 0) parts.push(`CODE-008 ×${r.summary.code008}`)
      if (r.summary.themeVarMismatch > 0) parts.push(`THEME-VAR-MISMATCH ×${r.summary.themeVarMismatch}`)
      message.success(`已修复 ${r.fixed.length} 处：${parts.join('、')}`)
    }
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || String(e)
  } finally {
    fixing.value = false
  }
}
</script>

<style scoped>
.qs-btn {
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
  white-space: nowrap;
}
.qs-btn:hover:not(:disabled) {
  background: #1d2f40;
  border-color: #3d7ea8;
  color: #ffffff;
}
.qs-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.qs-ico {
  color: #e8c547;
  font-size: 12px;
}
.qs-spin {
  width: 11px;
  height: 11px;
  border: 2px solid #3d7ea8;
  border-top-color: transparent;
  border-radius: 50%;
  display: inline-block;
  animation: qsspin 0.8s linear infinite;
}
@keyframes qsspin {
  to {
    transform: rotate(360deg);
  }
}
.qs-tool {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 12px;
}
.qs-fix,
.qs-rerun,
.qs-plain,
.qs-hint,
.qs-meta {
  color: #9fb3c8;
  font-size: 12px;
}
.qs-fix,
.qs-rerun {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid #2a3a4d;
  background: #1a2836;
  color: #cfe3f5;
  cursor: pointer;
}
.qs-fix {
  background: #1a3a28;
  border-color: #2a5a3d;
}
.qs-fix:hover:not(:disabled) {
  background: #1d4a30;
  border-color: #3d8a5a;
  color: #ffffff;
}
.qs-fix:disabled,
.qs-rerun:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.qs-loading,
.qs-error {
  padding: 24px 0;
}
.qs-card {
  background: #15202c;
  border: 1px solid #243445;
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 12px;
}
.qs-scores {
  display: flex;
  gap: 16px;
}
.qs-metric {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.qs-metric span {
  color: #7f93a8;
  font-size: 12px;
}
.qs-metric strong {
  font-size: 28px;
  color: #e8f1fa;
}
.qs-metric strong.ok {
  color: #4ec9a0;
}
.qs-metric strong.warn {
  color: #e8c547;
}
.qs-metric strong.bad {
  color: #ef6b6b;
}
.qs-metric strong.muted {
  color: #7f93a8;
}
.qs-hint {
  margin: 12px 0 0;
  line-height: 1.5;
}
.qs-meta {
  margin: 8px 0 0;
}
.qs-card-head h4 {
  margin: 0 0 8px;
  color: #e8f1fa;
  font-size: 13px;
}
.qs-plain {
  margin: 0;
  line-height: 1.5;
}
.qs-plain.err {
  color: #ef6b6b;
  margin-top: 8px;
}
.qs-issues {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 400px;
  overflow-y: auto;
  padding-right: 4px;
}
.qs-issue {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: #cfe3f5;
}
.qs-issue-sev {
  flex: 0 0 auto;
  color: #e8c547;
}
.qs-issue-sev.block {
  color: #ef6b6b;
}
.qs-issue-id {
  color: #7fb4d8;
  flex: 0 0 auto;
}
.qs-issue-msg {
  color: #9fb3c8;
}
</style>
