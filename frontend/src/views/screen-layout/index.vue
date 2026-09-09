<template>
  <div class="screen-layout-editor">
    <!-- ========== 左面板：配置区 ========== -->
    <aside class="editor-left-panel" :style="{ width: leftPanelWidth + 'px', minWidth: leftPanelWidth + 'px' }">
      <div class="panel-header panel-tabs">
        <div
          class="panel-tab"
          :class="{ active: leftPanelTab === 'config' }"
          @click="leftPanelTab = 'config'"
        >配置</div>
        <div
          class="panel-tab"
          :class="{ active: leftPanelTab === 'palette' }"
          @click="leftPanelTab = 'palette'"
        >组件库</div>
      </div>
      <div class="panel-body" v-show="leftPanelTab === 'config'">
        <a-collapse v-model:activeKey="activeKeys" :bordered="false" expand-icon-position="end">

          <!-- 1. 预设选择 -->
          <a-collapse-panel key="presets" header="预设模板">
            <!-- 大屏场景 -->
            <div class="preset-category">
              <div class="preset-category-header">
                <span class="category-dot screen"></span>
                <span class="category-title">大屏场景</span>
                <span class="category-count">{{ PRESETS_BIG_SCREEN.length }} 个</span>
              </div>
              <div class="preset-grid">
                <div
                  v-for="preset in PRESETS_BIG_SCREEN"
                  :key="preset.id"
                  class="preset-card"
                  :class="{ active: selectedPresetId === preset.id }"
                  @click="applyPresetObj(preset)"
                >
                  <!-- 线框图预览 -->
                  <div class="preset-wireframe">
                    <div v-if="preset.header?.enabled" class="wire-hf wire-header">标题栏</div>
                    <div class="wire-body">
                      <div
                        v-for="(col, ci) in preset.body.columns"
                        :key="ci"
                        class="wire-col"
                        :style="wireColStyle(preset, ci)"
                      >
                        <span class="wire-col-label">{{ colLabel(preset, ci) }}</span>
                      </div>
                    </div>
                    <div v-if="preset.footer?.enabled" class="wire-hf wire-footer"></div>
                  </div>
                  <!-- 名称 + 分辨率 -->
                  <div class="preset-meta">
                    <span class="preset-name">{{ preset.name }}</span>
                    <span class="preset-res">{{ preset.canvas.width }}&times;{{ preset.canvas.height }}</span>
                  </div>
                </div>
              </div>
            </div>

            <a-divider style="margin: 10px 0; border-color: rgba(255,255,255,0.06)" />

            <!-- 后台场景 -->
            <div class="preset-category">
              <div class="preset-category-header">
                <span class="category-dot admin"></span>
                <span class="category-title">后台场景</span>
                <span class="category-count">{{ PRESETS_ADMIN.length }} 个</span>
              </div>
              <div class="preset-grid">
                <div
                  v-for="preset in PRESETS_ADMIN"
                  :key="preset.id"
                  class="preset-card"
                  :class="{ active: selectedPresetId === preset.id }"
                  @click="applyPresetObj(preset)"
                >
                  <!-- 线框图预览 -->
                  <div class="preset-wireframe">
                    <div v-if="preset.header?.enabled" class="wire-hf wire-header">标题栏</div>
                    <div class="wire-body">
                      <div
                        v-for="(col, ci) in preset.body.columns"
                        :key="ci"
                        class="wire-col"
                        :style="wireColStyle(preset, ci)"
                      >
                        <span class="wire-col-label">{{ colLabel(preset, ci) }}</span>
                      </div>
                    </div>
                    <div v-if="preset.footer?.enabled" class="wire-hf wire-footer"></div>
                  </div>
                  <!-- 名称 + 分辨率 -->
                  <div class="preset-meta">
                    <span class="preset-name">{{ preset.name }}</span>
                    <span class="preset-res">{{ preset.canvas.width }}&times;{{ preset.canvas.height }}</span>
                  </div>
                </div>
              </div>
            </div>
          </a-collapse-panel>

          <!-- 2. 画布配置 -->
          <a-collapse-panel key="canvas" header="画布设置">
            <a-form layout="vertical" :model="layoutData.canvas" size="small">
              <a-form-item label="自适应模式">
                <a-select v-model:value="layoutData.canvas.outputScaleMode" size="small">
                  <a-select-option value="contain">等比缩放 (contain)</a-select-option>
                  <a-select-option value="fillWidth">填充宽度 (fillWidth)</a-select-option>
                  <a-select-option value="fillHeight">填充高度 (fillHeight)</a-select-option>
                  <a-select-option value="none">无缩放 (none)</a-select-option>
                </a-select>
              </a-form-item>
              <a-form-item label="背景色">
                <div style="display:flex;align-items:center;gap:8px">
                  <input type="color" v-model="layoutData.canvas.backgroundColor" style="width:32px;height:28px;border:none;cursor:pointer;padding:0" />
                  <a-input v-model:value="layoutData.canvas.backgroundColor" size="small" style="width:100px" />
                </div>
              </a-form-item>
            </a-form>
          </a-collapse-panel>

          <!-- 3. 头部 / 底部 -->
          <a-collapse-panel key="hf" header="头部 & 底部">
            <!-- 头部 -->
            <div class="hf-section">
              <div class="hf-toggle-row">
                <span class="hf-label">头部</span>
                <a-switch v-model:checked="headerEnabled" size="small" />
              </div>
              <template v-if="headerEnabled && layoutData.header">
                <a-form-item label="高度" style="margin-bottom:6px">
                  <a-input v-model:value="layoutData.header.height" size="small" placeholder="80px" />
                </a-form-item>
                <a-form-item label="背景色" style="margin-bottom:6px">
                  <a-input v-model:value="layoutData.header.backgroundColor" size="small" placeholder="transparent" />
                </a-form-item>
              </template>
            </div>
            <a-divider style="margin:8px 0" />
            <!-- 底部 -->
            <div class="hf-section">
              <div class="hf-toggle-row">
                <span class="hf-label">底部</span>
                <a-switch v-model:checked="footerEnabled" size="small" />
              </div>
              <template v-if="footerEnabled && layoutData.footer">
                <a-form-item label="高度" style="margin-bottom:6px">
                  <a-input v-model:value="layoutData.footer.height" size="small" placeholder="60px" />
                </a-form-item>
                <a-form-item label="背景色" style="margin-bottom:6px">
                  <a-input v-model:value="layoutData.footer.backgroundColor" size="small" placeholder="rgba(0,0,0,0.3)" />
                </a-form-item>
              </template>
            </div>
          </a-collapse-panel>

          <!-- 4. 列管理 -->
          <a-collapse-panel key="columns" header="列管理">
            <div class="column-list">
              <div
                v-for="(col, idx) in layoutData.body.columns"
                :key="col.id"
                class="column-item"
                :class="{ 'column-selected': selectedColumnIdx === idx }"
                @click="selectColumn(idx)"
              >
                <span class="column-index">#{{ idx + 1 }}</span>
                <a-input v-model:value="col.width" size="small" style="width:60px;font-size:12px" @click.stop />
                <a-switch
                  v-model:checked="col.collapsible"
                  size="small"
                  @click.stop
                  @change="(v: boolean) => { if (!v) col.defaultCollapsed = false }"
                />
                <a-button
                  v-if="layoutData.body.columns.length > 1"
                  type="text"
                  danger
                  size="small"
                  @click.stop="removeColumn(idx)"
                >
                  ✕
                </a-button>
              </div>
            </div>
            <a-button type="dashed" size="small" block style="margin-top:6px" @click="addColumn">
              + 添加列
            </a-button>
            <!-- 选中列的详细配置 -->
            <template v-if="selectedColumnIdx !== null && layoutData.body.columns[selectedColumnIdx]">
              <a-divider style="margin:10px 0 6px">列 {{ selectedColumnIdx + 1 }} 详细</a-divider>
              <a-form layout="vertical" size="small">
                <a-form-item label="宽度 (fr)">
                  <a-input v-model:value="layoutData.body.columns[selectedColumnIdx].width" />
                </a-form-item>
                <a-form-item label="可拖拽宽度">
                  <a-switch v-model:checked="layoutData.body.columns[selectedColumnIdx].resizable" />
                </a-form-item>
                <a-form-item label="可收缩">
                  <a-switch v-model:checked="layoutData.body.columns[selectedColumnIdx].collapsible" />
                </a-form-item>
                <a-form-item v-if="layoutData.body.columns[selectedColumnIdx].collapsible" label="默认展开">
                  <a-switch v-model:checked="defaultExpanded" />
                </a-form-item>
                <a-form-item v-if="layoutData.body.columns[selectedColumnIdx].collapsible" label="收起宽度">
                  <a-input v-model:value="layoutData.body.columns[selectedColumnIdx].collapsedWidth" />
                </a-form-item>
              </a-form>
            </template>
          </a-collapse-panel>

        </a-collapse>
      </div>

      <!-- 组件库面板 -->
      <div class="panel-body palette-body" v-show="leftPanelTab === 'palette'">
        <!-- 布局模板 -->
        <div class="palette-section">
          <div class="palette-section-title">布局模板</div>
          <div class="palette-label-hint">拖入列中创建布局区域</div>
          <div
            v-for="tpl in layoutTemplates"
            :key="tpl.key"
            class="palette-item palette-layout"
            draggable="true"
            @dragstart="onLayoutDragStart($event, tpl)"
          >
            <div class="palette-item-icon">{{ tpl.icon }}</div>
            <div class="palette-item-info">
              <div class="palette-item-name">{{ tpl.label }}</div>
              <div class="palette-item-desc">{{ tpl.desc }}</div>
            </div>
          </div>
        </div>

        <a-divider style="margin: 12px 0; border-color: rgba(255,255,255,0.06)" />

        <!-- 组件（通用，不区分类型） -->
        <div class="palette-section">
          <div class="palette-section-title">通用组件</div>
          <div class="palette-label-hint">拖入布局放置组件</div>
          <div
            class="palette-item palette-component"
            draggable="true"
            @dragstart="onComponentDragStart"
          >
            <div class="palette-item-icon">⬜</div>
            <div class="palette-item-info">
              <div class="palette-item-name">通用组件</div>
              <div class="palette-item-desc">布局占位，可拖拽调整位置和大小</div>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <!-- 左面板拖拽分隔条 -->
    <div class="panel-resizer" @mousedown="startResizeLeft"></div>

    <!-- ========== 中间：画布预览 ========== -->
    <main class="editor-canvas-area">
      <div class="canvas-toolbar">
        <span class="toolbar-title">{{ layoutData.name || '未命名布局' }}</span>

        <!-- 尺寸控制 -->
        <div class="toolbar-group">
          <span class="toolbar-label">尺寸</span>
          <a-select
            size="small"
            style="width: 150px"
            :value="canvasPresetIdx >= 0 ? canvasPresetIdx : 'custom'"
            @change="(val: number | string) => {
              if (typeof val === 'number') {
                const p = CANVAS_PRESETS[val]
                applyCanvasPreset(p.width, p.height)
              }
            }"
          >
            <a-select-option
              v-for="(p, idx) in CANVAS_PRESETS"
              :key="idx"
              :value="idx"
            >
              {{ p.label }}
            </a-select-option>
            <a-select-option value="custom">
              {{ layoutData.canvas.width }}×{{ layoutData.canvas.height }}
            </a-select-option>
          </a-select>
        </div>

        <!-- 缩放控制 -->
        <div class="toolbar-group">
          <span class="toolbar-label">缩放</span>
          <a-button-group size="small">
            <a-button @click="zoomOut" :disabled="layoutData.canvas.editorZoom <= 0.1">−</a-button>
            <a-select
              size="small"
              style="width: 85px"
              :value="layoutData.canvas.editorZoom"
              @change="(val: number) => layoutData.canvas.editorZoom = val"
            >
              <a-select-option
                v-for="opt in ZOOM_OPTIONS"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </a-select-option>
            </a-select>
            <a-button @click="zoomIn" :disabled="layoutData.canvas.editorZoom >= 2">+</a-button>
          </a-button-group>
          <a-tooltip title="适应窗口">
            <a-button size="small" @click="zoomToFit">⤢</a-button>
          </a-tooltip>
          <a-tooltip title="适应宽度">
            <a-button size="small" @click="zoomToFitWidth">↔</a-button>
          </a-tooltip>
          <a-tooltip title="100%">
            <a-button size="small" @click="zoomReset">1:1</a-button>
          </a-tooltip>
        </div>

        <a-space style="margin-left:auto">
          <a-tooltip title="撤销 (Ctrl+Z)">
            <a-button size="small" @click="undo" :disabled="!canUndo">↶ 撤销</a-button>
          </a-tooltip>
          <a-tooltip title="重做 (Ctrl+Shift+Z)">
            <a-button size="small" @click="redo" :disabled="!canRedo">↷ 重做</a-button>
          </a-tooltip>
          <a-button size="small" @click="handleSaveJson">导出 JSON</a-button>
          <a-button size="small" @click="handleLoadJsonClick">导入 JSON</a-button>
          <a-tooltip title="图层显示：正常 / 半透明 / 仅轮廓">
            <a-button
              size="small"
              @click="cycleOpacityMode"
              :style="{ fontWeight: layerOpacityMode !== 'normal' ? 700 : 400 }"
            >
              {{ opacityModeLabel }}
            </a-button>
          </a-tooltip>
          <a-button size="small" @click="handleAnalyze" :loading="analyzing || analyzingResponsive">
            AI 生成响应式
          </a-button>
          <a-button type="primary" size="small" @click="handleDownload" :loading="downloading">
            下载 ZIP
          </a-button>
        </a-space>
      </div>
      <!-- 隐藏的文件输入 -->
      <input
        ref="fileInputRef"
        type="file"
        accept=".json"
        style="display:none"
        @change="handleLoadJsonFile"
      />
      <div
        ref="canvasContainerRef"
        class="canvas-container"
        :style="[canvasContainerStyle, containerZoomStyle]"
      >
        <div
          class="canvas-viewport"
          :style="viewportStyle"
        >
          <!-- 网格背景 -->
          <div v-if="layoutData.canvas.showGrid" class="canvas-grid" :style="gridStyle"></div>

          <!-- 头部 -->
          <div v-if="layoutData.header?.enabled" class="canvas-header" :style="{ height: layoutData.header.height, backgroundColor: layoutData.header.backgroundColor || 'transparent' }">
            <span class="zone-label">Header · {{ layoutData.header.height }}</span>
            <div class="hf-resize-handle" @mousedown="startResizeHeader"></div>
          </div>

          <!-- 主体列 -->
          <div class="canvas-body" :style="bodyGridStyle">
            <div
              v-for="(col, idx) in layoutData.body.columns"
              :key="col.id"
              class="canvas-column"
              :class="{ 'column-selected': selectedColumnIdx === idx }"
              :style="colStyle(col)"
              @click="selectColumn(idx)"
            >
              <!-- 列宽拖拽手柄（最后一列除外） -->
              <div
                v-if="idx < layoutData.body.columns.length - 1"
                class="col-resize-handle"
                @mousedown="startResizeColumn($event, idx)"
              ></div>
              <!-- 列头信息 -->
              <div class="column-header-bar">
                <span class="column-label">{{ col.width }}</span>
                <span v-if="col.collapsible" class="column-collapse-badge">«»</span>
                <a-button type="text" size="small" class="add-zone-btn" @click.stop="handleAddZone(idx)">+ Zone</a-button>
              </div>

              <!-- Zone 渲染区 -->
              <div
                class="column-zones"
                :class="{ 'col-drag-over': colDragOverIdx === idx }"
                @dragover.prevent="onColDragOver($event, idx)"
                @dragleave="onColDragLeave"
                @drop.prevent="onColDrop($event, idx)"
              >
                <!-- Bottom 层：absolute 全宽铺底 -->
                <ZoneRenderer
                  v-for="bz in ops.getBottomZones(idx)"
                  :key="bz.id"
                  :zone="bz"
                />

                <!-- Middle 层：列内流式 -->
                <ZoneRenderer
                  v-for="mz in ops.getMiddleZones(idx)"
                  :key="mz.id"
                  :zone="mz"
                />

                <!-- 空列提示 -->
                <div
                  v-if="ops.getBottomZones(idx).length === 0 && ops.getMiddleZones(idx).length === 0"
                  class="column-empty-zone"
                >
                  点击上方 + Zone 添加区域
                </div>
              </div>
            </div>
          </div>

          <!-- 底部 -->
          <div v-if="layoutData.footer?.enabled" class="canvas-footer" :style="{ height: layoutData.footer.height, backgroundColor: layoutData.footer.backgroundColor || 'rgba(0,0,0,0.3)' }">
            <div class="hf-resize-handle hf-resize-top" @mousedown="startResizeFooter"></div>
            <span class="zone-label">Footer · {{ layoutData.footer.height }}</span>
          </div>
        </div>
      </div>
    </main>

    <!-- 右面板拖拽分隔条 -->
    <div class="panel-resizer" @mousedown="startResizeRight"></div>

    <!-- ========== 右面板：属性区 ========== -->
    <aside class="editor-right-panel" :style="{ width: rightPanelWidth + 'px', minWidth: rightPanelWidth + 'px' }">
      <div class="panel-header">
        <span class="panel-title">{{ selectedZone ? 'Zone 属性' : '属性' }}</span>
        <a-button v-if="selectedZoneId" type="text" size="small" @click="selectZone(null)">✕</a-button>
      </div>
      <div class="panel-body">
        <ZonePropertyPanel
          v-if="selectedZone"
          :zone="selectedZone"
          @remove="(id: string) => { ops.removeZone(id); selectZone(null) }"
          @duplicate="(id: string) => { ops.duplicateZone(id) }"
        />
        <div v-else class="empty-state">
          <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.3 8.7 8.7 21.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4z"/><path d="m7.5 10.5 2 2"/><path d="m10.5 7.5 2 2"/><path d="m13.5 4.5 2 2"/><path d="m4.5 13.5 2 2"/></svg></div>
          <p class="empty-text">点击画布中的 Zone<br/>编辑详细属性</p>
          <p class="empty-hint">在列内点击「+ Zone」按钮<br/>添加新区域</p>
        </div>
      </div>
    </aside>

    <!-- ========== 右键上下文菜单 ========== -->
    <Teleport to="body">
      <div
        v-if="ctxMenu"
        class="ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
        @click.stop
        @contextmenu.prevent.stop
      >
        <template v-if="ctxMenu.type === 'component'">
          <div class="ctx-item" @click="ctxCopyComponent">复制组件</div>
          <div class="ctx-divider"></div>
          <div class="ctx-item" @click="ctxBringToFront">⬆ 置顶</div>
          <div class="ctx-item" @click="ctxMoveUp">↑ 上移一层</div>
          <div class="ctx-item" @click="ctxMoveDown">↓ 下移一层</div>
          <div class="ctx-item" @click="ctxSendToBack">⬇ 置底</div>
          <div class="ctx-divider"></div>
          <div class="ctx-item danger" @click="ctxDeleteComponent">删除组件</div>
        </template>
        <template v-else>
          <div class="ctx-item" @click="ctxDuplicateZone">复制 Zone</div>
          <div class="ctx-divider"></div>
          <div
            class="ctx-item danger"
            :class="{ 'ctx-disabled': !ctxMenu.canDelete }"
            @click="ctxDeleteZone"
          >
            删除 Zone
            <span v-if="!ctxMenu.canDelete" class="ctx-hint">（需先清空组件）</span>
          </div>
        </template>
      </div>
    </Teleport>

    <!-- ========== 空间分析面板 ========== -->
    <AnalysisPanel
      v-model:visible="showAnalysisPanel"
      :loading="analyzing"
      :report="analysisReport"
      :error="analysisError"
    />

    <!-- ========== 响应式 AI 生成进度弹窗 ========== -->
    <ResponsiveProgressModal
      v-model:visible="showResponsiveModal"
      :analyzing="analyzingResponsive"
      :current-stage="responsiveStage"
      :stages="responsiveStages"
      :result="responsiveResult"
      :error="responsiveError"
      @download="handleResponsiveDownload"
      @retry="handleAnalyze"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, provide, computed, onMounted, onUnmounted, nextTick } from 'vue'
