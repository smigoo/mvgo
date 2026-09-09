<template>
  <div class="zone-property-panel">
    <!-- Zone 信息头 -->
    <div class="prop-section">
      <div class="prop-section-title">
        <span>Zone 属性</span>
        <a-tag color="blue" size="small">{{ zone.id.slice(-6) }}</a-tag>
      </div>
      <a-descriptions size="small" :column="1" :colon="false">
        <a-descriptions-item label="所属列">{{ zone.colIndex >= 0 ? '#' + (zone.colIndex + 1) : '子布局' }}</a-descriptions-item>
        <a-descriptions-item label="组件数">{{ componentCount }}</a-descriptions-item>
      </a-descriptions>
    </div>

    <a-divider style="margin: 8px 0" />

    <!-- 内部布局模式 -->
    <div class="prop-section">
      <div class="prop-section-title">内部布局</div>
      <a-radio-group
        :value="zone.layoutMode"
        button-style="solid"
        size="small"
        style="width: 100%; margin-bottom: 8px"
        @change="(e: any) => updateZoneProp('layoutMode', e.target.value)"
      >
        <a-radio-button value="grid" style="width: 50%; text-align: center">Grid 栅格</a-radio-button>
        <a-radio-button value="flex" style="width: 50%; text-align: center">Flex 弹性</a-radio-button>
      </a-radio-group>

      <!-- Flex 配置 -->
      <template v-if="zone.layoutMode === 'flex'">
        <a-form layout="vertical" size="small">
          <a-form-item label="方向">
            <a-radio-group
              :value="zone.flexConfig.direction"
              button-style="solid"
              size="small"
              style="width: 100%"
              @change="(e: any) => updateFlexCfg({ direction: e.target.value })"
            >
              <a-radio-button value="row" style="width: 50%; text-align: center">→ 横向</a-radio-button>
              <a-radio-button value="column" style="width: 50%; text-align: center">↓ 纵向</a-radio-button>
            </a-radio-group>
          </a-form-item>
          <a-form-item label="间距 (gap)">
            <a-input
              :value="zone.flexConfig.gap"
              size="small"
              placeholder="8px"
              @change="(e: any) => updateFlexCfg({ gap: e.target.value })"
            />
          </a-form-item>
          <a-form-item label="主轴对齐">
            <a-select
              :value="zone.flexConfig.justify"
              size="small"
              @change="(v: any) => updateFlexCfg({ justify: v })"
            >
              <a-select-option value="flex-start">起始 (flex-start)</a-select-option>
              <a-select-option value="center">居中 (center)</a-select-option>
              <a-select-option value="flex-end">末尾 (flex-end)</a-select-option>
              <a-select-option value="space-between">两端 (space-between)</a-select-option>
              <a-select-option value="space-around">环绕 (space-around)</a-select-option>
              <a-select-option value="space-evenly">均分 (space-evenly)</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="交叉轴对齐">
            <a-select
              :value="zone.flexConfig.align"
              size="small"
              @change="(v: any) => updateFlexCfg({ align: v })"
            >
              <a-select-option value="flex-start">起始 (flex-start)</a-select-option>
              <a-select-option value="center">居中 (center)</a-select-option>
              <a-select-option value="flex-end">末尾 (flex-end)</a-select-option>
              <a-select-option value="stretch">拉伸 (stretch)</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="允许换行">
            <a-switch
              :checked="zone.flexConfig.wrap"
              size="small"
              @change="(v: boolean) => updateFlexCfg({ wrap: v })"
            />
          </a-form-item>
        </a-form>
      </template>

      <!-- Grid 配置 -->
      <template v-else>
        <a-form layout="vertical" size="small">
          <a-form-item label="列数 (cols)">
            <a-input-number
              :value="zone.gridConfig.cols"
              :min="1"
              :max="240"
              :step="1"
              style="width: 100%"
              @change="(v: any) => updateGridCfg({ cols: v })"
            />
          </a-form-item>
          <a-form-item label="行高 (rowHeight)">
            <a-input-number
              :value="zone.gridConfig.rowHeight"
              :min="4"
              :max="40"
              :step="2"
              addon-after="px"
              style="width: 100%"
              @change="(v: any) => updateGridCfg({ rowHeight: v })"
            />
          </a-form-item>
        </a-form>
      </template>
    </div>

    <a-divider style="margin: 8px 0" />

    <!-- 内容类型切换 -->
    <div class="prop-section">
      <div class="prop-section-title">内容类型</div>
      <a-radio-group
        :value="zone.contentType"
        button-style="solid"
        size="small"
        style="width: 100%; margin-bottom: 6px"
        @change="(e: any) => switchContentType(e.target.value)"
      >
        <a-radio-button value="components" style="width: 50%; text-align: center">组件</a-radio-button>
        <a-radio-button value="zones" style="width: 50%; text-align: center">子布局</a-radio-button>
      </a-radio-group>
      <p class="prop-hint">
        {{ zone.contentType === 'components'
          ? '此 Zone 内放置组件（Grid/Flex 排列）'
          : '此 Zone 内嵌套子布局，可递归嵌套' }}
      </p>
    </div>

    <!-- Z-Index 层级（仅顶层主体列显示） -->
    <div v-if="isMainColumn && zone.colIndex >= 0" class="prop-section">
      <div class="prop-section-title">Z-Index 层级</div>
      <a-radio-group
        :value="zone.zIndex"
        button-style="solid"
        size="small"
        style="width: 100%"
        @change="(e: any) => switchZIndex(zone.id, e.target.value)"
      >
        <a-radio-button value="bottom" style="width: 50%; text-align: center">底层 (全宽)</a-radio-button>
        <a-radio-button value="middle" style="width: 50%; text-align: center">中层 (列内)</a-radio-button>
      </a-radio-group>
    </div>

    <!-- Offset（仅顶层 middle 层） -->
    <div v-if="zone.colIndex >= 0 && zone.zIndex === 'middle'" class="prop-section">
      <div class="prop-section-title">偏移 (Offset)</div>
      <a-form layout="vertical" size="small">
        <a-form-item label="左侧">
          <a-input
            :value="zone.offset.left"
            placeholder="0"
            @change="(e: any) => updateZoneProp('offset', { ...zone.offset, left: e.target.value })"
          />
        </a-form-item>
        <a-form-item label="右侧">
          <a-input
            :value="zone.offset.right"
            placeholder="0"
            @change="(e: any) => updateZoneProp('offset', { ...zone.offset, right: e.target.value })"
          />
        </a-form-item>
      </a-form>
    </div>

    <!-- 内容对齐 -->
    <div class="prop-section">
      <div class="prop-section-title">内容对齐</div>
      <a-form layout="vertical" size="small">
        <a-form-item label="垂直">
          <a-select
            :value="zone.contentAlign.vertical"
            size="small"
            @change="(v: any) => updateZoneProp('contentAlign', { ...zone.contentAlign, vertical: v })"
          >
            <a-select-option value="top">顶部 (top)</a-select-option>
            <a-select-option value="center">居中 (center)</a-select-option>
            <a-select-option value="bottom">底部 (bottom)</a-select-option>
            <a-select-option value="stretch">拉伸 (stretch)</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="水平">
          <a-select
            :value="zone.contentAlign.horizontal"
            size="small"
            @change="(v: any) => updateZoneProp('contentAlign', { ...zone.contentAlign, horizontal: v })"
          >
            <a-select-option value="left">左 (left)</a-select-option>
            <a-select-option value="center">中 (center)</a-select-option>
            <a-select-option value="right">右 (right)</a-select-option>
            <a-select-option value="stretch">拉伸 (stretch)</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </div>

    <!-- 内边距 -->
    <div class="prop-section">
      <div class="prop-section-title">内边距 (Padding)</div>
      <div class="padding-grid">
        <a-input :value="zone.padding.top" size="small" addon-before="上" @change="(e: any) => updateZoneProp('padding', { ...zone.padding, top: e.target.value })" />
        <a-input :value="zone.padding.bottom" size="small" addon-before="下" @change="(e: any) => updateZoneProp('padding', { ...zone.padding, bottom: e.target.value })" />
        <a-input :value="zone.padding.left" size="small" addon-before="左" @change="(e: any) => updateZoneProp('padding', { ...zone.padding, left: e.target.value })" />
        <a-input :value="zone.padding.right" size="small" addon-before="右" @change="(e: any) => updateZoneProp('padding', { ...zone.padding, right: e.target.value })" />
      </div>
    </div>

    <a-divider style="margin: 8px 0" />

    <!-- 组件列表 (contentType === 'components') -->
    <div v-if="zone.contentType === 'components'" class="prop-section">
      <div class="prop-section-title">
        <span>组件列表</span>
        <a-button type="primary" size="small" @click="handleAddComponent">+ 添加</a-button>
      </div>

      <div v-if="componentCount === 0" class="empty-components">
        暂无组件，点击「添加」创建
      </div>

      <div v-else class="comp-list">
        <div
          v-for="(comp, idx) in zone.gridConfig.components"
          :key="comp.id"
          class="comp-item"
        >
          <div class="comp-item-header">
            <span class="comp-index">#{{ idx + 1 }}</span>
            <a-input
              :value="comp.componentName"
              size="small"
              style="flex: 1"
              placeholder="PascalCase 名称"
              @change="(e: any) => updateGridComp(comp.id, { componentName: e.target.value })"
            />
            <a-dropdown size="small">
              <a-button type="text" size="small">⋯</a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item @click="duplicateComponent(zone.id, comp.id)">复制</a-menu-item>
                  <a-menu-divider />
                  <a-menu-item danger @click="removeComponent(zone.id, comp.id)">删除</a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </div>
          <!-- Grid 模式显示位置信息 -->
          <div v-if="zone.layoutMode === 'grid'" class="comp-item-body">
            <div class="grid-layout-grid">
              <a-input-number :value="comp.layout.x" :min="0" :step="1" size="small" addon-before="X" style="width: 50%" @change="(v: any) => updateGridCompLayout(comp.id, 'x', v)" />
              <a-input-number :value="comp.layout.y" :min="0" :step="1" size="small" addon-before="Y" style="width: 50%" @change="(v: any) => updateGridCompLayout(comp.id, 'y', v)" />
              <a-input-number :value="comp.layout.w" :min="1" :step="1" size="small" addon-before="W" style="width: 50%" @change="(v: any) => updateGridCompLayout(comp.id, 'w', v)" />
              <a-input-number :value="comp.layout.h" :min="1" :step="1" size="small" addon-before="H" style="width: 50%" @change="(v: any) => updateGridCompLayout(comp.id, 'h', v)" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 子布局列表 (contentType === 'zones') -->
    <div v-else class="prop-section">
      <div class="prop-section-title">
        <span>子布局列表</span>
        <a-button type="primary" size="small" @click="handleAddChildZone">+ 添加</a-button>
      </div>

      <div v-if="!zone.children || zone.children.length === 0" class="empty-components">
        暂无子布局，点击「添加」创建
      </div>

      <div v-else class="comp-list">
        <div
          v-for="(child, idx) in zone.children"
          :key="child.id"
          class="comp-item child-zone-item"
          @click="selectZone(child.id)"
        >
          <div class="comp-item-header">
            <span class="comp-index">{{ idx + 1 }}</span>
            <span class="child-zone-name">Z:{{ child.id.slice(-6) }}</span>
            <a-tag :bordered="false" style="font-size:10px" :color="child.layoutMode === 'grid' ? 'geekblue' : 'orange'">
              {{ child.layoutMode === 'grid' ? 'Grid' : 'Flex' }}
            </a-tag>
            <span class="child-zone-count">{{ ops.getComponentCount(child) }} 组件</span>
            <a-button
              type="text"
              size="small"
              danger
              :disabled="!ops.canDeleteZone(child)"
              @click.stop="handleRemoveChild(child.id)"
            >✕</a-button>
          </div>
        </div>
      </div>
      <p class="prop-hint" style="margin-top: 6px">
        点击子布局可在画布中选中并编辑
      </p>
    </div>

    <a-divider style="margin: 8px 0" />

    <!-- Zone 操作 -->
    <div class="prop-section">
      <a-space direction="vertical" style="width: 100%">
        <a-button block size="small" @click="$emit('duplicate', zone.id)">复制 Zone</a-button>
        <a-tooltip :title="!canDeleteZone ? '需先清空组件和子布局才能删除 Zone' : ''">
          <a-popconfirm
            title="确定删除此 Zone？"
            :disabled="!canDeleteZone"
            @confirm="$emit('remove', zone.id)"
          >
            <a-button block size="small" danger :disabled="!canDeleteZone">删除 Zone</a-button>
          </a-popconfirm>
        </a-tooltip>
      </a-space>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import type { ZoneConfig } from '@/types/screen-layout'
