<template>
  <div class="pipeline-lab">
    <!-- 顶部标题栏 -->
    <header class="lab-header">
      <h1 class="lab-title">v2 可配置管线实验室</h1>
      <div class="lab-status">
        <a-tag :color="healthStatus === 'ready' ? 'green' : 'orange'">
          {{ healthStatus === 'ready' ? '引擎就绪' : '引擎未就绪' }}
        </a-tag>
        <a-tooltip title="刷新健康检查">
          <a-button type="text" size="small" @click="fetchHealth">
            <template #icon><ReloadOutlined /></template>
          </a-button>
        </a-tooltip>
      </div>
    </header>

    <div class="lab-body">
      <!-- 左侧：配置面板 -->
      <aside class="config-panel">
        <a-form layout="vertical">
          <!-- 规范选择（含自定义上传） -->
          <a-form-item label="代码规范 (spec)">
            <div class="spec-row">
              <a-select
                v-model:value="form.spec"
                @change="handleConfigChange"
                style="flex: 1"
              >
                <a-select-option v-for="s in allSpecs" :key="s.id" :value="s.id">
                  {{ s.name }} <span class="spec-meta">({{ s.id }})</span>
                  <a-tag v-if="s.isCustom" color="blue" size="small" style="margin-left: 4px">自定义</a-tag>
                </a-select-option>
              </a-select>
              <a-tooltip title="上传自定义规范 JSON">
                <a-button
                  type="primary"
                  ghost
                  size="small"
                  :loading="uploadLoading"
                  @click="triggerSpecUpload"
                  style="margin-left: 8px"
                >
                  <template #icon><UploadOutlined /></template>
                  上传
                </a-button>
              </a-tooltip>
              <input
                ref="specFileInput"
                type="file"
                accept=".json,application/json"
                style="display: none"
                @change="handleSpecUpload"
              />
            </div>
            <div v-if="currentSpec" class="spec-desc">{{ currentSpec.description }}</div>
            <div v-if="customSpecs.length" class="custom-specs-hint">
              已加载 {{ customSpecs.length }} 个自定义规范
            </div>
          </a-form-item>

          <!-- 档位选择 -->
          <a-form-item label="生成档位 (tier)">
            <a-radio-group v-model:value="form.tier" @change="handleConfigChange">
              <a-radio-button v-for="t in catalog.tiers" :key="t.id" :value="t.id">
                {{ t.name }}
              </a-radio-button>
            </a-radio-group>
            <div v-if="currentTier" class="tier-desc">
              {{ currentTier.description }} · {{ currentTier.nodeCount }} 节点 ·
              预期 LLM 调用 {{ currentTier.expectedLlmCalls }} 次
            </div>
          </a-form-item>

          <!-- 输入来源 -->
          <a-form-item label="输入来源">
            <a-radio-group v-model:value="form.sourceType">
              <a-radio value="screenshot">截图</a-radio>
              <a-radio value="figma">Figma</a-radio>
            </a-radio-group>
          </a-form-item>

          <!-- 截图上传 -->
          <a-form-item v-if="form.sourceType === 'screenshot'" label="设计截图">
            <a-upload
              :before-upload="handleImageUpload"
              :show-upload-list="false"
              accept="image/*"
            >
              <a-button>
                <template #icon><UploadOutlined /></template>
                选择图片
              </a-button>
            </a-upload>
            <div v-if="form.imageBase64" class="image-preview">
              <img :src="form.imageBase64" alt="预览" />
            </div>
          </a-form-item>

          <!-- Figma URL -->
          <a-form-item v-if="form.sourceType === 'figma'" label="Figma 链接">
            <a-input v-model:value="form.figmaUrl" placeholder="https://www.figma.com/file/...?node-id=..." />
          </a-form-item>

          <!-- 组件名称 -->
          <a-form-item label="组件名称（可选）">
            <a-input v-model:value="form.componentName" placeholder="留空自动生成" />
          </a-form-item>

          <!-- 节点级模型覆盖 -->
          <a-form-item label="模型覆盖（可选）">
            <a-collapse :bordered="false">
              <a-collapse-panel key="models" header="展开节点模型配置">
                <div v-for="node in configurableNodes" :key="node.id" class="model-row">
                  <span class="model-node-name">{{ node.id }}</span>
                  <a-select
                    v-model:value="form.modelOverrides[node.id]"
                    placeholder="默认"
                    allow-clear
                    size="small"
                    style="width: 180px"
                  >
                    <a-select-opt-group label="文本模型">
                      <a-select-option v-for="m in textModels" :key="'text:' + m" :value="m">
                        {{ m }}
                      </a-select-option>
                    </a-select-opt-group>
                    <a-select-opt-group label="视觉模型">
                      <a-select-option v-for="m in visionModels" :key="'vision:' + m" :value="m">
                        {{ m }}
                      </a-select-option>
                    </a-select-opt-group>
                  </a-select>
                </div>
                <div v-if="!configurableNodes.length" class="no-configurable">
                  当前档位无可配置模型的节点
                </div>
              </a-collapse-panel>
            </a-collapse>
          </a-form-item>

          <!-- 操作按钮 -->
          <a-form-item>
            <a-space>
              <a-button type="primary" :loading="previewLoading" @click="fetchPreview">
                预览配置
              </a-button>
              <a-button
                type="primary"
                :loading="generateLoading"
                :disabled="!canGenerate"
                @click="handleGenerate"
              >
                开始生成
              </a-button>
            </a-space>
          </a-form-item>
        </a-form>
      </aside>

      <!-- 右侧：结果面板 -->
      <main class="result-panel">
        <!-- 预览结果：DAG 可视化 -->
        <section v-if="previewResult" class="preview-section">
          <h3 class="section-title">
            节点流程图
            <a-switch
              v-model:checked="graphDraggable"
              checked-children="可拖拽"
              un-checked-children="锁定"
              size="small"
              style="margin-left: 8px"
            />
          </h3>

          <!-- SVG DAG 图 -->
          <div
            class="dag-container"
            ref="dagContainer"
            @mousedown="onDagMouseDown"
            @mousemove="onDagMouseMove"
            @mouseup="onDagMouseUp"
            @mouseleave="onDagMouseUp"
          >
            <svg
              :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
              class="dag-svg"
              :class="{ draggable: graphDraggable }"
            >
              <!-- 连线（先画，在节点下层） -->
              <g class="edges">
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 3, 0 6" fill="#bfbfbf" />
                  </marker>
                  <marker
                    id="arrowhead-active"
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 3, 0 6" fill="#1890ff" />
                  </marker>
                  <!-- 节点阴影 -->
                  <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.1" />
                  </filter>
                </defs>
                <line
                  v-for="(edge, ei) in dagEdges"
                  :key="'e-' + ei"
                  :x1="edge.x1"
                  :y1="edge.y1"
                  :x2="edge.x2"
                  :y2="edge.y2"
                  stroke="#d9d9d9"
                  stroke-width="1.5"
                  marker-end="url(#arrowhead)"
                  class="dag-edge"
                />
              </g>

              <!-- 并行组背景框 -->
              <rect
                v-for="(group, gi) in parallelGroups"
                :key="'pg-' + gi"
                :x="group.x - 6"
                :y="group.y - 6"
                :width="nodeWidth + 12"
                :height="group.height + 12"
                rx="8"
                fill="#f0f5ff"
                stroke="#d6e4ff"
                stroke-width="1"
                stroke-dasharray="4 3"
              />

              <!-- 节点 -->
              <g
                v-for="node in dagNodes"
                :key="node.id"
                :transform="`translate(${node.x}, ${node.y})`"
                class="dag-node"
                :class="{ 'is-llm': node.callsLlm, 'is-selected': selectedNodeId === node.id, dragging: node.dragging }"
                @mousedown.stop="onNodeMouseDown($event, node)"
                @click.stop="onNodeClick($event, node)"
              >
                <rect
                  :width="nodeWidth"
                  :height="nodeHeight"
                  rx="6"
                  :fill="node.color"
                  :stroke="selectedNodeId === node.id ? '#1890ff' : node.stroke"
                  :stroke-width="selectedNodeId === node.id ? 2 : 1"
                  filter="url(#node-shadow)"
                />
                <!-- 中文主标签 -->
                <text
                  :x="nodeWidth / 2"
                  :y="nodeHeight / 2 - (node.subLabel ? 3 : 5)"
                  text-anchor="middle"
                  fill="#fff"
                  font-size="11"
                  font-weight="500"
                >{{ node.label }}</text>
                <!-- 英文副标签（缩写） -->
                <text
                  v-if="node.subLabel"
                  :x="nodeWidth / 2"
                  :y="nodeHeight / 2 + 10"
                  text-anchor="middle"
                  fill="rgba(255,255,255,0.65)"
                  font-size="9"
                >{{ node.subLabel }}</text>
                <!-- LLM 标记点 -->
                <circle
                  v-if="node.callsLlm"
                  :cx="nodeWidth - 7"
                  :cy="7"
                  r="4"
                  fill="#52c41a"
                />
                <!-- 当前模型覆盖标记 -->
                <text
                  v-if="form.modelOverrides[node.id]"
                  :x="7"
                  :cy="nodeHeight - 6"
                  fill="rgba(255,255,255,0.85)"
                  font-size="7"
                >✓</text>
              </g>
            </svg>

            <!-- 点击节点后的模型配置浮层 -->
            <div
              v-if="selectedNode && nodePopoverVisible"
              class="node-popover"
              :style="popoverStyle"
            >
              <div class="popover-header">
                <span class="popover-node-name">{{ selectedNode.label }}</span>
                <span class="popover-node-id">{{ selectedNode.id }}</span>
                <a-tag v-if="selectedNode.callsLlm" color="blue" size="small" style="margin-left: 6px">LLM</a-tag>
                <a-tag v-else color="default" size="small" style="margin-left: 6px">确定性</a-tag>
              </div>
              <div class="popover-body" v-if="selectedNode.callsLlm">
                <div class="popover-label">选择模型</div>
                <a-select
                  :value="form.modelOverrides[selectedNode.id] || null"
                  placeholder="使用默认模型"
                  allow-clear
                  size="small"
                  style="width: 100%"
                  @change="onNodeModelChange(selectedNode.id, $event)"
                >
                  <a-select-opt-group label="文本模型">
                    <a-select-option v-for="m in textModels" :key="'t:' + m" :value="m">
                      {{ m }}
                      <span v-if="previewResult?.models?.find(mo => mo.nodeId === selectedNode.id)?.model === m" style="color: #52c41a; margin-left: 4px">← 当前</span>
                    </a-select-option>
                  </a-select-opt-group>
                  <a-select-opt-group label="视觉模型">
                    <a-select-option v-for="m in visionModels" :key="'v:' + m" :value="m">
                      {{ m }}
                      <span v-if="previewResult?.models?.find(mo => mo.nodeId === selectedNode.id)?.model === m" style="color: #52c41a; margin-left: 4px">← 当前</span>
                    </a-select-option>
                  </a-select-opt-group>
                </a-select>
                <div v-if="previewResult?.models?.find(mo => mo.nodeId === selectedNode.id)" class="popover-current-model">
                  默认：{{ previewResult.models.find(mo => mo.nodeId === selectedNode.id).model }}
                  <a-tag :color="sourceTagColor(previewResult.models.find(mo => mo.nodeId === selectedNode.id).source)" size="small" style="margin-left: 4px">
                    {{ previewResult.models.find(mo => mo.nodeId === selectedNode.id).source }}
                  </a-tag>
                </div>
              </div>
              <div class="popover-body" v-else>
                <span style="color: var(--text-tertiary); font-size: 12px">确定性节点，无需配置模型</span>
              </div>
              <div class="popover-close" @click="closeNodePopover">✕</div>
            </div>
          </div>

          <h3 class="section-title">模型分配表</h3>
          <a-table
            :columns="modelColumns"
            :data-source="previewResult.models"
            :pagination="false"
            size="small"
            row-key="nodeId"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'source'">
                <a-tag :color="sourceTagColor(record.source)">{{ record.source }}</a-tag>
              </template>
              <template v-if="column.key === 'callsLlm'">
                <a-tag v-if="record.callsLlm" color="blue">LLM</a-tag>
                <a-tag v-else>确定性</a-tag>
              </template>
              <template v-if="column.key === 'hasApiKey'">
                <CheckOutlined v-if="record.hasApiKey" style="color: #52c41a" />
                <CloseOutlined v-else style="color: #ff4d4f" />
              </template>
            </template>
          </a-table>

          <div class="preview-summary">
            <a-statistic title="预期 LLM 调用次数" :value="previewResult.expectedLlmCalls" />
            <a-statistic title="规范" :value="previewResult.spec?.id || previewResult.spec || '-'" />
            <a-statistic title="档位" :value="previewResult.tier?.id || previewResult.tier || '-'" />
          </div>
        </section>

        <!-- 进度/结果 -->
        <section v-if="sessionId" class="progress-section">
          <h3 class="section-title">
            任务进度
            <a-tag :color="taskStatus === 'completed' ? 'green' : taskStatus === 'failed' ? 'red' : 'blue'">
              {{ taskStatus }}
            </a-tag>
          </h3>
          <div class="progress-log">
            <div v-for="(log, idx) in progressLogs" :key="idx" class="log-entry">
              <span class="log-time">{{ formatTime(log.timestamp) }}</span>
              <a-tag :color="statusColor(log.status)" size="small">{{ log.status }}</a-tag>
              <span class="log-stage">{{ log.stage }}</span>
              <span class="log-msg">{{ log.message }}</span>
            </div>
          </div>

          <!-- 失败提示 -->
          <a-alert
            v-if="taskStatus === 'failed' && taskError"
            type="error"
            show-icon
            :message="taskError"
            class="task-error-alert"
            style="margin-top: 12px"
          />

          <!-- 最终结果 -->
          <div v-if="taskResult" class="task-result">
            <h4>生成结果</h4>
            <a-descriptions :column="2" bordered size="small">
              <a-descriptions-item label="会话 ID">{{ taskResult.sessionId }}</a-descriptions-item>
              <a-descriptions-item label="组件名">{{ taskResult.componentName }}</a-descriptions-item>
              <a-descriptions-item label="规范">{{ taskResult.spec }}</a-descriptions-item>
              <a-descriptions-item label="档位">{{ taskResult.tier }}</a-descriptions-item>
              <a-descriptions-item label="耗时">{{ (taskResult.durationMs / 1000).toFixed(1) }}s</a-descriptions-item>
              <a-descriptions-item label="产物数量">{{ taskResult.files?.length || 0 }}</a-descriptions-item>
              <a-descriptions-item v-if="taskResult.quality" label="质量分" :span="2">
                文本 {{ taskResult.quality.textScore ?? '-' }} /
                视觉 {{ taskResult.quality.visualScore ?? '-' }} /
                合并 {{ taskResult.quality.mergedScore ?? '-' }}
                <span v-if="taskResult.quality.revisions">（修订 {{ taskResult.quality.revisions }} 轮）</span>
              </a-descriptions-item>
              <a-descriptions-item label="输出路径" :span="2">
                <code>{{ taskResult.outputPath }}</code>
              </a-descriptions-item>
            </a-descriptions>

            <div v-if="taskResult.warnings?.length" class="warnings">
              <h4>告警 ({{ taskResult.warnings.length }})</h4>
              <a-list size="small" :data-source="taskResult.warnings">
                <template #renderItem="{ item }">
                  <a-list-item>
                    <a-typography-text type="warning">{{ item }}</a-typography-text>
                  </a-list-item>
                </template>
              </a-list>
            </div>
          </div>
        </section>

        <!-- 空状态 -->
        <section v-else-if="!previewResult" class="empty-section">
          <a-empty description="配置参数后点击「预览配置」查看节点流程图" />
        </section>
      </main>
    </div>

    <!-- 规范告警 -->
    <a-alert
      v-if="catalog.registryWarnings?.length"
      type="warning"
      show-icon
      class="registry-warnings"
    >
      <template #message>
        <span>规范注册表告警 ({{ catalog.registryWarnings.length }})</span>
      </template>
      <template #description>
        <ul>
          <li v-for="(w, idx) in catalog.registryWarnings" :key="idx">{{ w }}</li>
        </ul>
      </template>
    </a-alert>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import {
  ReloadOutlined,
  UploadOutlined,
  CheckOutlined,
  CloseOutlined,
} from '@ant-design/icons-vue'

