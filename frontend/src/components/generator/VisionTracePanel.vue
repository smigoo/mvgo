<template>
  <div class="vtp">
    <div class="vtp-bar">
      <span class="vtp-bar-title">视觉 → 管线 对照</span>
      <span class="vtp-bar-meta" v-if="visionTrace?.vision?.found">
        {{ visionTrace.vision.sectionCount }} 段 · {{ visionTrace.vision.chartCount }} 图表
      </span>
      <button class="vtp-refresh" :disabled="visionLoading" @click="loadVisionTrace(true)">
        {{ visionLoading ? '加载中…' : '刷新' }}
      </button>
    </div>

    <div v-if="visionError" class="vtp-state error">{{ visionError }}</div>
    <div v-else-if="visionLoading && !visionTrace" class="vtp-state">正在读取视觉分析缓存…</div>
    <div v-else-if="!visionTrace || visionTrace.available === false" class="vtp-state">
      {{ visionTrace?.reason || '暂无视觉分析数据（任务尚未产出视觉缓存，或产物目录已清理）' }}
    </div>

    <template v-else>
      <!-- 结论信号：一眼看是视觉层还是管线层 -->
      <div class="vtp-signals">
        <div v-for="(sig, i) in visionSignals" :key="i" class="vtp-signal" :class="sig.level">
          <span class="vtp-layer" :class="sig.layer">{{ visionLayerLabel(sig.layer) }}</span>
          <span class="vtp-signal-text">{{ sig.message }}</span>
        </div>
      </div>

      <!-- 段对照 -->
      <div class="vtp-block">
        <div class="vtp-block-head">
          <span>段对照</span>
          <span class="vtp-block-hint">视觉 {{ visionTrace.vision.sectionCount }} 段 → plan 保留 {{ visionTrace.plan.sectionCount }} 段</span>
        </div>
        <div
          v-for="sec in visionTrace.vision.sections"
          :key="sec.id"
          class="vtp-sec"
          :class="{ dropped: !sec.keptInPlan }"
        >
          <div class="vtp-sec-line">
            <span class="vtp-sec-id">{{ sec.id }}</span>
            <span class="vtp-sec-name">{{ sec.name || '(未命名)' }}</span>
            <span class="vtp-verdict" :class="sec.keptInPlan ? 'kept' : 'dropped'">
              {{ sec.keptInPlan ? '保留' : '丢弃' }}
            </span>
          </div>
          <div class="vtp-sec-tags">
            <span
              v-if="sec.headerRelation"
              class="vtp-tag"
              :class="{ hot: sec.headerRelation === 'title-itself' }"
            >hr={{ sec.headerRelation }}</span>
            <span v-if="sec.inFigma === false" class="vtp-tag bad">id 不在 Figma</span>
            <span v-else-if="sec.inFigma === true" class="vtp-tag ok">Figma ✓</span>
            <span v-for="(c, ci) in sec.children" :key="ci" class="vtp-kid">
              {{ c.role || '?' }}{{ c.type ? ':' + c.type : '' }}
            </span>
          </div>
          <div v-if="sec.dropHint" class="vtp-hint">{{ sec.dropHint }}</div>
        </div>
      </div>

      <!-- 图表引用对账 -->
      <div class="vtp-block" v-if="visionChartRefs.length || visionTruthNodes.length">
        <div class="vtp-block-head">
          <span>图表引用对账</span>
          <span class="vtp-block-hint">视觉 charts[].section vs Figma 真值</span>
        </div>
        <div v-for="(ref, i) in visionChartRefs" :key="i" class="vtp-ref" :class="ref.verdict">
          <span class="vtp-ref-type">{{ ref.type || 'chart' }}</span>
          <span class="vtp-ref-arrow">→</span>
          <span class="vtp-ref-sec">{{ ref.section || '—' }}</span>
          <span class="vtp-ref-verdict">{{ visionRefLabel(ref) }}</span>
        </div>
        <div class="vtp-truth" v-if="visionTruthNodes.length">
          <span class="vtp-truth-label">Figma 图表真值</span>
          <span v-for="n in visionTruthNodes" :key="n.id" class="vtp-truth-node">
            {{ n.id }} {{ n.name }}
          </span>
        </div>
      </div>

      <!-- 产物子组件 -->
      <div class="vtp-block" v-if="visionTrace.artifact?.componentFiles?.length">
        <div class="vtp-block-head">
          <span>产物子组件</span>
          <span class="vtp-block-hint">{{ visionTrace.artifact.componentFiles.length }} 个文件</span>
        </div>
        <div class="vtp-files">
          <span v-for="f in visionTrace.artifact.componentFiles" :key="f" class="vtp-file">{{ f }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 视觉分析溯源面板（只读）
 *
 * 并排展示「视觉模型原始输出」与「管线 plan」，用于把问题归因到视觉层还是管线层。
 * 数据源：GET /api/tasks/:sessionId/vision-trace（vision-trace.service.ts，只读、永不抛错）。
 *
 * ⚠️ 单一来源：本组件是唯一实现，宿主持有页签即可（任务详情页 / 进度详情面板共用）。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { getTaskVisionTrace } from '@/api/generator/generator'

const props = defineProps<{ sessionId?: string }>()

const visionTrace = ref<any>(null)
const visionLoading = ref(false)
const visionError = ref('')
const visionLoaded = ref(false)

const visionSignals = computed<any[]>(() => visionTrace.value?.signals || [])
const visionChartRefs = computed<any[]>(() => visionTrace.value?.vision?.chartRefs || [])
const visionTruthNodes = computed<any[]>(() => visionTrace.value?.figma?.chartTruthNodes || [])

/** layer 语义：vision = 视觉输出自身问题；pipeline = 视觉给了、下游没接住 */
function visionLayerLabel(layer: string) {
  if (layer === 'vision') return '视觉层'
  if (layer === 'pipeline') return '管线层'
  return '一致'
}

function visionRefLabel(ref: any) {
  switch (ref?.verdict) {
    case 'match-truth':
      return '✓ 命中真值'
    case 'fake-id':
      return '✗ Figma 无此 id'
    case 'not-chart-node':
      return `⚠ 非图表节点（${ref.figmaType || '?'}${ref.figmaName ? ' ' + ref.figmaName : ''}）`
    default:
      return '— 无法判定'
  }
}

async function loadVisionTrace(force = false) {
  const sid = props.sessionId
  if (!sid || visionLoading.value) return
  if (visionLoaded.value && !force) return
  visionLoading.value = true
  visionError.value = ''
  try {
    const res: any = await getTaskVisionTrace(sid)
    // 后端统一信封：{ success, code, message, data, source }
    visionTrace.value = res?.data ?? res
    visionLoaded.value = true
  } catch (e: any) {
    visionError.value = e?.response?.data?.message || e?.message || '视觉分析数据加载失败'
  } finally {
    visionLoading.value = false
  }
}

onMounted(() => loadVisionTrace())

// 切换到别的任务时重置并重取
watch(
  () => props.sessionId,
  () => {
    visionTrace.value = null
    visionLoaded.value = false
    visionError.value = ''
    loadVisionTrace()
  },
)
</script>

<style scoped>
.vtp {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.vtp-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 2px;
}

.vtp-bar-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.vtp-bar-meta {
  font-size: 11px;
  color: var(--text-tertiary);
}

.vtp-refresh {
  margin-left: auto;
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xs);
  background: var(--bg-card);
  color: var(--text-secondary);
}