import type { ScreenLayout, ColumnConfig, ZoneConfig, HeaderFooterConfig } from '@/types/screen-layout'
import { PRESETS, PRESETS_BIG_SCREEN, PRESETS_ADMIN, PRESET_LABELS } from '@/config/screen-layout-presets'
import { downloadScreenLayout, analyzeSpatialLayout } from '@/api/screen-layout'
import type { SpatialReport } from '@/api/screen-layout'
import { useZoneOps } from './composables/useZoneOps'
import { useHistory } from './composables/useHistory'
import { useResponsiveAnalysis } from './composables/useResponsiveAnalysis'
import { ZONE_OPS_KEY, type LayerOpacityMode } from './components/zone-context'
import ZonePropertyPanel from './components/ZonePropertyPanel.vue'
import ZoneRenderer from './components/ZoneRenderer.vue'
import AnalysisPanel from './components/AnalysisPanel.vue'
import ResponsiveProgressModal from './components/ResponsiveProgressModal.vue'

// ============================================================
// 状态
// ============================================================

const layoutData = ref<ScreenLayout>(structuredClone(PRESETS[4])) // 默认经典三栏
const selectedColumnIdx = ref<number | null>(null)
const selectedPresetId = ref<string>(PRESETS[4].id)

// "默认展开" = !defaultCollapsed，v-model 不能绑定取反表达式，用 computed 中转
const defaultExpanded = computed({
  get: () => {
    if (selectedColumnIdx.value === null) return false
    return !layoutData.value.body.columns[selectedColumnIdx.value].defaultCollapsed
  },
  set: (val: boolean) => {
    if (selectedColumnIdx.value === null) return
    layoutData.value.body.columns[selectedColumnIdx.value].defaultCollapsed = !val
  }
})