import { useZoneOpsContext } from './zone-context'

const props = defineProps<{
  zone: ZoneConfig
}>()

defineEmits<{
  remove: [zoneId: string]
  duplicate: [zoneId: string]
}>()

// 通过 context 获取共享的操作函数和 layoutData
const { ops, layoutData, selectZone } = useZoneOpsContext()

const componentCount = computed(() => ops.getComponentCount(props.zone))
const canDeleteZone = computed(() => ops.canDeleteZone(props.zone))

// 判断 zone 所在列是否是主体列（宽度 fr 值最大的列）
const isMainColumn = computed(() => {
  if (props.zone.colIndex < 0) return false
  const cols = layoutData.value.body.columns
  if (cols.length <= 1) return true
  const col = cols[props.zone.colIndex]
  if (!col) return false
  const colFr = parseFloat(col.width) || 0
  const maxFr = Math.max(...cols.map(c => parseFloat(c.width) || 0))
  return colFr === maxFr
})

// 非主体列的 zone 自动切换为 middle 层
watch(isMainColumn, (isMain) => {
  if (!isMain && props.zone.zIndex === 'bottom') {
    ops.switchZIndex(props.zone.id, 'middle')
  }
}, { immediate: true })

// ---- 属性更新 ----

function updateZoneProp(key: keyof ZoneConfig, value: any) {
  ops.updateZone(props.zone.id, { [key]: value } as any)
}