// ========== 状态 ==========
const catalog = ref({
  specs: [],
  tiers: [],
  sourceTypes: [],
  defaults: {},
  fallbackModels: {},
  registryWarnings: [],
})
const healthStatus = ref('loading') // loading | ready | not-ready
const form = ref({
  spec: 'microcode',
  tier: 'lite',
  sourceType: 'screenshot',
  imageBase64: '',
  figmaUrl: '',
  componentName: '',
  modelOverrides: {},
})

// 自定义规范
const customSpecs = ref([])
const uploadLoading = ref(false)
const specFileInput = ref(null)

const previewResult = ref(null)
const previewLoading = ref(false)
const generateLoading = ref(false)

const sessionId = ref('')
const taskStatus = ref('') // running | completed | failed
const progressLogs = ref([])
const taskResult = ref(null)
const taskError = ref('')

let eventSource = null

// ========== 计算属性 ==========
const currentSpec = computed(() => allSpecs.value.find(s => s.id === form.value.spec))
const currentTier = computed(() => catalog.value.tiers.find(t => t.id === form.value.tier))
const configurableNodes = computed(() => currentTier.value?.configurableNodes || [])
const textModels = computed(() => Object.values(catalog.value.fallbackModels?.text || {}))
const visionModels = computed(() => Object.values(catalog.value.fallbackModels?.vision || {}))
const canGenerate = computed(() => {
  if (form.value.sourceType === 'screenshot' && !form.value.imageBase64) return false
  if (form.value.sourceType === 'figma' && !form.value.figmaUrl) return false
  return true
})

