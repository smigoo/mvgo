<template>
  <a-drawer
    :open="visible"
    title="空间分析报告"
    placement="right"
    :width="520"
    @close="$emit('update:visible', false)"
    :body-style="{ padding: '12px 16px', background: '#0d1117' }"
  >
    <!-- 加载中 -->
    <div v-if="loading" class="loading-state">
      <a-spin tip="正在进行空间分析..." />
    </div>

    <!-- 报告内容 -->
    <template v-else-if="report">
      <!-- 摘要卡片 -->
      <div class="section">
        <h4 class="section-title">分析摘要</h4>
        <div class="summary-grid">
          <div class="stat-card">
            <span class="stat-value">{{ report.summary.totalComponents }}</span>
            <span class="stat-label">组件总数</span>
          </div>
          <div class="stat-card highlight">
            <span class="stat-value">{{ report.summary.detectedRows }}×{{ report.summary.detectedColumns }}</span>
            <span class="stat-label">行列结构</span>
          </div>
          <div class="stat-card" :class="report.summary.totalOverlaps > 0 ? 'warn' : ''">
            <span class="stat-value">{{ report.summary.totalOverlaps }}</span>
            <span class="stat-label">重叠关系</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ report.responsiveHints.complexityScore }}</span>
            <span class="stat-label">复杂度 / 10</span>
          </div>
        </div>
        <div class="summary-detail">
          <a-tag color="cyan">吸附率 X: {{ report.summary.snapXRate }}%</a-tag>
          <a-tag color="cyan">吸附率 Y: {{ report.summary.snapYRate }}%</a-tag>
          <a-tag :color="report.summary.headerComponents > 0 ? 'blue' : 'default'">
            头部: {{ report.summary.headerComponents }}
          </a-tag>
          <a-tag color="green">主体: {{ report.summary.bodyComponents }}</a-tag>
          <a-tag :color="report.summary.footerComponents > 0 ? 'blue' : 'default'">
            底部: {{ report.summary.footerComponents }}
          </a-tag>
        </div>
      </div>

      <!-- Zone 分组行列检测 -->
      <div class="section">
        <h4 class="section-title">Zone 行列检测</h4>
        <div v-if="!report.zoneAnalysis || report.zoneAnalysis.length === 0" class="empty-hint">未检测到 Zone 结构</div>
        <div v-for="za in report.zoneAnalysis" :key="za.zoneId" class="zone-analysis-card">
          <div class="za-header">
            <span class="za-name">{{ za.zoneId }}</span>
            <span class="za-region">{{ za.region }}</span>
            <span class="za-stats">{{ za.rows.length }} 行 × {{ za.columns.length }} 列 · {{ za.componentCount }} 组件</span>
          </div>
          <div class="za-rows" v-if="za.rows.length > 0">
            <span class="za-subtitle">行：</span>
            <template v-for="(r, ri) in za.rows" :key="ri">
              <a-tag size="small" :color="rowColors[ri % rowColors.length]">
                R{{ r.rowIndex + 1 }}: y={{ r.y }} {{ r.componentCount }}个
              </a-tag>
            </template>
          </div>
          <div class="za-cols" v-if="za.columns.length > 0 && za.columns.length > 1">
            <span class="za-subtitle">列：</span>
            <template v-for="(c, ci) in za.columns" :key="ci">
              <a-tag size="small" :color="rowColors[ci % rowColors.length]">
                C{{ c.colIndex + 1 }}: x={{ c.x }} {{ c.componentCount }}个
              </a-tag>
            </template>
          </div>
        </div>
      </div>

      <!-- 重叠分析 -->
      <div class="section" v-if="report.overlapAnalysis.length > 0">
        <h4 class="section-title">重叠分析 ({{ report.overlapAnalysis.length }})</h4>
        <div v-for="(ov, idx) in report.overlapAnalysis" :key="idx" class="overlap-card" :class="ov.type">
          <div class="overlap-header">
            <a-tag :color="overlapColor(ov.type)" size="small">{{ overlapLabel(ov.type) }}</a-tag>
            <span class="overlap-ratio">{{ (ov.overlapRatio * 100).toFixed(1) }}% 重叠</span>
          </div>
          <div class="overlap-pair">
            <code>{{ ov.nameA }}</code>
            <span class="overlap-arrow">⇄</span>
            <code>{{ ov.nameB }}</code>
          </div>
          <div class="overlap-meta">
            <span>面积: {{ ov.overlapArea }}px²</span>
            <span>层级: {{ ov.zIndexOrder }}</span>
          </div>
          <div v-if="ov.recommendation" class="overlap-recommend">
            {{ ov.recommendation }}
          </div>
        </div>
      </div>

      <!-- Zone 树 -->
      <div class="section">
        <h4 class="section-title">Zone 结构树</h4>
        <div class="zone-tree">
          <div v-if="report.zoneTree.headerActive" class="tree-node header-node">
            Header · {{ report.zoneTree.headerComponents }} 组件
          </div>
          <template v-for="zone in flatZoneNodes" :key="zone.id">
            <div class="tree-node" :style="{ paddingLeft: (zone.depth * 20 + 8) + 'px' }">
              <div class="tree-row">
                <span class="tree-icon">{{ zone.hasChildren ? '▸' : '·' }}</span>
                <span class="tree-name">{{ zone.id }}</span>
                <span class="tree-meta">{{ zone.layoutMode === 'flex' ? 'Flex' : 'Grid' }} · {{ zone.contentType === 'zones' ? '嵌套' : '组件' }} · {{ zone.componentCount }} 组件</span>
                <span v-if="zone.descendants > zone.componentCount" class="tree-desc"> (含子孙 {{ zone.descendants }})</span>
              </div>
            </div>
          </template>
          <div v-if="report.zoneTree.footerActive" class="tree-node header-node">
            Footer · {{ report.zoneTree.footerComponents }} 组件
          </div>
        </div>
      </div>

      <!-- 响应式建议 -->
      <div class="section">
        <h4 class="section-title">响应式建议</h4>
        <div class="pattern-card">
          <div class="pattern-name">
            {{ report.responsiveHints.detectedGridPatternDescription }}
            <a-tag color="purple" size="small">{{ (report.responsiveHints.gridPatternConfidence * 100).toFixed(0) }}% 置信</a-tag>
          </div>
        </div>

        <div class="breakpoint-list">
          <div v-for="(bp, idx) in report.responsiveHints.breakpointSuggestions" :key="idx" class="breakpoint-item">
            <div class="bp-header">
              <span class="bp-width">@{{ bp.width }}px</span>
              <a-tag size="small">{{ bp.strategy }}</a-tag>
            </div>
            <div class="bp-desc">{{ bp.description }}</div>
          </div>
        </div>

        <div v-if="report.responsiveHints.criticalOverlaps.length > 0" class="critical-section">
          <h5>需关注的重叠</h5>
          <div v-for="(co, idx) in report.responsiveHints.criticalOverlaps" :key="idx" class="critical-item">
            {{ co.a }} ⇄ {{ co.b }} ({{ (co.ratio * 100).toFixed(0) }}%)
          </div>
        </div>
      </div>
    </template>

    <!-- 错误 -->
    <div v-else-if="error" class="error-state">
      <a-alert type="error" :message="error" show-icon />
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SpatialReport, ZoneTreeNode, OverlapInfo } from '@/api/screen-layout'

