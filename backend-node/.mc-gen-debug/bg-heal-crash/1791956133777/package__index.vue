<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <HeaderSection />
    </template>
    <div class="c-6dddd6-slot-con" style="display:flex;flex-direction:column;">
      <ContentSection style="flex:1;min-height:0;" />
    </div>
  </base-panel>
</template>

<script setup>
// 主组件入口：仅负责子组件组合与 onload 事件触发

// 子组件自身逻辑（表单字段、上传区等）各自在其文件内维护

import {onMounted} from 'vue'

import HeaderSection from './components/HeaderSection.vue'

import ContentSection from './components/ContentSection.vue'

// $mcComponentBuilder 仅调用一次，直接解构（声明+赋值一体，避免 TDZ）

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 组件 id（与 declare.json / 事件名保持一致）

const COMPONENT_ID = '6dddd6'

// 触发 onload 业务事件

const emitOnload = () => {
  runtimeBuilder.publishEvent(`${COMPONENT_ID}-onload`, {
    componentId: COMPONENT_ID,
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitOnload()
})

import {onUnmounted} from 'vue'

// 组件加载完成事件（供微码平台编排使用）

const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('6dddd6-onload', {
    componentId: '6dddd6',
    timestamp: Date.now()
  })
}

// 关闭当前弹窗/面板（头部关闭图标）

const handleClose = () => {
  runtimeBuilder.publishEvent('6dddd6-close', {
    componentId: '6dddd6',
    timestamp: Date.now()
  })
}

let loadTimer = null

onUnmounted(() => {
  if (loadTimer) {
    clearTimeout(loadTimer)
    loadTimer = null
  }
})

/**

* 图表与数据加载段（第 3/3 段）

* 主组件为纯表单面板（新增产品），template 中不存在任何图表容器，

* 因此本段不生成 echarts 初始化逻辑，仅保留最小占位（供第 2 部分调用）。

* 图表/表单的交互状态与逻辑均归属于子组件（HeaderSection / ContentSection）。

*/

* 图表初始化占位函数

* 说明：当前设计稿为表单类面板，无任何图表节点（charts 为空数组），

* 故此处不执行 echarts.init / ResizeObserver 等逻辑。

* 保留空函数是为了让 onMounted 的调用链保持一致，后续若新增图表可在子组件内实现。

const initCharts = () => {
  // 无图表：空实现（禁止臆造图表容器与数据）
}

* 数据加载占位函数

* 说明：表单数据由用户输入 / 由子组件内部维护，

* 主组件不主动拉取列表数据（declare.json 中无 dataSources）。

const loadData = () => {
  // 无远程数据源：空实现
}

// 暴露给第 2 部分（onMounted 回调）使用

defineExpose({
  initCharts,
  loadData
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