/** 合并内置 + 自定义规范列表 */
const allSpecs = computed(() => {
  const builtin = (catalog.value.specs || []).map(s => ({
    ...s,
    isCustom: false,
    name: s.name || s.id,
  }))
  return [...builtin, ...customSpecs.value]
})

const modelColumns = [
  { title: '节点', dataIndex: 'nodeId', key: 'nodeId', width: 160 },
  { title: '模型', dataIndex: 'model', key: 'model' },
  { title: '来源', dataIndex: 'source', key: 'source', width: 120 },
  { title: '类型', dataIndex: 'callsLlm', key: 'callsLlm', width: 80 },
  { title: '凭证', dataIndex: 'hasApiKey', key: 'hasApiKey', width: 60 },
]

// ========== DAG 图状态与计算 ==========
const svgWidth = 780
const svgHeight = 200
const nodeWidth = 100
const nodeHeight = 36
const nodeGapX = 14
const nodeGapY = 8
const graphDraggable = ref(true)
const dagContainer = ref(null)

/** 节点 ID → 中文标签映射 */
const NODE_LABEL_MAP = {
  'input-adapter': { label: '输入适配', short: 'adapter' },
  'visual-parser': { label: '视觉解析', short: 'parser' },
  'layout-reviewer': { label: '布局审查', short: 'reviewer' },
  'style-mapper': { label: '样式映射', short: 'mapper' },
  'code-engineer': { label: '代码生成', short: 'engineer' },
  'layout-refiner': { label: '布局精修', short: 'l-refiner' },
  'style-refiner': { label: '样式精修', short: 's-refiner' },
  'adversarial-checker': { label: '对抗检查', short: 'adversary' },
  'screenshot-renderer': { label: '截图渲染', short: 'renderer' },
  'visual-comparator': { label: '视觉比对', short: 'comparator' },
  'code-structure-validator': { label: '结构校验', short: 'validator' },
  'revision-decision': { label: '修订决策', short: 'decision' },
  'emit': { label: '产物输出', short: 'emit' },
}