// header / footer 可能为 null，用 computed 中转：null→false，true→创建对象
function makeHFConfig(): HeaderFooterConfig {
  return { enabled: true, height: '80px', backgroundColor: 'transparent', innerLayout: 'grid', gridCols: 1, components: [] }
}
const headerEnabled = computed({
  get: () => layoutData.value.header?.enabled ?? false,
  set: (val: boolean) => {
    if (val) {
      layoutData.value.header = makeHFConfig()
    } else if (layoutData.value.header) {
      layoutData.value.header.enabled = false
    }
  }
})
const footerEnabled = computed({
  get: () => layoutData.value.footer?.enabled ?? false,
  set: (val: boolean) => {
    if (val) {
      layoutData.value.footer = { ...makeHFConfig(), height: '60px', backgroundColor: 'rgba(0,0,0,0.3)' }
    } else if (layoutData.value.footer) {
      layoutData.value.footer.enabled = false
    }
  }
})
const downloading = ref(false)

// 空间分析状态
const analyzing = ref(false)
const analysisReport = ref<SpatialReport | null>(null)
const analysisError = ref<string | null>(null)
const showAnalysisPanel = ref(false)

// 响应式 AI 分析
const {
  analyzing: analyzingResponsive,
  stages: responsiveStages,
  currentStage: responsiveStage,
  result: responsiveResult,
  error: responsiveError,
  start: startResponsiveAnalysis,
  cancel: cancelResponsiveAnalysis,
  download: downloadResponsiveResult,
  reset: resetResponsiveAnalysis,
} = useResponsiveAnalysis()
const showResponsiveModal = ref(false)