const props = defineProps<{
  visible: boolean
  loading: boolean
  report: SpatialReport | null
  error: string | null
}>()

defineEmits<{
  'update:visible': [value: boolean]
}>()

// 将 Zone 树扁平化（含深度信息），用于缩进展示
interface FlatZoneNode {
  id: string
  depth: number
  hasChildren: boolean
  layoutMode: string
  contentType: string
  componentCount: number
  descendants: number
}

const flatZoneNodes = computed<FlatZoneNode[]>(() => {
  if (!props.report?.zoneTree?.bodyZones) return []
  const result: FlatZoneNode[] = []

  function walk(nodes: ZoneTreeNode[], depth: number) {
    for (const node of nodes) {
      result.push({
        id: node.id,
        depth,
        hasChildren: (node.children && node.children.length > 0) || false,
        layoutMode: node.layoutMode,
        contentType: node.contentType,
        componentCount: node.componentCount,
        descendants: node.totalDescendantComponents,
      })
      if (node.children && node.children.length > 0) {
        walk(node.children, depth + 1)
      }
    }
  }

  walk(props.report.zoneTree.bodyZones, 0)
  return result
})

// --- 辅助函数 ---

const rowColors = ['#58a6ff', '#3fb950', '#d29922', '#f78166', '#bc8cff', '#56d4dd']

function overlapColor(type: OverlapInfo['type']): string {
  const map: Record<string, string> = {
    major_overlap: 'red',
    intentional_overlay: 'orange',
    minor_overlap: 'gold',
    edge_touch: 'default',
  }
  return map[type] || 'default'
}

function overlapLabel(type: OverlapInfo['type']): string {
  const map: Record<string, string> = {
    major_overlap: '大量重叠',
    intentional_overlay: '有意叠加',
    minor_overlap: '轻微重叠',
    edge_touch: '边缘接触',
  }
  return map[type] || type
}
</script>

<style lang="less" scoped>
.section {
  margin-bottom: 20px;

  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,0.85);
    margin: 0 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
}

.loading-state, .error-state {
  padding: 60px 0;
  text-align: center;
}