/** 点击选中的节点 */
const selectedNodeId = ref('')
const selectedNode = computed(() => {
  if (!selectedNodeId.value) return null
  return dagNodes.value.find(n => n.id === selectedNodeId.value) || null
})
const nodePopoverVisible = ref(false)
const popoverPos = ref({ x: 0, y: 0 })

const popoverStyle = computed(() => ({
  left: popoverPos.value.x + 'px',
  top: popoverPos.value.y + 'px',
}))

/** 从 previewResult.steps 构建节点布局 */
const dagNodes = computed(() => {
  if (!previewResult.value?.steps) return []
  const nodes = []
  let x = 20
  let y = 30

  // 收集所有模型信息用于标记 LLM 节点
  const modelMap = {}
  if (previewResult.value.models) {
    for (const m of previewResult.value.models) {
      modelMap[m.nodeId] = m
    }
  }

  for (const step of previewResult.value.steps) {
    if (step.kind === 'parallel') {
      // 并行组：垂直排列
      const startX = x
      for (let i = 0; i < (step.nodes || []).length; i++) {
        const nodeId = step.nodes[i]
        const info = modelMap[nodeId] || {}
        const labelInfo = NODE_LABEL_MAP[nodeId] || { label: nodeId, short: '' }
        nodes.push({
          id: nodeId,
          label: labelInfo.label,
          subLabel: labelInfo.short,
          x: startX,
          y: y + i * (nodeHeight + nodeGapY),
          isParallel: true,
          callsLlm: info.callsLlm,
          color: info.callsLlm ? '#1890ff' : '#8c8c8c',
          stroke: info.callsLlm ? '#096dd9' : '#bfbfbf',
        })
      }
      // 并行组宽度 = nodeWidth，高度根据节点数动态
      const groupHeight = (step.nodes || []).length * (nodeHeight + nodeGapY) - nodeGapY
      x += nodeWidth + nodeGapX * 2
      // 下一组 Y 重置，但如果当前组特别高，后续 Y 要错开
      if (groupHeight > nodeHeight) {
        y = Math.max(30, y - (groupHeight - nodeHeight) / 2)
      }
    } else {
      const nodeId = step.nodeId || step
      const info = modelMap[nodeId] || {}
      const labelInfo = NODE_LABEL_MAP[nodeId] || { label: nodeId, short: '' }
      nodes.push({
        id: nodeId,
        label: labelInfo.label,
        subLabel: labelInfo.short,
        x,
        y,
        isParallel: false,
        callsLlm: info.callsLlm,
        color: info.callsLlm ? '#1890ff' : '#8c8c8c',
        stroke: info.callsLlm ? '#096dd9' : '#bfbfbf',
      })
      x += nodeWidth + nodeGapX
    }
  }

  // 如果超出 viewBox 宽度，压缩间距
  if (x > svgWidth - 20) {
    const scale = (svgWidth - 40) / x
    for (const n of nodes) {
      n.x = 20 + (n.x - 20) * scale
    }
  }

  return nodes
})