function updateGridCfg(patch: any) {
  const zone = ops.findZone(props.zone.id)
  if (!zone) return
  Object.assign(zone.gridConfig, patch)
}

function updateFlexCfg(patch: any) {
  const zone = ops.findZone(props.zone.id)
  if (!zone) return
  Object.assign(zone.flexConfig, patch)
}

function updateGridComp(compId: string, patch: any) {
  ops.updateGridComponent(props.zone.id, compId, patch)
}

function updateGridCompLayout(compId: string, field: string, value: any) {
  const zone = ops.findZone(props.zone.id)
  if (!zone) return
  const comp = zone.gridConfig.components.find(c => c.id === compId)
  if (comp) (comp.layout as any)[field] = value
}

/** 切换内容类型 */
function switchContentType(type: 'components' | 'zones') {
  ops.updateZone(props.zone.id, { contentType: type })
  if (type === 'zones' && !props.zone.children) {
    ops.updateZone(props.zone.id, { children: [] })
  }
}

// ---- 组件操作代理 ----

function handleAddComponent() {
  ops.addComponent(props.zone.id)
}

function handleAddChildZone() {
  const id = ops.addChildZone(props.zone.id)
  if (id) selectZone(id)
}

function handleRemoveChild(childId: string) {
  ops.removeChildZone(props.zone.id, childId)
}