.vtp-refresh:hover:not(:disabled) {
  color: var(--brand);
  border-color: var(--brand);
}

.vtp-refresh:disabled {
  opacity: 0.6;
  cursor: default;
}

.vtp-state {
  padding: 16px 12px;
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
  border: 1px dashed var(--border-light);
  border-radius: var(--radius-sm);
}

.vtp-state.error {
  color: var(--error);
  border-color: var(--error);
  background: var(--error-bg);
}

.vtp-signals {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vtp-signal {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: 6px 8px;
  border-radius: var(--radius-xs);
  background: var(--bg-alt);
  border-left: 2px solid var(--border-default);
  font-size: 11px;
  line-height: 1.5;
}

.vtp-signal.error {
  border-left-color: var(--error);
  background: var(--error-bg);
}

.vtp-signal.warn {
  border-left-color: var(--warning);
}

.vtp-signal.info {
  border-left-color: var(--success);
}

.vtp-layer {
  flex: 0 0 auto;
  padding: 0 5px;
  border-radius: var(--radius-xs);
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  background: var(--bg-card);
  color: var(--text-secondary);
}

.vtp-layer.vision {
  color: var(--warning);
}

.vtp-layer.pipeline {
  color: var(--error);
}

.vtp-layer.aligned {
  color: var(--success);
}

.vtp-signal-text {
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.vtp-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vtp-block-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}

.vtp-block-hint {
  font-weight: 400;
  color: var(--text-tertiary);
}

.vtp-sec {
  padding: 6px 8px;
  border-radius: var(--radius-xs);
  border: 1px solid var(--border-light);
  background: var(--bg-card);
}

.vtp-sec.dropped {
  border-color: var(--error);
  background: var(--error-bg);
}

.vtp-sec-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.vtp-sec-id {
  font-size: 10px;
  font-family: ui-monospace, Menlo, monospace;
  color: var(--text-tertiary);
}

.vtp-sec-name {
  flex: 1;
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vtp-verdict {
  font-size: 10px;
  padding: 0 5px;
  line-height: 16px;
  border-radius: var(--radius-xs);
}

.vtp-verdict.kept {
  color: var(--success);
  background: var(--bg-alt);
}

.vtp-verdict.dropped {
  color: #fff;
  background: var(--error);
}

.vtp-sec-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.vtp-tag,
.vtp-kid {
  font-size: 10px;
  line-height: 15px;
  padding: 0 5px;
  border-radius: var(--radius-xs);
  color: var(--text-tertiary);
  background: var(--bg-alt);
}

.vtp-tag.ok {
  color: var(--success);
}

.vtp-tag.bad {
  color: var(--error);
}

.vtp-tag.hot {
  color: #fff;
  background: var(--warning);
}

.vtp-hint {
  margin-top: 4px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--error);
}

.vtp-ref {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
  background: var(--bg-alt);
}

.vtp-ref.fake-id {
  background: var(--error-bg);
}

.vtp-ref-type {
  color: var(--brand);
}

.vtp-ref-arrow {
  color: var(--text-tertiary);
}

.vtp-ref-sec {
  font-family: ui-monospace, Menlo, monospace;
  color: var(--text-primary);
}

.vtp-ref-verdict {
  margin-left: auto;
  color: var(--text-secondary);
}

.vtp-ref.fake-id .vtp-ref-verdict {
  color: var(--error);
}

.vtp-ref.not-chart-node .vtp-ref-verdict {
  color: var(--warning);
}

.vtp-ref.match-truth .vtp-ref-verdict {
  color: var(--success);
}

.vtp-truth {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  margin-top: 2px;
}

.vtp-truth-label {
  font-size: 10px;
  color: var(--text-tertiary);
}

.vtp-truth-node {
  font-size: 10px;
  padding: 0 5px;
  line-height: 15px;
  border-radius: var(--radius-xs);
  background: var(--bg-alt);
  color: var(--text-secondary);
}

.vtp-files {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.vtp-file {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  background: var(--bg-alt);
  color: var(--text-secondary);
}
</style>