// ============================================================
// 面板宽度拖拽
// ============================================================

const leftPanelWidth = ref(320)
const rightPanelWidth = ref(300)
const leftPanelTab = ref<'config' | 'palette'>('config')

function startResizeLeft(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startWidth = leftPanelWidth.value
  const onMove = (ev: MouseEvent) => {
    leftPanelWidth.value = Math.max(200, Math.min(560, startWidth + ev.clientX - startX))
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function startResizeRight(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startWidth = rightPanelWidth.value
  const onMove = (ev: MouseEvent) => {
    rightPanelWidth.value = Math.max(200, Math.min(560, startWidth - ev.clientX + startX))
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// ============================================================
// 画布上拖拽 — 列宽 / 头部底部高度
// ============================================================

/** 拖拽调整列宽（在画布上直接拖两列之间的分隔条） */
function startResizeColumn(e: MouseEvent, colIdx: number) {
  e.preventDefault()
  e.stopPropagation()

  const cols = layoutData.value.body.columns
  if (colIdx >= cols.length - 1) return

  const currentCol = cols[colIdx]
  const nextCol = cols[colIdx + 1]

  const startX = e.clientX
  const startCurrentFr = parseFloat(currentCol.width) || 1
  const startNextFr = parseFloat(nextCol.width) || 1
  const totalFr = startCurrentFr + startNextFr

  const bodyEl = (e.currentTarget as HTMLElement).closest('.canvas-body') as HTMLElement
  if (!bodyEl) return
  const bodyWidth = bodyEl.clientWidth
  if (bodyWidth <= 0) return

  const onMove = (ev: MouseEvent) => {
    const delta = ev.clientX - startX
    const deltaFr = (delta / bodyWidth) * totalFr
    let newCurrentFr = startCurrentFr + deltaFr
    let newNextFr = startNextFr - deltaFr
    if (newCurrentFr < 0.1) { newCurrentFr = 0.1; newNextFr = totalFr - 0.1 }
    if (newNextFr < 0.1) { newNextFr = 0.1; newCurrentFr = totalFr - 0.1 }
    currentCol.width = `${+newCurrentFr.toFixed(3)}fr`
    nextCol.width = `${+newNextFr.toFixed(3)}fr`
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

/** 拖拽调整头部高度 */
function startResizeHeader(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (!layoutData.value.header) return
  const startY = e.clientY
  const startHeight = parseInt(layoutData.value.header.height) || 80
  const onMove = (ev: MouseEvent) => {
    const h = Math.max(20, Math.round(startHeight + ev.clientY - startY))
    layoutData.value.header!.height = `${h}px`
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

/** 拖拽调整底部高度 */
function startResizeFooter(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (!layoutData.value.footer) return
  const startY = e.clientY
  const startHeight = parseInt(layoutData.value.footer.height) || 60
  const onMove = (ev: MouseEvent) => {
    const h = Math.max(20, Math.round(startHeight + ev.clientY - startY))
    layoutData.value.footer!.height = `${h}px`
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// ============================================================
// 画布尺寸预设 & 缩放控制
// ============================================================

const CANVAS_PRESETS = [
  { label: '1920 × 1080', sub: 'FHD', width: 1920, height: 1080 },
  { label: '2560 × 1080', sub: 'UWFHD', width: 2560, height: 1080 },
  { label: '2560 × 1440', sub: 'QHD', width: 2560, height: 1440 },
  { label: '3440 × 1440', sub: 'UWQHD', width: 3440, height: 1440 },
  { label: '3840 × 2160', sub: '4K UHD', width: 3840, height: 2160 },
  { label: '7680 × 2160', sub: '8K UHD', width: 7680, height: 2160 },
]

const ZOOM_OPTIONS = [
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '90%', value: 0.9 },
  { label: '100%', value: 1 },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5 },
  { label: '200%', value: 2 },
]

// 当前尺寸匹配的预设索引（无匹配则 null）
const canvasPresetIdx = computed(() => {
  const c = layoutData.value.canvas
  return CANVAS_PRESETS.findIndex(p => p.width === c.width && p.height === c.height)
})

// 尺寸选择
function applyCanvasPreset(width: number, height: number) {
  layoutData.value.canvas.width = width
  layoutData.value.canvas.height = height
  layoutData.value.canvas.aspectRatio = width / height
}

const canvasContainerRef = ref<HTMLElement | null>(null)

// 适应宽度 — 用父元素（.editor-canvas-area）计算可用空间，因为 zoom 会影响 container 自身尺寸
function zoomToFitWidth() {
  const container = canvasContainerRef.value
  if (!container?.parentElement) return
  const available = container.parentElement.clientWidth - 48 // 减去 canvas-container padding
  layoutData.value.canvas.editorZoom = Math.max(0.1, Math.min(2, available / layoutData.value.canvas.width))
}

// 适应高度
function zoomToFitHeight() {
  const container = canvasContainerRef.value
  if (!container?.parentElement) return
  const available = container.parentElement.clientHeight - 48
  layoutData.value.canvas.editorZoom = Math.max(0.1, Math.min(2, available / layoutData.value.canvas.height))
}

// 适应窗口（取宽高中较小的缩放比）
function zoomToFit() {
  const container = canvasContainerRef.value
  if (!container?.parentElement) return
  const availW = container.parentElement.clientWidth - 48
  const availH = container.parentElement.clientHeight - 48
  const scaleW = availW / layoutData.value.canvas.width
  const scaleH = availH / layoutData.value.canvas.height
  layoutData.value.canvas.editorZoom = Math.max(0.1, Math.min(2, Math.min(scaleW, scaleH)))
}

// 缩放控制
function zoomIn() {
  layoutData.value.canvas.editorZoom = Math.min(2, +(layoutData.value.canvas.editorZoom + 0.05).toFixed(2))
}
function zoomOut() {
  layoutData.value.canvas.editorZoom = Math.max(0.1, +(layoutData.value.canvas.editorZoom - 0.05).toFixed(2))
}
function zoomReset() {
  layoutData.value.canvas.editorZoom = 1
}

// 撤销/重做
const { canUndo, canRedo, undo, redo, resetHistory } = useHistory(layoutData)

const activeKeys = ref(['presets', 'canvas', 'hf', 'columns'])

// Zone 操作
const selectedZoneId = ref<string | null>(null)
const ops = useZoneOps(layoutData)

function selectZone(zoneId: string | null) {
  selectedZoneId.value = selectedZoneId.value === zoneId ? null : zoneId
}

function selectColumn(idx: number) {
  selectedColumnIdx.value = selectedColumnIdx.value === idx ? null : idx
}

// 图层显示模式
const layerOpacityMode = ref<LayerOpacityMode>('normal')

const opacityModes: LayerOpacityMode[] = ['normal', 'translucent', 'outline']
const opacityModeLabel = computed(() => {
  const map: Record<LayerOpacityMode, string> = { normal: '图层', translucent: '半透', outline: '轮廓' }
  return map[layerOpacityMode.value]
})
function cycleOpacityMode() {
  const idx = opacityModes.indexOf(layerOpacityMode.value)
  layerOpacityMode.value = opacityModes[(idx + 1) % opacityModes.length]
}

// provide context for child components
provide(ZONE_OPS_KEY, {
  layoutData,
  ops,
  selectedZoneId,
  selectZone,
  layerOpacityMode,
  onComponentContextMenu,
  onZoneContextMenu,
})

// ============================================================
// 预设操作
// ============================================================

function applyPreset(idx: number) {
  applyPresetObj(PRESETS[idx])
}

function applyPresetObj(preset: ScreenLayout) {
  layoutData.value = structuredClone(preset)
  selectedPresetId.value = preset.id
  selectedColumnIdx.value = null
  selectedZoneId.value = null
  resetHistory()
  // 切换预设后自动适应窗口
  nextTick(() => zoomToFit())
}

/** 计算线框图每列的 flex 比例（将 1fr/2fr 解析为有效 flex 数值） */
function wireColStyle(preset: ScreenLayout, colIndex: number): Record<string, string> {
  const col = preset.body.columns[colIndex]
  const match = col.width.match(/^(\d+(?:\.\d+)?)fr$/)
  const flexVal = match ? match[1] : '1'
  return { flex: flexVal }
}

/** 获取每列的线框图标签 */
function colLabel(preset: ScreenLayout, colIndex: number): string {
  const labels = PRESET_LABELS[preset.name]
  if (labels && labels[colIndex]) return labels[colIndex]
  return '列' + (colIndex + 1)
}

// ============================================================
// 列操作
// ============================================================

function addColumn() {
  const cols = layoutData.value.body.columns
  const lastWidth = cols.length > 0 ? cols[cols.length - 1].width : '1fr'
  cols.push({
    id: `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    width: lastWidth,
    resizable: true,
    collapsible: true,
    defaultCollapsed: false,
    collapsedWidth: '0fr',
  })
}

function removeColumn(idx: number) {
  if (layoutData.value.body.columns.length <= 1) return
  layoutData.value.body.columns.splice(idx, 1)
  if (selectedColumnIdx.value === idx) selectedColumnIdx.value = null
  // 同时移除该列的 zones
  layoutData.value.body.zones = layoutData.value.body.zones.filter(z => z.colIndex !== idx)
}

// ============================================================
// 画布尺寸
// ============================================================

function onCanvasSizeChange() {
  const c = layoutData.value.canvas
  if (c.aspectRatioLocked) {
    c.aspectRatio = c.width / c.height
  } else {
    c.aspectRatio = c.width / c.height
  }
}

function onAspectRatioLockChange(locked: boolean) {
  if (locked) {
    layoutData.value.canvas.aspectRatio = layoutData.value.canvas.width / layoutData.value.canvas.height
  }
}

// ============================================================
// 下载
// ============================================================

async function handleDownload() {
  downloading.value = true
  try {
    await downloadScreenLayout(layoutData.value)
    // ant-design-vue message auto-imported
    ;(window as any).$message?.success('下载成功')
  } catch (e: any) {
    ;(window as any).$message?.error(e.message || '下载失败')
  } finally {
    downloading.value = false
  }
}

// ============================================================
// AI 分析（空间分析 + 响应式生成）
// ============================================================

async function handleAnalyze() {
  // 先做快速的空间分析
  analyzing.value = true
  analysisError.value = null
  analysisReport.value = null

  try {
    const report = await analyzeSpatialLayout(layoutData.value)
    analysisReport.value = report
    showAnalysisPanel.value = true
    ;(window as any).$message?.success('空间分析完成，正在启动 AI 生成...')
  } catch (e: any) {
    analysisError.value = e.message || '分析失败'
    showAnalysisPanel.value = true
    ;(window as any).$message?.error(e.message || '分析失败')
  } finally {
    analyzing.value = false
  }

  // 然后启动 AI 响应式生成
  showResponsiveModal.value = true
  try {
    await startResponsiveAnalysis(layoutData.value)
  } catch (e: any) {
    ;(window as any).$message?.error(e.message || 'AI 生成启动失败')
  }
}

/** 下载 AI 生成的响应式 ZIP */
async function handleResponsiveDownload() {
  try {
    await downloadResponsiveResult()
    ;(window as any).$message?.success('响应式代码已下载')
  } catch (e: any) {
    ;(window as any).$message?.error(e.message || '下载失败')
  }
}

// ============================================================
// 保存/加载 JSON 配置
// ============================================================

const fileInputRef = ref<HTMLInputElement | null>(null)

/** 导出当前布局为 JSON 文件 */
function handleSaveJson() {
  const json = JSON.stringify(layoutData.value, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${layoutData.value.name || 'screen-layout'}.json`
  a.click()
  URL.revokeObjectURL(url)
  ;(window as any).$message?.success('配置已导出')
}

/** 触发文件选择 */
function handleLoadJsonClick() {
  fileInputRef.value?.click()
}

/** 读取 JSON 文件并加载 */
function handleLoadJsonFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result as string) as ScreenLayout
      // 基本校验
      if (!parsed.canvas || !parsed.body || !Array.isArray(parsed.body.columns)) {
        throw new Error('无效的布局配置文件')
      }
      layoutData.value = parsed
      selectedPresetId.value = ''
      selectedColumnIdx.value = null
      selectedZoneId.value = null
      resetHistory()
      ;(window as any).$message?.success(`已加载: ${parsed.name || '未命名'}`)
    } catch (err: any) {
      ;(window as any).$message?.error(err.message || '加载失败')
    }
    // 重置 input 以支持重复选择同一文件
    input.value = ''
  }
  reader.readAsText(file)
}

// ============================================================
// 计算样式
// ============================================================

const viewportStyle = computed(() => ({
  width: `${layoutData.value.canvas.width}px`,
  height: `${layoutData.value.canvas.height}px`,
  backgroundColor: layoutData.value.canvas.backgroundColor,
  backgroundImage: layoutData.value.canvas.backgroundImage
    ? `url(${layoutData.value.canvas.backgroundImage})`
    : undefined,
}))

/** canvas-container 缩放 — 使用 CSS zoom 确保布局尺寸与视觉效果一致 */
const containerZoomStyle = computed(() => ({
  zoom: layoutData.value.canvas.editorZoom,
}))

/** canvas-container 尺寸：viewport 实际尺寸 + padding */
const canvasContainerStyle = computed(() => {
  return {
    width: `${layoutData.value.canvas.width + 48}px`,
    height: `${layoutData.value.canvas.height + 48}px`,
  }
})

const bodyGridStyle = computed(() => {
  const cols = layoutData.value.body.columns
    .map(c => c.defaultCollapsed ? (c.collapsedWidth || '0fr') : c.width)
    .join(' ')
  return { gridTemplateColumns: cols }
})

function colStyle(col: ColumnConfig) {
  return {
    opacity: col.defaultCollapsed ? 0.3 : 1,
  }
}

const gridStyle = computed(() => {
  const gs = layoutData.value.canvas.gridSize
  return {
    backgroundImage: `
      linear-gradient(var(--shadow-sm) 1px, transparent 1px),
      linear-gradient(90deg, var(--shadow-sm) 1px, transparent 1px)
    `,
    backgroundSize: `${gs}px ${gs}px`,
  }
})

// ============================================================
// Zone 辅助
// ============================================================

const selectedZone = computed<ZoneConfig | null>(() => {
  if (!selectedZoneId.value) return null
  return ops.findZone(selectedZoneId.value) || null
})

/** 向当前选中列添加 zone */
function handleAddZone(colIdx: number) {
  const id = ops.addZone(colIdx)
  selectedZoneId.value = id
}

/** 删除 zone 并清除选中状态 */
function handleDeleteZone(zoneId: string) {
  ops.removeZone(zoneId)
  if (selectedZoneId.value === zoneId) selectedZoneId.value = null
  closeContextMenu()
}

/** zone 没有组件和子布局时才允许删除 */
function canDeleteZone(zone: ZoneConfig): boolean {
  return ops.canDeleteZone(zone)
}

// ============================================================
// 组件库面板 — 布局模板 & 组件类型
// ============================================================

interface LayoutTemplate {
  key: string
  icon: string
  label: string
  desc: string
  layoutMode: 'grid' | 'flex'
  flexDir?: 'row' | 'column'
  gridCols?: number
}

// 简化：组件不区分类型，只有一个通用项
const DEFAULT_COMPONENT_NAME = 'GenericPanel'

const layoutTemplates: LayoutTemplate[] = [
  { key: 'flex-row',    icon: '↔', label: 'Flex 横向',   desc: '组件横向排列，适合工具栏',           layoutMode: 'flex', flexDir: 'row' },
  { key: 'flex-column', icon: '↕', label: 'Flex 纵向',   desc: '组件纵向排列，适合列表',             layoutMode: 'flex', flexDir: 'column' },
  { key: 'grid-2',      icon: '⊞', label: 'Grid 2列',    desc: '2 列栅格，适合双卡片',              layoutMode: 'grid', gridCols: 2 },
  { key: 'grid-3',      icon: '⊟', label: 'Grid 3列',    desc: '3 列栅格，适合指标卡片',             layoutMode: 'grid', gridCols: 3 },
  { key: 'grid-4',      icon: '⊠', label: 'Grid 4列',    desc: '4 列栅格，适合数据面板',             layoutMode: 'grid', gridCols: 4 },
  { key: 'grid-12',     icon: '⌸', label: 'Grid 12列',   desc: '12 列栅格，精细布局',               layoutMode: 'grid', gridCols: 12 },
]

// ---- 拖放数据格式 ----
// 布局: application/x-screen-layout → JSON { layoutMode, flexDir?, gridCols? }
// 组件: application/x-screen-component → JSON { componentName }

function onLayoutDragStart(e: DragEvent, tpl: LayoutTemplate) {
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('application/x-screen-layout', JSON.stringify({
    layoutMode: tpl.layoutMode,
    flexDir: tpl.flexDir,
    gridCols: tpl.gridCols,
  }))
}

function onComponentDragStart(e: DragEvent) {
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('application/x-screen-component', JSON.stringify({
    componentName: DEFAULT_COMPONENT_NAME,
  }))
}

// ---- 列接收布局拖放 ----

const colDragOverIdx = ref<number | null>(null)

function onColDragOver(e: DragEvent, colIdx: number) {
  if (e.dataTransfer?.types.includes('application/x-screen-layout')) {
    e.dataTransfer!.dropEffect = 'copy'
    colDragOverIdx.value = colIdx
  }
}

function onColDragLeave() {
  colDragOverIdx.value = null
}

function onColDrop(e: DragEvent, colIdx: number) {
  colDragOverIdx.value = null
  const raw = e.dataTransfer?.getData('application/x-screen-layout')
  if (!raw) return
  try {
    const data = JSON.parse(raw) as { layoutMode: string; flexDir?: string; gridCols?: number }
    const zoneId = ops.addZone(colIdx)
    const zone = ops.findZone(zoneId)
    if (zone) {
      zone.layoutMode = data.layoutMode as 'grid' | 'flex'
      if (data.layoutMode === 'flex' && data.flexDir) {
        zone.flexConfig.direction = data.flexDir
      }
      if (data.layoutMode === 'grid' && data.gridCols) {
        zone.gridConfig.cols = data.gridCols
      }
    }
    selectedZoneId.value = zoneId
  } catch { /* ignore */ }
}

// ============================================================
// 右键上下文菜单
// ============================================================

interface ContextMenuState {
  x: number
  y: number
  type: 'component' | 'zone'
  zoneId: string
  compId?: string
  canDelete: boolean
}

const ctxMenu = ref<ContextMenuState | null>(null)

/** 确保右键菜单不超出视口 */
function clampMenuPos(x: number, y: number) {
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - 170)),
    y: Math.max(8, Math.min(y, window.innerHeight - 130)),
  }
}

/** 组件右键 */
function onComponentContextMenu(e: MouseEvent, zoneId: string, compId: string) {
  e.preventDefault()
  e.stopPropagation()
  const p = clampMenuPos(e.clientX, e.clientY)
  ctxMenu.value = { ...p, type: 'component', zoneId, compId, canDelete: true }
}

/** Zone 右键 */
function onZoneContextMenu(e: MouseEvent, zone: ZoneConfig) {
  e.preventDefault()
  e.stopPropagation()
  const p = clampMenuPos(e.clientX, e.clientY)
  ctxMenu.value = {
    ...p,
    type: 'zone',
    zoneId: zone.id,
    canDelete: canDeleteZone(zone),
  }
}

function closeContextMenu() {
  ctxMenu.value = null
}

/** 上下文菜单操作 */
function ctxCopyComponent() {
  if (!ctxMenu.value?.compId) return
  ops.duplicateComponent(ctxMenu.value.zoneId, ctxMenu.value.compId)
  closeContextMenu()
}

function ctxDeleteComponent() {
  if (!ctxMenu.value?.compId) return
  ops.removeComponent(ctxMenu.value.zoneId, ctxMenu.value.compId)
  closeContextMenu()
}

// ---- 层级操作 ----

function ctxBringToFront() {
  if (!ctxMenu.value?.compId) return
  ops.bringToFront(ctxMenu.value.zoneId, ctxMenu.value.compId)
  closeContextMenu()
}

function ctxSendToBack() {
  if (!ctxMenu.value?.compId) return
  ops.sendToBack(ctxMenu.value.zoneId, ctxMenu.value.compId)
  closeContextMenu()
}

function ctxMoveUp() {
  if (!ctxMenu.value?.compId) return
  ops.moveComponentUp(ctxMenu.value.zoneId, ctxMenu.value.compId)
  closeContextMenu()
}

function ctxMoveDown() {
  if (!ctxMenu.value?.compId) return
  ops.moveComponentDown(ctxMenu.value.zoneId, ctxMenu.value.compId)
  closeContextMenu()
}

function ctxDuplicateZone() {
  if (!ctxMenu.value) return
  ops.duplicateZone(ctxMenu.value.zoneId)
  closeContextMenu()
}

function ctxDeleteZone() {
  if (!ctxMenu.value || !ctxMenu.value.canDelete) return
  handleDeleteZone(ctxMenu.value.zoneId)
}

// ============================================================
// 键盘快捷键 — 撤销/重做
// ============================================================

function handleKeydown(e: KeyboardEvent) {
  const ctrl = e.ctrlKey || e.metaKey
  if (!ctrl) return
  if (e.key === 'z' || e.key === 'Z') {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
  } else if (e.key === 'y' || e.key === 'Y') {
    e.preventDefault()
    redo()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  document.addEventListener('click', closeContextMenu)
  // 初始加载自动适应窗口，避免大画布看不到 header/footer
  nextTick(() => zoomToFit())
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', closeContextMenu)
})
</script>

<style scoped lang="less">
.screen-layout-editor {
  display: flex;
  height: calc(100vh - 284px);
  overflow: hidden;
  background: #0f1419;
}

// ========== 左面板 ==========
.editor-left-panel {
  border-right: none;
  display: flex;
  flex-direction: column;
  background: #141a23;
  overflow: hidden;
  flex-shrink: 0;

  .panel-header {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    .panel-title {
      font-size: 14px;
      font-weight: 600;
      color: rgba(255,255,255,0.85);
    }
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px;

    :deep(.ant-collapse) {
      background: transparent;
      border: none;

      .ant-collapse-item {
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: var(--radius-sm);
        margin-bottom: 8px;
        overflow: hidden;

        .ant-collapse-header {
          padding: 8px 12px !important;
          font-size: 13px;
          font-weight: 500;
          color: rgba(255,255,255,0.75);
          background: rgba(255,255,255,0.03);
        }

        .ant-collapse-content {
          border-top: 1px solid rgba(255,255,255,0.06);
          background: transparent;

          .ant-collapse-content-box {
            padding: 12px;
          }
        }
      }
    }
  }
}

// ========== 预设分类选择 ==========
.preset-category {
  margin-bottom: 4px;
}

.preset-category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;

  .category-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;

    &.screen { background: var(--brand); box-shadow: 0 0 6px rgba(24,144,255,0.5); }
    &.admin { background: var(--success); box-shadow: 0 0 6px rgba(82,196,26,0.5); }
  }

  .category-title {
    font-weight: 600;
    color: rgba(255,255,255,0.8);
  }

  .category-count {
    font-size: 11px;
    color: rgba(255,255,255,0.25);
    margin-left: auto;
  }
}

.preset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.preset-card {
  padding: 8px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
  background: rgba(255,255,255,0.02);

  &:hover { border-color: rgba(24,144,255,0.3); background: rgba(24,144,255,0.05); }
  &.active { border-color: var(--brand); background: rgba(24,144,255,0.08); }

  .preset-wireframe {
    height: 56px;
    margin-bottom: 8px;
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-xs);
    overflow: hidden;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
  }

  .wire-hf {
    height: 10px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    color: rgba(255,255,255,0.5);
  }

  .wire-header {
    background: rgba(24,144,255,0.15);
    border-bottom: 1px solid var(--brand-border);
  }

  .wire-footer {
    background: rgba(24,144,255,0.08);
    border-top: 1px solid rgba(255,255,255,0.06);
  }

  .wire-body {
    flex: 1;
    display: flex;
    gap: 2px;
    padding: 2px;
    min-height: 0;
  }

  .wire-col {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: var(--radius-xs);
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    overflow: hidden;
  }

  .wire-col-label {
    font-size: 9px;
    color: rgba(255,255,255,0.35);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 2px;
    text-align: center;
  }

  .preset-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .preset-name {
      font-size: 11px;
      color: rgba(255,255,255,0.7);
      font-weight: 500;
    }

    .preset-res {
      font-size: 10px;
      color: rgba(255,255,255,0.35);
    }
  }
}