/** 并行组背景框 */
const parallelGroups = computed(() => {
  const groups = []
  if (!previewResult.value?.steps) return groups
  let idx = 0
  for (const step of previewResult.value.steps) {
    if (step.kind === 'parallel') {
      const count = step.nodes?.length || 0
      if (count > 1) {
        const firstNode = dagNodes.value[idx]
        const lastNode = dagNodes.value[idx + count - 1]
        if (firstNode && lastNode) {
          groups.push({
            x: firstNode.x,
            y: firstNode.y,
            height: lastNode.y + nodeHeight - firstNode.y,
          })
        }
      }
    }
    idx += step.kind === 'parallel' ? (step.nodes?.length || 1) : 1
  }
  return groups
})

/** 构建连线：相邻节点间画箭头 */
const dagEdges = computed(() => {
  const nodes = dagNodes.value
  if (nodes.length < 2) return []
  const edges = []
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i]
    const to = nodes[i + 1]
    // 判断是否跨并行组（如果 X 差距大则是跨组）
    const isCrossGroup = to.x - from.x > nodeWidth + nodeGapX + 10
    edges.push({
      x1: from.x + nodeWidth,
      y1: from.y + nodeHeight / 2,
      x2: to.x,
      y2: to.y + nodeHeight / 2,
      isCrossGroup,
    })
  }
  return edges
})

