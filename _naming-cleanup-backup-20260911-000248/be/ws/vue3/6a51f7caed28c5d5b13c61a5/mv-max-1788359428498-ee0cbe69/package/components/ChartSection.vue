<template>
  <!-- 图表区域：包含图表顶部信息和面积图，背景使用 Figma 指定的背景图 -->
  <div class="chart-section">
    <!-- 图表顶部信息子组件 -->
    <ChartHeader :active-tab="activeTab" />
    <!-- 面积图子组件 -->
    <AreaChart :chart-data="chartData" :active-tab="activeTab" />
  </div>
</template>