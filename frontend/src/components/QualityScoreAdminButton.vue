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

      <!-- 设计图对比 -->
      <section class="qs-card qs-compare">
        <div class="qs-card-head"><h4>设计图对比</h4></div>
        <div class="qs-compare-grid">
          <div class="qs-compare-item">
            <div class="qs-compare-label">设计图（Figma）</div>
            <div class="qs-compare-img-wrap">
              <img :src="getFigmaPreviewUrl()" alt="Figma 设计图" class="qs-compare-img" />
            </div>
          </div>
          <div class="qs-compare-item">
            <div class="qs-compare-label">产物预览</div>
            <div class="qs-compare-img-wrap">
              <img v-if="productPreviewUrl" :src="productPreviewUrl" alt="产物预览" class="qs-compare-img" />
              <span v-else class="qs-compare-empty">暂无产物截图</span>
            </div>
          </div>
        </div>
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
        
        <!-- 修复结果展示 -->
        <div v-if="lastFixResult" class="qs-fix-result">
          <!-- 已修复项 -->
          <div v-if="lastFixResult.fixed.length > 0" class="qs-fix-success">
            <div class="qs-fix-title">
              <span class="qs-fix-icon">✓</span>
              已修复 {{ lastFixResult.fixed.length }} 处
            </div>
            <div class="qs-fix-list">
              <div v-for="(item, idx) in lastFixResult.fixed.slice(0, 10)" :key="idx" class="qs-fix-item">
                <div class="qs-fix-file">{{ item.file }}</div>
                <div class="qs-fix-detail">
                  <span class="qs-fix-actual">{{ item.actual }}</span>
                  <span class="qs-fix-arrow">→</span>
                  <span class="qs-fix-expected">{{ item.expected }}</span>
                  <span v-if="item.locations?.length" class="qs-fix-location">
                    @{{ item.locations[0].line }}:{{ item.locations[0].column }}
                  </span>
                </div>
                <div v-if="item.locations?.[0]?.context" class="qs-fix-context">
                  {{ item.locations[0].context }}
                </div>
              </div>
              <div v-if="lastFixResult.fixed.length > 10" class="qs-fix-more">
                还有 {{ lastFixResult.fixed.length - 10 }} 处修复...
              </div>
            </div>
          </div>
          
          <!-- 无法修复项 -->
          <div v-if="lastFixResult.unfixable && lastFixResult.unfixable.length > 0" class="qs-fix-failed">
            <div class="qs-fix-title">
              <span class="qs-fix-icon-fail">✗</span>
              无法修复 {{ lastFixResult.unfixable.length }} 项
            </div>
            <div class="qs-fix-list">
              <div v-for="(item, idx) in lastFixResult.unfixable.slice(0, 10)" :key="idx" class="qs-fix-item-fail">
                <div class="qs-fix-dimension">{{ item.dimension }} 维度</div>
                <div class="qs-fix-expected-value">期望值: {{ item.expected }}</div>
                <div class="qs-fix-reason">{{ item.reason }}</div>
              </div>
              <div v-if="lastFixResult.unfixable.length > 10" class="qs-fix-more">
                还有 {{ lastFixResult.unfixable.length - 10 }} 项...
              </div>
            </div>
          </div>
        </div>
        
        <!-- 变量解析信息 -->
        <div v-if="quality.varResolutionInfo" class="qs-var-info">
          <span class="qs-var-label">变量解析：</span>
          <span v-if="quality.varResolutionInfo.enabled" class="qs-var-enabled">
            已启用 · {{ quality.varResolutionInfo.varCount }} 个变量
            <span v-if="quality.varResolutionInfo.themeVarsPath" class="qs-var-path">
              ({{ quality.varResolutionInfo.themeVarsPath.split('/').pop() }})
            </span>
          </span>
          <span v-else class="qs-var-disabled">
            未启用
            <span v-if="quality.varResolutionInfo.error" class="qs-var-error">
              ({{ quality.varResolutionInfo.error }})
            </span>
          </span>
        </div>
        
        <!-- 维度详情（含模糊匹配） -->
        <div v-if="quality.style.dimensions" class="qs-dimensions">
          <!-- resourceMount 维度专属展示 -->
          <div v-if="quality.style.dimensions.resourceMount?.scored" class="qs-dimension qs-dim-resource">
            <div class="qs-dim-header">
              <span class="qs-dim-name">资源挂载</span>
              <span class="qs-dim-score" :class="dimTone(quality.style.dimensions.resourceMount.score)">
                {{ Math.round(quality.style.dimensions.resourceMount.score) }}
              </span>
              <span class="qs-dim-coverage">
                {{ quality.style.dimensions.resourceMount.matched }}/{{ quality.style.dimensions.resourceMount.expected }}
              </span>
            </div>
            <p class="qs-dim-desc">背景图是否挂载到正确的 data-section-id 元素</p>
            
            <!-- 挂载成功 -->
            <div v-if="quality.style.dimensions.resourceMount.matched > 0" class="qs-rm-ok">
              <span class="qs-rm-ok-icon">✓</span>
              {{ quality.style.dimensions.resourceMount.matched }} 个背景图已正确挂载
            </div>
            
            <!-- 未挂载的背景图 -->
            <div v-if="quality.style.dimensions.resourceMount.missed?.length" class="qs-rm-missed">
              <div v-for="(m, mi) in quality.style.dimensions.resourceMount.missed" :key="mi" class="qs-rm-missed-item">
                <div class="qs-rm-missed-head">
                  <span class="qs-rm-missed-icon">✗</span>
                  <span class="qs-rm-missed-name">{{ m.name || '(unnamed)' }}</span>
                  <span class="qs-rm-missed-target">→ {{ m.targetDomSelector }}</span>
                </div>
                <div class="qs-rm-missed-detail">
                  期望 <code>data-section-id="{{ m.figmaNodeId }}"</code>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 其他维度通用展示 -->
          <div v-for="(dim, dimName) in quality.style.dimensions" :key="dimName" class="qs-dimension"
               v-show="dimName !== 'resourceMount'">
            <div class="qs-dim-header">
              <span class="qs-dim-name">{{ dimName }}</span>
              <span class="qs-dim-score">{{ dim.score != null ? Math.round(dim.score) : '—' }}</span>
              <span class="qs-dim-coverage">{{ dim.matched }}/{{ dim.expected }}</span>
              <span v-if="dim.variableAdapted" class="qs-dim-adapted">✓ 变量化</span>
              <button 
                v-else-if="canFixDimension(dimName, dim)" 
                class="qs-dim-fix-btn"
                :disabled="fixingDimension === dimName"
                @click="fixDimension(dimName)"
              >
                {{ fixingDimension === dimName ? '修复中…' : '修复' }}
              </button>
            </div>
            
            <!-- 模糊匹配命中 -->
            <div v-if="dim.fuzzyMatches?.length" class="qs-fuzzy-matches">
              <div v-for="(fm, fi) in dim.fuzzyMatches" :key="fi" class="qs-fuzzy-item">
                <span class="qs-fuzzy-expected">{{ fm.expected }}</span>
                <span class="qs-fuzzy-arrow">→</span>
                <span class="qs-fuzzy-matched">{{ fm.matchedTo || '(null)' }}</span>
                <span class="qs-fuzzy-distance">Δ{{ fm.distance }}{{ fm.unit }}</span>
              </div>
            </div>
            
            <!-- 未匹配项 -->
            <div v-if="dim.missed?.length" class="qs-missed">
              <div v-for="(m, mi) in dim.missed.slice(0, 5)" :key="mi" class="qs-missed-item">
                <span class="qs-missed-label">未匹配：</span>
                <span class="qs-missed-value">{{ m }}</span>
              </div>
              <div v-if="dim.missed.length > 5" class="qs-missed-more">
                还有 {{ dim.missed.length - 5 }} 项...
              </div>
            </div>
          </div>
        </div>
        
        <!-- 兼容旧的 diffs 显示 -->
        <div v-else-if="quality.style.diffs?.length" class="qs-issues">
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