// 旧缩略图样式兼容（保留以防其他地方使用）
.preset-bars {
  display: grid;
  height: 100%;
  gap: 2px;
  &::before, &::after {
    content: '';
  }
}

// ========== 画布区域 ==========
.editor-canvas-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

// ========== 面板拖拽分隔条 ==========
.panel-resizer {
  width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background: rgba(255,255,255,0.06);
  transition: background 0.15s;
  position: relative;
  z-index: 10;

  &::after {
    content: '';
    position: absolute;
    inset: 0 -2px;
  }

  &:hover {
    background: rgba(24,144,255,0.4);
  }
}

.canvas-toolbar {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
  gap: 12px;
  flex-wrap: wrap;

  .toolbar-title { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.85); white-space: nowrap; }
  .toolbar-size { font-size: 12px; color: rgba(255,255,255,0.4); }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border-left: 1px solid rgba(255,255,255,0.08);
  }

  .toolbar-label {
    font-size: 12px;
    color: rgba(255,255,255,0.35);
    white-space: nowrap;
  }

  .toolbar-dim {
    font-size: 12px;
    color: rgba(255,255,255,0.3);
  }
}

.canvas-container {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.canvas-viewport {
  position: relative;
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.1), 0 8px 32px rgba(0,0,0,0.4);
  overflow: hidden;
  transition: width 0.3s, height 0.3s;
  flex-shrink: 0;
}

