<template>
  <a-drawer
    :open="visible"
    title="AI 对比分析"
    placement="right"
    :width="520"
    @close="$emit('update:visible', false)"
    :body-style="{ padding: '16px 18px', background: '#0f1722' }"
  >
    <div v-if="loading" class="cad-loading">
      <a-spin tip="正在比对 Figma 与真实预览..." />
    </div>

    <div v-else-if="error" class="cad-error">
      <a-alert type="error" :message="error" show-icon />
    </div>

    <template v-else-if="report">
      <section class="cad-section cad-summary">
        <div class="cad-kicker">第一阶段</div>
        <div class="cad-title-row">
          <h3>只读对比分析</h3>
          <span class="cad-tag" :class="report.runtime.pass ? 'cad-tag-pass' : 'cad-tag-fail'">
            {{ report.runtime.pass ? '运行时通过' : '运行时未通过' }}
          </span>
        </div>
        <p class="cad-summary-text">{{ report.recommendation?.rationale || report.runtime.summary }}</p>
        <div class="cad-metrics">
          <div class="cad-metric">
            <span class="cad-metric-label">视觉相似度</span>
            <strong class="cad-metric-value">{{ visualScoreText }}</strong>
          </div>
          <div class="cad-metric">
            <span class="cad-metric-label">视觉问题数</span>
            <strong class="cad-metric-value">{{ report.visual?.issues?.length || 0 }}</strong>
          </div>
          <div class="cad-metric">
            <span class="cad-metric-label">下一步</span>
            <strong class="cad-metric-value small">{{ report.recommendation?.nextStep || '无' }}</strong>
          </div>
        </div>
      </section>

      <section class="cad-section">
        <div class="cad-section-head">
          <h4>运行时门禁</h4>
          <span class="cad-tag" :class="report.runtime.pass ? 'cad-tag-pass' : 'cad-tag-fail'">{{ report.runtime.status }}</span>
        </div>
        <p class="cad-plain-text">{{ report.runtime.summary }}</p>
        <div v-if="report.runtime.previewUrl" class="cad-link-row">
          <span class="cad-inline-label">预览地址</span>
          <a :href="report.runtime.previewUrl" target="_blank" rel="noopener">{{ report.runtime.previewUrl }}</a>
        </div>
        <div v-if="report.runtime.issues?.length" class="cad-list">
          <div v-for="(issue, index) in report.runtime.issues" :key="`${issue.id || 'runtime'}-${index}`" class="cad-item runtime">
            <div class="cad-item-top">
              <span class="cad-tag cad-tag-fail">{{ issue.id || 'RUNTIME' }}</span>
              <span class="cad-item-title">{{ issue.message || '未提供说明' }}</span>
            </div>
            <div class="cad-item-meta">{{ issue.category || 'unknown' }}</div>
          </div>
        </div>
      </section>

      <section class="cad-section">
        <div class="cad-section-head">
          <h4>视觉差异</h4>
          <span class="cad-tag" :class="report.visual?.pass ? 'cad-tag-pass' : 'cad-tag-muted'">
            {{ report.visual?.available ? '已分析' : '未执行' }}
          </span>
        </div>
        <p class="cad-plain-text">{{ report.visual?.summary || '暂无视觉分析结果' }}</p>
        <div v-if="report.visual?.issues?.length" class="cad-list">
          <div v-for="(issue, index) in report.visual.issues" :key="`${issue.region}-${index}`" class="cad-item visual">
            <div class="cad-item-top">
              <span class="cad-tag" :class="severityClass(issue.severity)">{{ severityLabel(issue.severity) }}</span>
              <span class="cad-item-title">{{ issue.region }}</span>
            </div>
            <div class="cad-item-desc">{{ issue.description }}</div>
            <div class="cad-item-suggestion">建议：{{ issue.suggestion }}</div>
          </div>
        </div>
      </section>
    </template>

    <div v-else class="cad-empty">
      <a-empty description="暂无分析结果" />
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  loading: boolean
  error: string
  report: any | null
}>()

defineEmits<{
  'update:visible': [value: boolean]
}>()

const visualScoreText = computed(() => {
  if (!props.report?.visual?.available) return '未执行'
  return `${props.report.visual.overallSimilarity ?? 0} 分`
})

function severityClass(level: string) {
  if (level === 'high') return 'cad-tag-fail'
  if (level === 'medium') return 'cad-tag-warn'
  return 'cad-tag-muted'
}

function severityLabel(level: string) {
  if (level === 'high') return '高优'
  if (level === 'medium') return '中优'
  return '低优'
}
</script>

<style scoped>
.cad-loading,
.cad-error,
.cad-empty {
  padding: 56px 0;
  display: flex;
  justify-content: center;
}

.cad-section {
  margin-bottom: 18px;
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: var(--radius-md);
  background: rgba(15, 23, 34, 0.92);
}

.cad-summary {
  background: rgba(16, 24, 38, 0.96);
}

.cad-kicker {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(148, 163, 184, 0.85);
  margin-bottom: 8px;
}

/* 状态标签（固定深色场景，对应规范深色 token） */
.cad-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.6;
  border: 1px solid transparent;
  white-space: nowrap;
}
.cad-tag-pass { background: #064e3b; color: #d1fae5; border-color: #16a34a; }
.cad-tag-fail { background: #450a0a; color: #fee2e2; border-color: #dc2626; }
.cad-tag-warn { background: #451a03; color: #fef3c7; border-color: #b45309; }
.cad-tag-muted { background: #0f172a; color: #e2e8f0; border-color: #475569; }

.cad-title-row,
.cad-section-head,
.cad-item-top,
.cad-link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.cad-title-row h3,
.cad-section-head h4 {
  margin: 0;
  color: #f8fafc;
}

.cad-summary-text,
.cad-plain-text,
.cad-item-desc,
.cad-item-suggestion,
.cad-item-meta,
.cad-inline-label {
  color: rgba(226, 232, 240, 0.78);
  font-size: 13px;
  line-height: 1.6;
}

.cad-summary-text,
.cad-plain-text {
  margin: 10px 0 0;
}

.cad-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.cad-metric {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: rgba(30, 41, 59, 0.78);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.cad-metric-label {
  display: block;
  font-size: 12px;
  color: rgba(148, 163, 184, 0.88);
  margin-bottom: 6px;
}

.cad-metric-value {
  display: block;
  color: #f8fafc;
  font-size: 18px;
  line-height: 1.3;
}

.cad-metric-value.small {
  font-size: 13px;
}

.cad-link-row {
  margin-top: 10px;
  align-items: flex-start;
}

.cad-link-row a {
  color: #60a5fa;
  word-break: break-all;
  text-decoration: none;
}

.cad-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.cad-item {
  padding: 12px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(15, 23, 34, 0.68);
}

.cad-item.runtime {
  border-color: rgba(248, 113, 113, 0.2);
}

.cad-item.visual {
  border-color: rgba(96, 165, 250, 0.2);
}

.cad-item-title {
  flex: 1;
  color: #f8fafc;
  font-size: 13px;
  line-height: 1.5;
}

.cad-item-desc,
.cad-item-suggestion,
.cad-item-meta {
  margin-top: 6px;
}
</style>