const emit = defineEmits<{
  (e: 'preview-refresh-needed'): void
}>()

defineOptions({ inheritAttrs: false })

const drawerOpen = ref(false)
const scoring = ref(false)
const fixing = ref(false)
const fixingDimension = ref<string | null>(null)
const error = ref('')
const quality = ref<QualityScoreV1 | null>(null)
const lastFixResult = ref<{
  fixed: Array<{
    file: string
    rule: string
    dimension?: string
    expected?: string
    actual?: string
    replaced?: number
    locations?: Array<{ line: number; column: number; context: string }>
  }>
  unfixable?: Array<{
    dimension: string
    expected: string
    reason: string
    reasonCode: string
    rule?: string
  }>
} | null>(null)

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

function dimTone(n: number | null | undefined) {
  if (n == null) return 'dim-muted'
  if (n >= 80) return 'dim-ok'
  if (n >= 60) return 'dim-warn'
  return 'dim-bad'
}

function formatTime(iso?: string) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function getScreenshotUrl(path: string) {
  return `/api/component/${props.componentId}/file?path=${encodeURIComponent(path)}&raw=1`
}

function getFigmaPreviewUrl() {
  // 使用 mc-preview.png（Figma 真值图）作为设计图
  return `/api/component/${props.componentId}/file?path=resources/images/mc-preview.png&raw=1`
}