.canvas-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.canvas-header,
.canvas-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(59, 130, 246, 0.5);
  background: rgba(59, 130, 246, 0.08);
  min-height: 0;
  position: relative;
}

.canvas-body {
  flex: 1;
  display: grid;
  min-height: 0;
}

.canvas-column {
  border: 1px dashed rgba(0,0,0,0.12);
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 0;
  min-height: 0;
  position: relative;
  overflow: visible;

  &:hover { background: rgba(24,144,255,0.03); border-color: var(--brand-border); }
  &.column-selected { background: rgba(24,144,255,0.06); border-color: rgba(24,144,255,0.4); }

  .column-header-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--shadow-sm);
    flex-shrink: 0;

    .column-label {
      font-size: 12px;
      font-weight: 600;
      color: rgba(0,0,0,0.5);
    }

    .column-collapse-badge {
      font-size: 10px;
      color: rgba(24,144,255,0.6);
    }

    .add-zone-btn {
      margin-left: auto;
      font-size: 11px;
      color: rgba(24,144,255,0.6);
      padding: 0 4px;
      height: 22px;
    }
  }

  .column-zones {
    flex: 1;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: auto;
    min-height: 0;
  }

  .column-empty-zone {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: var(--shadow-md);
    pointer-events: none;
  }
}