// 从 useZoneOps 解构需要的操作
const { switchZIndex, addComponent, removeComponent, duplicateComponent } = ops
</script>

<style scoped lang="less">
.zone-property-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.prop-section {
  margin-bottom: 4px;

  .prop-section-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.prop-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  line-height: 1.4;
}

.padding-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.empty-components {
  text-align: center;
  padding: 16px 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.25);
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-xs);
}

.comp-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.comp-item {
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-xs);
  overflow: hidden;
  background: rgba(255, 255, 255, 0.02);

  .comp-item-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    background: rgba(255, 255, 255, 0.03);

    .comp-index {
      font-size: 10px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.3);
      min-width: 20px;
    }
  }

  .comp-item-body {
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .grid-layout-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }
}

.child-zone-item {
  cursor: pointer;
  &:hover {
    border-color: rgba(24, 144, 255, 0.3) !important;
    background: rgba(24, 144, 255, 0.04) !important;
  }

  .child-zone-name {
    flex: 1;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
    font-family: monospace;
  }

  .child-zone-count {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.3);
  }
}

// 暗色表单
:deep(.ant-form-item-label > label) {
  color: rgba(255, 255, 255, 0.55) !important;
  font-size: 11px !important;
}

:deep(.ant-input),
:deep(.ant-input-number),
:deep(.ant-select-selector) {
  background: rgba(255, 255, 255, 0.06) !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
  color: rgba(255, 255, 255, 0.85) !important;
}

:deep(.ant-input-number-input) {
  color: rgba(255, 255, 255, 0.85) !important;
}

:deep(.ant-descriptions-item-label) {
  color: rgba(255, 255, 255, 0.4) !important;
  font-size: 11px !important;
}

:deep(.ant-descriptions-item-content) {
  color: rgba(255, 255, 255, 0.7) !important;
  font-size: 12px !important;
}

:deep(.ant-radio-button-wrapper) {
  font-size: 12px;
}

:deep(.ant-divider) {
  border-color: rgba(255, 255, 255, 0.06) !important;
}
</style>