// 「产物预览」= 生成产物的渲染截图（.mc-gen/screenshots/*-rendered.png）
const productPreviewUrl = computed(() => {
  const shots = quality.value?.screenshots
  if (shots && shots.length > 0) return getScreenshotUrl(shots[0].path)
  return ''
})

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
    if (r.fixed.length === 0 && (!r.unfixable || r.unfixable.length === 0)) {
      message.info('没有可自动修复的问题')
    } else {
      quality.value = r.newQuality || null
      
      // 保存修复结果用于展示
      lastFixResult.value = {
        fixed: r.fixed,
        unfixable: r.unfixable
      }
      
      const parts = []
      if (r.summary.code008 > 0) parts.push(`CODE-008 ×${r.summary.code008}`)
      if (r.summary.themeVarMismatch > 0) parts.push(`THEME-VAR-MISMATCH ×${r.summary.themeVarMismatch}`)
      if (r.summary.code025Warn > 0) parts.push(`CODE-025-WARN ×${r.summary.code025Warn}`)
      if (r.summary.styleColor > 0) parts.push(`颜色修复 ×${r.summary.styleColor}`)
      if (r.summary.styleNumeric > 0) parts.push(`数值修复 ×${r.summary.styleNumeric}`)
      
      if (r.fixed.length > 0) {
        message.success(`已修复 ${r.fixed.length} 处：${parts.join('、')}`)
      }
      if (r.unfixable && r.unfixable.length > 0) {
        message.warning(`${r.unfixable.length} 项无法自动修复，详见下方说明`)
      }
      
      // 修复成功后通知父组件刷新预览
      if (r.fixed.some((f) => f.rule?.startsWith('STYLE-'))) {
        emit('preview-refresh-needed')
      }
    }
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || String(e)
  } finally {
    fixing.value = false
  }
}

/**
 * 判断某个维度是否可以修复
 */
function canFixDimension(dimName: string, dim: any): boolean {
  if (!dim.scored || dimName === 'structure') return false
  if (dim.score === 100) return false // 满分不需要修
  if (dim.fuzzyMatches?.length > 0 || dim.missed?.length > 0) return true
  return false
}

/**
 * 按维度修复样式问题
 */
