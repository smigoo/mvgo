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
import {onMounted, onUnmounted} from 'vue'

import HeaderSection from './components/HeaderSection.vue'

import ContentSection from './components/ContentSection.vue'

// $mcComponentBuilder：只能调用一次，直接解构（声明+赋值一体，杜绝 TDZ）

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 组件配置（供子组件使用）

const config = {
  componentId: '6dddd6'
}

// 触发 onload 事件

const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('6dddd6-onload', {
    componentId: '6dddd6',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})

onUnmounted(() => {
  // 本组件未注册 listenEvent，无需 removeListener
})

// 上一次生成的第 1 部分已声明：

// componentProps / businessProps / runtimeBuilder / componentApi

/** 触发组件加载完成事件（对应 declare.json businessEvents） */

function emitComponentOnload() {
  runtimeBuilder.publishEvent('6dddd6-onload', {
    componentId: '6dddd6',
    timestamp: Date.now()
  })
}

/** 关闭面板（头部关闭图标点击） */

// ============================================================

// 图表初始化与数据加载（第 3/3 段）

// 本组件为「新增产品」表单面板，无 ECharts 图表。

// 故此段仅保留表单提交/取消的运行时逻辑，供第 2 段 onMounted 调用。

/**

* 表单数据（与子组件共享的提交载荷）

*/

const formData = reactive({
  productImage: '',
  productCode: '',
  productName: '',
  productModel: '',
  productVendor: '',
  shadowTime: '5',
  heartbeatPeriod: '1',
  category: '通信类/情报板',
  organization: '',
  certified: '否',
  linkType: '直连设备',
  description: ''
})

* 保存表单数据

* 当前无后端数据源（declare.json 未配置 dataSources），

* 仅发布业务事件，由平台编排后续处理。

const handleSave = () => {
  try {
    runtimeBuilder.publishEvent('6dddd6-save', {
      componentId: '6dddd6',
      payload: { ...formData },
      timestamp: Date.now()
    })
  } catch (err) {
    console.warn('[新增产品] 发布保存事件失败:', err)
  }
}

* 取消操作

const handleCancel = () => {
  try {
    runtimeBuilder.publishEvent('6dddd6-cancel', {
      componentId: '6dddd6',
      timestamp: Date.now()
    })
  } catch (err) {
    console.warn('[新增产品] 发布取消事件失败:', err)
  }
}

* 关闭面板

const handleClose = () => {
  try {
    runtimeBuilder.publishEvent('6dddd6-close', {
      componentId: '6dddd6',
      timestamp: Date.now()
    })
  } catch (err) {
    console.warn('[新增产品] 发布关闭事件失败:', err)
  }
}

* 初始化图表（本组件无图表，保留空实现以兼容父级调用约定）

const initCharts = () => {
  // 表单面板无 ECharts 实例，无需初始化
}

* 数据加载（本组件无远程数据源，保留空实现以兼容父级调用约定）

const loadData = () => {
  // 无 dataSources 配置，使用本地默认值渲染
}
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