// ========== Zone 渲染 ==========
.canvas-zone {
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: var(--radius-xs);
  background: rgba(255,255,255,0.015);
  transition: all 0.15s;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  min-height: 24px;

  &:hover { border-color: rgba(24,144,255,0.25); background: rgba(24,144,255,0.03); }
  &.zone-selected { border-color: var(--brand); background: rgba(24,144,255,0.06); box-shadow: 0 0 0 1px var(--brand-border); }

  .zone-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    flex-shrink: 0;
    background: rgba(255,255,255,0.02);

    .zone-bar-id {
      font-size: 10px;
      font-weight: 600;
      color: rgba(255,255,255,0.3);
    }

    .zone-offset-badge {
      font-size: 9px;
      color: rgba(24,144,255,0.4);
      margin-left: auto;
    }
  }

  .zone-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
}

// Bottom 层：absolute 全宽铺底
.zone-bottom-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
}

// Middle 层：列内流式
.zone-middle-layer {
  position: relative;
  z-index: 5;
  flex: 1;
  min-height: 0;
}

// Grid 组件区
.grid-comp-area {
  display: grid;
  gap: 2px;
  flex: 1;
  overflow: auto;
}

.grid-comp-box {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(24,144,255,0.04);
  border: 1px solid rgba(24,144,255,0.08);
  border-radius: var(--radius-xs);
  overflow: hidden;

  .comp-name {
    font-size: 10px;
    color: rgba(24,144,255,0.5);
    font-family: monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
    padding: 0 4px;
  }
}