async function fixDimension(dimName: string) {
  if (!props.componentId) {
    message.warning('缺少组件 ID')
    return
  }
  fixingDimension.value = dimName
  error.value = ''
  try {
    const r = await fixQualityIssues(props.componentId, { dimensions: [dimName] })
    if (r.fixed.length === 0 && (!r.unfixable || r.unfixable.length === 0)) {
      message.info(`${dimName} 维度没有可修复的问题`)
    } else {
      quality.value = r.newQuality || null
      
      // 保存修复结果用于展示
      lastFixResult.value = {
        fixed: r.fixed,
        unfixable: r.unfixable
      }
      
      if (r.fixed.length > 0) {
        message.success(`${dimName} 维度已修复 ${r.fixed.length} 处`)
      }
      if (r.unfixable && r.unfixable.length > 0) {
        message.warning(`${dimName} 维度有 ${r.unfixable.length} 项无法自动修复`)
      }
      
      emit('preview-refresh-needed')
    }
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || String(e)
  } finally {
    fixingDimension.value = null
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
  color: #c5d5e5;
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
  color: #a3b8cb;
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
  color: #a3b8cb;
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
  color: #c5d5e5;
}

/* 变量解析信息 */
.qs-var-info {
  margin-top: 10px;
  padding: 8px 10px;
  background: #1a2836;
  border-radius: 6px;
  font-size: 12px;
  color: #c5d5e5;
}
.qs-var-label {
  color: #a3b8cb;
}
.qs-var-enabled {
  color: #4ec9a0;
}
.qs-var-disabled {
  color: #e8c547;
}
.qs-var-path {
  color: #7fb4d8;
  font-size: 11px;
}
.qs-var-error {
  color: #ef6b6b;
}

/* 维度详情 */
.qs-dimensions {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.qs-dimension {
  background: #1a2836;
  border-radius: 8px;
  padding: 10px;
}
.qs-dim-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.qs-dim-name {
  color: #e8f1fa;
  font-size: 13px;
  font-weight: 500;
  text-transform: capitalize;
}
.qs-dim-score {
  color: #4ec9a0;
  font-size: 14px;
  font-weight: 600;
}
.qs-dim-coverage {
  color: #a3b8cb;
  font-size: 11px;
}

/* 模糊匹配命中 */
.qs-fuzzy-matches {
  margin-top: 6px;
  padding-left: 8px;
  border-left: 2px solid #3d7ea8;
}
.qs-fuzzy-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #cfe3f5;
  margin-bottom: 4px;
}
.qs-fuzzy-expected {
  color: #e8c547;
  font-family: monospace;
}
.qs-fuzzy-arrow {
  color: #a3b8cb;
}
.qs-fuzzy-matched {
  color: #4ec9a0;
  font-family: monospace;
}
.qs-fuzzy-distance {
  color: #7fb4d8;
  font-size: 10px;
  margin-left: auto;
}

/* 未匹配项 */
.qs-missed {
  margin-top: 6px;
  padding-left: 8px;
  border-left: 2px solid #ef6b6b;
}
.qs-missed-item {
  font-size: 11px;
  color: #cfe3f5;
  margin-bottom: 3px;
}
.qs-missed-label {
  color: #ef6b6b;
}
.qs-missed-value {
  color: #c5d5e5;
  font-family: monospace;
}
.qs-missed-more {
  font-size: 10px;
  color: #a3b8cb;
  font-style: italic;
}

/* 维度修复按钮 */
.qs-dim-fix-btn {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #3d7ea8;
  background: #1a3a28;
  color: #4ec9a0;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}
.qs-dim-fix-btn:hover:not(:disabled) {
  background: #1d4a30;
  border-color: #3d8a5a;
  color: #ffffff;
}
.qs-dim-fix-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* 变量化标记 */
.qs-dim-adapted {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  background: #1a2836;
  color: #4ec9a0;
  font-size: 10px;
  font-weight: 500;
}
/* 修复结果展示 */
.qs-fix-result {
  margin-top: 12px;
  padding: 12px;
  background: #0f1722;
  border-radius: 6px;
  border: 1px solid #2a3a4d;
}

.qs-fix-success {
  margin-bottom: 12px;
}

.qs-fix-failed {
  margin-top: 12px;
}

.qs-fix-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #cfe3f5;
  margin-bottom: 8px;
}

.qs-fix-icon {
  color: #4ec9a0;
  font-size: 14px;
}

.qs-fix-icon-fail {
  color: #ef6b6b;
  font-size: 14px;
}

.qs-fix-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.qs-fix-item {
  padding: 8px;
  background: #1a2836;
  border-radius: 4px;
  border-left: 3px solid #4ec9a0;
}

.qs-fix-item-fail {
  padding: 8px;
  background: #1a2836;
  border-radius: 4px;
  border-left: 3px solid #ef6b6b;
}

.qs-fix-file {
  font-size: 11px;
  color: #7fb4d8;
  font-family: monospace;
  margin-bottom: 4px;
}

.qs-fix-detail {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin-bottom: 4px;
}

.qs-fix-expected {
  color: #4ec9a0;
  font-family: monospace;
}

.qs-fix-arrow {
  color: #a3b8cb;
}

.qs-fix-actual {
  color: #ef6b6b;
  font-family: monospace;
  text-decoration: line-through;
}

.qs-fix-location {
  color: #7fb4d8;
  font-size: 11px;
  margin-left: auto;
}

.qs-fix-context {
  font-size: 11px;
  color: #c5d5e5;
  font-family: monospace;
  padding: 4px 6px;
  background: #0f1722;
  border-radius: 3px;
  margin-top: 4px;
  white-space: pre-wrap;
  word-break: break-all;
}

.qs-fix-dimension {
  font-size: 12px;
  color: #e8c547;
  font-weight: 500;
  margin-bottom: 4px;
}

.qs-fix-expected-value {
  font-size: 11px;
  color: #cfe3f5;
  font-family: monospace;
  margin-bottom: 4px;
}

.qs-fix-reason {
  font-size: 11px;
  color: #ef6b6b;
  line-height: 1.4;
}

.qs-fix-more {
  font-size: 11px;
  color: #a3b8cb;
  font-style: italic;
  padding: 4px 8px;
}

/* 资源挂载维度专属样式 */
.qs-dim-resource {
  border-left: 3px solid #3d7ea8;
}
.qs-dim-desc {
  margin: 4px 0 8px;
  font-size: 11px;
  color: #a3b8cb;
}
.qs-rm-ok {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #4ec9a0;
  margin-bottom: 8px;
}
.qs-rm-ok-icon {
  font-weight: bold;
}
.qs-rm-missed {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.qs-rm-missed-item {
  background: #0f1722;
  border-radius: 6px;
  padding: 8px 10px;
  border-left: 2px solid #ef6b6b;
}
.qs-rm-missed-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.qs-rm-missed-icon {
  color: #ef6b6b;
  font-size: 12px;
}
.qs-rm-missed-name {
  color: #e8f1fa;
  font-size: 12px;
  font-weight: 500;
}
.qs-rm-missed-target {
  color: #7fb4d8;
  font-size: 11px;
  font-family: monospace;
  margin-left: auto;
}
.qs-rm-missed-detail {
  font-size: 11px;
  color: #c5d5e5;
  padding-left: 18px;
}
.qs-rm-missed-detail code {
  color: #e8c547;
  background: #1a2836;
  padding: 1px 4px;
  border-radius: 3px;
  font-family: monospace;
}

/* 维度分数颜色 */
.dim-ok { color: #4ec9a0; }
.dim-warn { color: #e8c547; }
.dim-bad { color: #ef6b6b; }
.dim-muted { color: #7f93a8; }

/* 设计图对比 */
.qs-compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
}

.qs-compare-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.qs-compare-label {
  font-size: 13px;
  color: #dbe8f5;
  font-weight: 600;
}

.qs-compare-img-wrap {
  background: #0f1722;
  border: 1px solid #2a3a4d;
  border-radius: 6px;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
}

.qs-compare-img {
  max-width: 100%;
  max-height: 200px;
  border-radius: 4px;
  object-fit: contain;
}

.qs-compare-empty {
  font-size: 12px;
  color: #93a6b8;
}
</style>