// ========== 拖拽逻辑 ==========
let dragNode = null
let dragOffset = { x: 0, y: 0 }
let clickStartPos = { x: 0, y: 0 }
let isDragging = false

function onNodeMouseDown(evt, node) {
  if (!graphDraggable.value) return
  clickStartPos = { x: evt.clientX, y: evt.clientY }
  isDragging = false
  dragNode = node
  dragOffset = { x: evt.offsetX, y: evt.offsetY }
  node.dragging = true
}

function onNodeClick(evt, node) {
  // 区分点击和拖拽：如果鼠标没移动过，视为点击
  const dx = Math.abs(evt.clientX - clickStartPos.x)
  const dy = Math.abs(evt.clientY - clickStartPos.y)
  if (dx < 4 && dy < 4 && !isDragging) {
    selectedNodeId.value = node.id
    // 计算浮层位置（相对于容器）
    const container = dagContainer.value
    if (container) {
      const rect = container.getBoundingClientRect()
      const scaleX = svgWidth / rect.width
      const scaleY = svgHeight / rect.height
      popoverPos.value = {
        x: Math.min(evt.clientX - rect.left + 10, rect.width - 220),
        y: Math.min(evt.clientY - rect.top + 10, rect.height - 160),
      }
    }
    nodePopoverVisible.value = true
  }
}

function onDagMouseMove(evt) {
  if (!dragNode || !graphDraggable.value) return
  const dx = Math.abs(evt.clientX - clickStartPos.x)
  const dy = Math.abs(evt.clientY - clickStartPos.y)
  if (dx > 3 || dy > 3) {
    isDragging = true
  }
  const container = dagContainer.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  const scaleX = svgWidth / rect.width
  const scaleY = svgHeight / rect.height
  dragNode.x = (evt.clientX - rect.left) * scaleX - dragOffset.x
  dragNode.y = (evt.clientY - rect.top) * scaleY - dragOffset.y
}

function onDagMouseUp() {
  if (dragNode) {
    dragNode.dragging = false
    dragNode = null
  }
  // 短暂延迟后再重置 isDragging，确保 click 事件先触发
  setTimeout(() => { isDragging = false }, 10)
}

function onDagMouseDown(evt) {
  // 点击空白区域关闭浮层
  nodePopoverVisible.value = false
  selectedNodeId.value = ''
}

/** 节点模型变更 */
function onNodeModelChange(nodeId, modelValue) {
  if (modelValue) {
    form.value.modelOverrides[nodeId] = modelValue
  } else {
    delete form.value.modelOverrides[nodeId]
  }
}

function closeNodePopover() {
  nodePopoverVisible.value = false
}

// ========== API ==========
const apiBase = '/api/v2/pipeline'

async function fetchCatalog() {
  try {
    const res = await fetch(`${apiBase}/catalog`)
    const data = await res.json()
    if (data.success) {
      catalog.value = data.data
      form.value.spec = data.data.defaults.spec
      form.value.tier = data.data.defaults.tier
    }
  } catch (e) {
    message.error('加载配置目录失败: ' + e.message)
  }
}

async function fetchHealth() {
  healthStatus.value = 'loading'
  try {
    const res = await fetch(`${apiBase}/health`)
    const data = await res.json()
    healthStatus.value = data.data.generationReady ? 'ready' : 'not-ready'
    if (data.data.specAudit?.warnings?.length) {
      catalog.value.registryWarnings = data.data.specAudit.warnings
    }
  } catch (e) {
    healthStatus.value = 'not-ready'
    message.error('健康检查失败: ' + e.message)
  }
}

async function fetchPreview() {
  previewLoading.value = true
  try {
    const body = buildRequestBody()
    const res = await fetch(`${apiBase}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok && data.success) {
      previewResult.value = data.data.preview
    } else {
      message.error(data.message || '预览失败')
    }
  } catch (e) {
    message.error('预览请求失败: ' + e.message)
  } finally {
    previewLoading.value = false
  }
}

async function handleGenerate() {
  if (!canGenerate.value) return
  generateLoading.value = true
  progressLogs.value = []
  taskResult.value = null
  taskStatus.value = 'running'

  try {
    const body = buildRequestBody()
    const res = await fetch(`${apiBase}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      message.error(data.message || '启动失败')
      taskStatus.value = 'failed'
      return
    }

    sessionId.value = data.data.sessionId
    message.success(`任务已启动: ${data.data.sessionId}`)
    subscribeProgress(data.data.sessionId)
  } catch (e) {
    message.error('启动请求失败: ' + e.message)
    taskStatus.value = 'failed'
  } finally {
    generateLoading.value = false
  }
}