.empty-hint {
  color: rgba(255,255,255,0.3);
  font-size: 12px;
  padding: 16px 0;
  text-align: center;
}

// --- 摘要卡片 ---
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 10px;
}

.stat-card {
  background: rgba(255,255,255,0.04);
  border-radius: var(--radius-md);
  padding: 10px 8px;
  text-align: center;
  border: 1px solid rgba(255,255,255,0.06);

  &.highlight { border-color: rgba(88,166,255,0.3); }
  &.warn { border-color: rgba(248,113,102,0.3); }

  .stat-value {
    display: block;
    font-size: 20px;
    font-weight: 700;
    color: #58a6ff;
    line-height: 1.3;
  }
  &.warn .stat-value { color: #f78166; }

  .stat-label {
    display: block;
    font-size: 11px;
    color: rgba(255,255,255,0.45);
    margin-top: 2px;
  }
}

.summary-detail {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

// --- Zone 行列检测 ---
.zone-analysis-card {
  background: rgba(255,255,255,0.03);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  margin-bottom: 6px;
  border-left: 3px solid rgba(88,166,255,0.2);
}

.za-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;

  .za-name {
    font-size: 12px;
    font-weight: 600;
    color: #58a6ff;
    font-family: monospace;
  }
  .za-region {
    font-size: 10px;
    color: rgba(255,255,255,0.3);
    background: rgba(255,255,255,0.05);
    padding: 1px 5px;
    border-radius: var(--radius-xs);
  }
  .za-stats {
    font-size: 11px;
    color: rgba(255,255,255,0.4);
    margin-left: auto;
  }
}

.za-rows, .za-cols {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 3px;
}

.za-subtitle {
  font-size: 10px;
  color: rgba(255,255,255,0.3);
}

// --- 重叠分析 ---
.overlap-card {
  background: rgba(255,255,255,0.03);
  border-radius: var(--radius-sm);
  padding: 10px;
  margin-bottom: 8px;
  border-left: 3px solid transparent;

  &.major_overlap { border-left-color: #f85149; }
  &.intentional_overlay { border-left-color: #d29922; }
  &.minor_overlap { border-left-color: #e3b341; }
  &.edge_touch { border-left-color: rgba(255,255,255,0.1); }
}

.overlap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.overlap-ratio {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  font-family: monospace;
}

.overlap-pair {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;

  code {
    background: rgba(255,255,255,0.06);
    padding: 2px 6px;
    border-radius: var(--radius-xs);
    font-size: 12px;
    color: #58a6ff;
  }
  .overlap-arrow { color: rgba(255,255,255,0.3); }
}

.overlap-meta {
  font-size: 11px;
  color: rgba(255,255,255,0.35);
  display: flex;
  gap: 12px;
}

.overlap-recommend {
  margin-top: 6px;
  font-size: 11px;
  color: rgba(255,255,255,0.55);
  background: rgba(88,166,255,0.08);
  padding: 6px 8px;
  border-radius: var(--radius-xs);
  line-height: 1.5;
}

// --- Zone 树 ---
.zone-tree {
  .tree-node {
    padding: 6px 8px;
    border-radius: var(--radius-xs);
    margin-bottom: 2px;

    &.header-node {
      background: rgba(88,166,255,0.06);
    }
  }

  .tree-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .tree-icon { font-size: 13px; }
  .tree-name {
    color: #58a6ff;
    font-weight: 500;
    font-family: monospace;
  }
  .tree-meta {
    color: rgba(255,255,255,0.4);
    font-size: 11px;
  }
  .tree-desc {
    color: rgba(255,255,255,0.25);
    font-size: 10px;
  }
}

// --- 响应式建议 ---
.pattern-card {
  background: rgba(188,140,255,0.08);
  border: 1px solid rgba(188,140,255,0.15);
  border-radius: var(--radius-sm);
  padding: 10px;
  margin-bottom: 10px;

  .pattern-name {
    font-size: 13px;
    color: rgba(255,255,255,0.8);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
}

.breakpoint-list {
  margin-bottom: 10px;
}

.breakpoint-item {
  background: rgba(255,255,255,0.03);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  margin-bottom: 6px;

  .bp-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .bp-width {
    font-size: 14px;
    font-weight: 600;
    color: #3fb950;
    font-family: monospace;
  }
  .bp-desc {
    font-size: 11px;
    color: rgba(255,255,255,0.5);
    line-height: 1.5;
  }
}

.critical-section {
  h5 {
    font-size: 12px;
    color: #f85149;
    margin: 0 0 6px;
  }
}

.critical-item {
  font-size: 11px;
  color: rgba(255,255,255,0.55);
  padding: 3px 0;
  font-family: monospace;
}
</style>
