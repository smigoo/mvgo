<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <HeaderSection />
    </template>
    <div class="c-6dddd6-slot-con c-mc-max-1791955962494-6dddd687" style="display:flex;flex-direction:column;">
      <ContentSection style="flex:1;min-height:0;" />
    </div>
  </base-panel>
</template>

<script setup>
import {onMounted, defineAsyncComponent} from 'vue'
import HeaderSection from './components/HeaderSection.vue'
import ContentSection from './components/ContentSection.vue'
// $mcComponentBuilder 只调用一次，直接解构（声明+赋值一体）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// 布局组件映射（当前仅默认布局）
const layouts = {}
onMounted(() => {
  runtimeBuilder.publishEvent('6dddd6-onload', {
    componentId: '6dddd6',
    timestamp: Date.now()
  })
})
import {onUnmounted} from 'vue'
// 注意：runtimeBuilder / componentProps / componentApi 已在第 1 部分解构，此处直接引用
// === 生命周期 ===
onUnmounted(() => {
  // 主组件无额外监听需要清理
})
// 说明：本批次仅生成主组件 index.vue 的第 3/3 段脚本（图表 / 数据加载 / 运行时逻辑）。
// 本组件（新增产品表单）为纯表单类组件，无 ECharts 图表、无轮询接口，
// 因此图表初始化函数与数据加载函数为空实现（供生命周期钩子安全调用）。
// import 与 ref/reactive/computed 定义已在第 1 段声明；onMounted/onUnmounted 已在第 2 段注册。
// 此处不重复 import，不重复调用 $mcComponentBuilder()。
// === 图表初始化（纯表单组件，无图表） ===
const initCharts = () => {
  // 本组件不含 ECharts 图表，无需初始化
}
// === 图表重绘（窗口尺寸变化时由外部调用） ===
const resizeCharts = () => {
  // 本组件不含 ECharts 图表，无需重绘
}
// === 图表销毁（组件卸载时由外部调用） ===
const disposeCharts = () => {
  // 本组件不含 ECharts 图表，无需销毁
}
// === 数据加载（当前为非受控表单，静态渲染，无远程数据源） ===
const loadData = async () => {
  // 表单为静态渲染，数据提交依赖 componentApi（在子组件表单提交处调用）
  // 此处保留空实现，确保生命周期钩子调用安全
}
// === 导出供第 2 段生命周期钩子引用 ===
defineExpose({
  initCharts,
  resizeCharts,
  disposeCharts,
  loadData
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>