function subscribeProgress(sid) {
  if (eventSource) eventSource.close()
  eventSource = createProgressStream(sid)
  eventSource.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data)
      progressLogs.value.push(data)
      // 终态以 type 判定（服务端契约）：complete / error
      // 进度事件（type=progress）用 status 区分阶段，但终态事件不带 status
      if (data.type === 'complete' || data.status === 'completed') {
        taskStatus.value = 'completed'
        // 完成负载是 { type:'complete', ...result }，result 可能内含 artifacts/files
        taskResult.value = data.result || data
        eventSource.close()
      } else if (data.type === 'error' || data.status === 'failed' || data.status === 'error') {
        taskStatus.value = 'failed'
        taskError.value = data.message || '任务执行失败'
        eventSource.close()
      }
    } catch (e) {
      console.warn('进度解析失败:', e)
    }
  }
  eventSource.onerror = () => {
    message.warning('进度推送连接断开')
    eventSource.close()
  }
}

// ========== 规范上传 ==========
function triggerSpecUpload() {
  specFileInput.value?.click()
}

async function handleSpecUpload(evt) {
  const file = evt.target.files?.[0]
  if (!file) return

  uploadLoading.value = true
  try {
    const text = await file.text()
    let specDef
    try {
      specDef = JSON.parse(text)
    } catch (e) {
      message.error('JSON 解析失败: ' + e.message)
      return
    }

    // 前端基本校验
    if (!specDef.id || !specDef.label || !specDef.version) {
      message.warning('建议填写 id / label / version 字段，将自动补全')
      specDef.id = specDef.id || file.name.replace(/\.json$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `custom-${Date.now()}`
      specDef.label = specDef.label || specDef.id
      specDef.version = specDef.version || '0.1.0'
    }

    const res = await fetch(`${apiBase}/specs/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(specDef),
    })
    const data = await res.json()

    if (res.ok && data.success) {
      message.success(data.message || `规范 "${data.id}" 上传成功`)
      // 加入本地自定义列表
      customSpecs.value.push({
        id: data.id,
        name: specDef.label || data.id,
        description: specDef.description || '用户上传的自定义规范',
        isCustom: true,
      })
      // 自动选中新上传的规范
      form.value.spec = data.id
      handleConfigChange()
      // 刷新 catalog 以确认后端已收录
      fetchCatalog()
    } else {
      message.error(data.message || '上传失败')
    }
  } catch (e) {
    message.error('上传异常: ' + e.message)
  } finally {
    uploadLoading.value = false
    // 清空 input 以便重复选择同一文件
    if (specFileInput.value) specFileInput.value.value = ''
  }
}

// ========== 辅助函数 ==========
function buildRequestBody() {
  const body = {
    spec: form.value.spec,
    tier: form.value.tier,
    sourceType: form.value.sourceType,
    componentName: form.value.componentName || undefined,
  }
  if (form.value.sourceType === 'screenshot') {
    body.imageBase64 = form.value.imageBase64
  } else {
    body.figmaUrl = form.value.figmaUrl
  }
  const overrides = { ...form.value.modelOverrides }
  for (const k of Object.keys(overrides)) {
    if (!overrides[k]) delete overrides[k]
  }
  if (Object.keys(overrides).length) {
    body.modelOverrides = overrides
  }
  return body
}

function handleImageUpload(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    form.value.imageBase64 = e.target.result
  }
  reader.readAsDataURL(file)
  return false
}

function handleConfigChange() {
  previewResult.value = null
}

function sourceTagColor(source) {
  const colors = { env: 'green', user: 'blue', spec: 'purple', fallback: 'orange' }
  return colors[source] || 'default'
}

function statusColor(status) {
  const colors = { running: 'blue', completed: 'green', failed: 'red', warning: 'orange' }
  return colors[status] || 'default'
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour12: false })
}

// ========== 生命周期 ==========
onMounted(() => {
  fetchCatalog()
  fetchHealth()
})

onUnmounted(() => {
  if (eventSource) eventSource.close()
})
</script>

<style scoped>
.pipeline-lab {
  min-height: 100vh;
  background: var(--bg-page);
  padding: 20px;
}

.lab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px 20px;
}

.lab-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.lab-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lab-body {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 20px;
}

.config-panel {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-sm);
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}

.result-panel {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-sm);
  min-height: 600px;
}

/* ---- 规范选择 + 上传 ---- */
.spec-row {
  display: flex;
  align-items: center;
}

.spec-meta {
  color: var(--text-tertiary);
  font-size: 12px;
}

.custom-specs-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #1890ff;
}

.spec-desc,
.tier-desc {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.5;
}

.image-preview {
  margin-top: 12px;
  max-width: 200px;
  max-height: 150px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color, #d9d9d9);
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.model-row:last-child {
  border-bottom: none;
}

.model-node-name {
  font-size: 13px;
  color: var(--text-primary);
}

.no-configurable {
  color: var(--text-tertiary);
  font-size: 13px;
  text-align: center;
  padding: 12px;
}

.section-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0 0 12px;
  display: flex;
  align-items: center;
}

/* ---- DAG 流程图 ---- */
.dag-container {
  width: 100%;
  background: var(--bg-alt, #fafafa);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color, #f0f0f0);
  overflow: hidden;
  cursor: default;
  user-select: none;
  position: relative;
}

.dag-container.draggable {
  cursor: grab;
}

.dag-container.dragging {
  cursor: grabbing;
}

.dag-svg {
  width: 100%;
  height: auto;
  display: block;
}

.dag-node {
  cursor: pointer;
  transition: filter 0.15s;
}

.dag-node:hover {
  filter: brightness(1.12);
}

.dag-node.is-selected rect {
  stroke: #1890ff !important;
  stroke-width: 2 !important;
  filter: drop-shadow(0 0 6px rgba(24,144,255,0.35));
}

.dag-node.is-llm:hover {
  filter: brightness(1.1) drop-shadow(0 1px 4px rgba(24,144,255,0.25));
}

.dag-node.dragging {
  cursor: grabbing;
  filter: brightness(1.15) drop-shadow(0 3px 10px rgba(0,0,0,0.15));
}

.dag-edge {
  transition: stroke 0.15s;
}

.dag-edge:hover {
  stroke: #1890ff;
  stroke-width: 2;
}

/* 节点点击浮层 */
.node-popover {
  position: absolute;
  width: 220px;
  background: var(--bg-card, #fff);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08);
  border: 1px solid var(--border-color, #e8e8e8);
  z-index: 100;
  animation: popover-in 0.15s ease-out;
}

@keyframes popover-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.popover-header {
  display: flex;
  align-items: center;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border-color, #f0f0f0);
}

.popover-node-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.popover-node-id {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-left: 6px;
  font-family: monospace;
}

.popover-body {
  padding: 10px 12px;
}

.popover-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.popover-current-model {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-color, #f0f0f0);
  font-size: 12px;
  color: var(--text-tertiary);
}

.popover-close {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  cursor: pointer;
  color: var(--text-tertiary);
  font-size: 12px;
  border-radius: 50%;
}

.popover-close:hover {
  background: var(--bg-alt, #f5f5f5);
  color: var(--text-secondary);
}

/* ---- 旧节点序列（保留兼容） ---- */
.node-sequence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: var(--bg-alt, #fafafa);
  border-radius: var(--radius-sm);
  margin-bottom: 20px;
}

.node-chip {
  padding: 6px 12px;
  background: var(--brand-light, #1890ff);
  color: white;
  border-radius: 16px;
  font-size: 13px;
}

.node-chip.single {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color, #d9d9d9);
}

.parallel-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.parallel-label {
  font-size: 11px;
  color: var(--text-tertiary);
}

.parallel-nodes {
  display: flex;
  gap: 4px;
}

.parallel-nodes .node-chip {
  font-size: 12px;
  padding: 4px 8px;
}

.arrow {
  color: var(--text-tertiary);
  font-size: 16px;
}

.preview-summary {
  display: flex;
  gap: 24px;
  margin-top: 20px;
  padding: 16px;
  background: var(--bg-alt, #fafafa);
  border-radius: var(--radius-sm);
}

.progress-section {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color, #f0f0f0);
}

.progress-log {
  max-height: 300px;
  overflow-y: auto;
  background: var(--bg-alt, #fafafa);
  border-radius: var(--radius-sm);
  padding: 12px;
  font-family: monospace;
  font-size: 12px;
}

.log-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.log-time {
  color: var(--text-tertiary);
  font-size: 11px;
}

.log-stage {
  font-weight: 500;
  color: var(--text-primary);
}

.log-msg {
  color: var(--text-secondary);
}

.task-result {
  margin-top: 20px;
}

.task-result h4 {
  font-size: 14px;
  font-weight: 500;
  margin: 16px 0 8px;
  color: var(--text-primary);
}

.warnings {
  margin-top: 16px;
}

.warnings h4 {
  color: #faad14;
}

.empty-section {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

.registry-warnings {
  margin-top: 20px;
}

.registry-warnings ul {
  margin: 8px 0 0;
  padding-left: 20px;
}
</style>
