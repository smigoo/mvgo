<template>
  <base-panel panelKey="default-panel">
    <!-- [Layout Refine] Figma cp-环境监测 整体垂直布局 -->
    <div class="c-ff0ff1-container">
      <!-- [Layout Refine] Figma header 区域 -->
      <div class="c-ff0ff1-header">
        <span class="c-ff0ff1-title">环境监测</span>
      </div>

      <!-- [Layout Refine] Figma slot-con 区域，包含 sub-t 和 chart -->
      <div class="c-ff0ff1-slot-con">
        <!-- 监测指标切换 (sub-t) -->
        <div class="c-ff0ff1-metrics-section">
          <EnvMetrics />
        </div>

        <!-- 环境趋势图表区域 (@echarts/line) -->
        <div class="c-ff0ff1-trend-section">
          <EnvTrend />
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import EnvMetrics from './components/EnvMetrics.vue'
import EnvTrend from './components/EnvTrend.vue'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[ff0ff1] $mcComponentBuilder 初始化失败:', e)
}

// --- 生命周期 ---
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('ff0ff1-onload', {
      componentId: 'ff0ff1',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理监听和定时器
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>