.zone-empty-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  font-size: 10px;
  color: var(--shadow-md);
  min-height: 20px;
}

.zone-label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(59, 130, 246, 0.7);
  text-transform: uppercase;
  letter-spacing: 1px;
}

// ========== 右面板 ==========
.editor-right-panel {
  border-left: none;
  display: flex;
  flex-direction: column;
  background: #141a23;
  flex-shrink: 0;

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.06);

    .panel-title {
      font-size: 14px;
      font-weight: 600;
      color: rgba(255,255,255,0.85);
    }
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;

  .empty-icon { font-size: 32px; margin-bottom: 12px; }
  .empty-text { color: rgba(0,0,0,0.45); font-size: 13px; margin: 0 0 6px; line-height: 1.5; }
  .empty-hint { color: rgba(0,0,0,0.2); font-size: 11px; margin: 0; line-height: 1.5; }
}

// ========== 头部底部 ==========
.hf-section {
  .hf-toggle-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .hf-label {
    font-size: 13px;
    font-weight: 500;
    color: rgba(0,0,0,0.7);
  }

  :deep(.ant-form-item) {
    margin-bottom: 6px;
  }
}

// ========== 列列表 ==========
.column-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.column-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: all 0.15s;

  &:hover { background: rgba(0,0,0,0.03); }
  &.column-selected { border-color: rgba(24,144,255,0.4); background: rgba(24,144,255,0.06); }

  .column-index {
    font-size: 11px;
    font-weight: 600;
    color: rgba(0,0,0,0.4);
    min-width: 24px;
  }
}

// ========== 暗色表单 ==========
:deep(.ant-form-item-label > label) {
  color: rgba(255,255,255,0.6) !important;
  font-size: 12px !important;
}

:deep(.ant-input),
:deep(.ant-input-number),
:deep(.ant-select-selector) {
  background: rgba(255,255,255,0.06) !important;
  border-color: rgba(255,255,255,0.1) !important;
  color: rgba(255,255,255,0.85) !important;
}

:deep(.ant-divider) {
  border-color: rgba(255,255,255,0.06) !important;
}

// ========== 画布内元素（白色背景适配） ==========
:deep(.ant-tag) {
  color: rgba(0,0,0,0.55) !important;
}
:deep(.ant-tag-blue) {
  color: var(--brand) !important;
  background: rgba(24,144,255,0.08) !important;
  border-color: var(--brand-border) !important;
}
:deep(.ant-tag-purple) {
  color: var(--feature) !important;
  background: rgba(114,46,209,0.08) !important;
  border-color: rgba(114,46,209,0.2) !important;
}

// ========== 列宽拖拽手柄 ==========
.col-resize-handle {
  position: absolute;
  right: -3px;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;

  &::after {
    content: '';
    width: 2px;
    height: 32px;
    border-radius: var(--radius-xs);
    background: var(--shadow-md);
    transition: background 0.15s;
  }

  &:hover::after {
    background: var(--brand);
  }
}

// ========== 头部底部高度拖拽手柄 ==========
.hf-resize-handle {
  position: absolute;
  left: 0;
  right: 0;
  height: 6px;
  cursor: row-resize;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;

  &::after {
    content: '';
    width: 48px;
    height: 2px;
    border-radius: var(--radius-xs);
    background: rgba(59, 130, 246, 0.3);
    transition: background 0.15s;
  }

  &:hover::after {
    background: var(--brand);
  }
}

// 头部的手柄在底部
.canvas-header .hf-resize-handle {
  bottom: -3px;
}
// 底部的手柄在顶部
.hf-resize-top {
  top: -3px;
}

// ========== Zone 删除按钮 ==========
.zone-delete-btn {
  margin-left: auto !important;
  font-size: 12px !important;
  padding: 0 4px !important;
  height: 20px !important;
  opacity: 0.6;
  &:hover { opacity: 1; }
}

// ========== 右键上下文菜单 ==========
.ctx-menu {
  position: fixed;
  z-index: 9999;
  min-width: 140px;
  background: #1f2733;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  padding: 4px 0;
  user-select: none;

  .ctx-item {
    padding: 6px 14px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    transition: background 0.1s;

    &:hover {
      background: rgba(24, 144, 255, 0.12);
      color: var(--text-inverse);
    }

    &.danger {
      color: #ff6b6b;
      &:hover {
        background: rgba(255, 75, 75, 0.12);
        color: #ff5252;
      }
    }

    &.ctx-disabled {
      color: rgba(255, 255, 255, 0.25);
      cursor: not-allowed;
      &:hover {
        background: transparent;
        color: rgba(255, 255, 255, 0.25);
      }
    }

    .ctx-hint {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.2);
    }
  }

.ctx-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 2px 0;
}
}

// ========== 面板 tab 切换 ==========
.panel-tabs {
  display: flex;
  padding: 0 !important;
  .panel-tab {
    flex: 1;
    text-align: center;
    padding: 10px 0;
    font-size: 13px;
    font-weight: 500;
    color: rgba(255,255,255,0.4);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
    &:hover { color: rgba(255,255,255,0.65); }
    &.active { color: var(--brand); border-bottom-color: var(--brand); }
  }
}

// ========== 组件库面板 ==========
.palette-body {
  padding: 12px !important;
}
.palette-section {
  margin-bottom: 4px;
  .palette-section-title {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,0.75);
    margin-bottom: 2px;
  }
  .palette-label-hint {
    font-size: 10px;
    color: rgba(255,255,255,0.2);
    margin-bottom: 8px;
  }
}
.palette-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: var(--radius-sm);
  margin-bottom: 6px;
  cursor: grab;
  transition: all 0.15s;
  background: rgba(255,255,255,0.02);
  user-select: none;
  &:hover {
    background: rgba(24,144,255,0.06);
    border-color: var(--brand-border);
  }
  &:active {
    cursor: grabbing;
    transform: scale(0.97);
  }
  .palette-item-icon {
    font-size: 18px;
    width: 28px;
    text-align: center;
    flex-shrink: 0;
  }
  .palette-item-info {
    min-width: 0;
    .palette-item-name {
      font-size: 12px;
      font-weight: 600;
      color: rgba(255,255,255,0.8);
    }
    .palette-item-desc {
      font-size: 10px;
      color: rgba(255,255,255,0.3);
      margin-top: 1px;
    }
  }
}
.palette-layout {
  border-left: 2px solid rgba(24,144,255,0.3);
}
.palette-component {
  border-left: 2px solid rgba(255,165,0,0.3);
}

// ========== 列拖放高亮 ==========
.col-drag-over {
  outline: 2px dashed var(--brand);
  outline-offset: -2px;
  background: rgba(24,144,255,0.04) !important;
}
</style>
