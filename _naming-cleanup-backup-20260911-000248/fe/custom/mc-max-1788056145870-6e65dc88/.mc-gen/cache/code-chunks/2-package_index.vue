<template>
  <base-panel panelKey="default-panel">
    <!-- 右上角控制按钮：图表类型切换 + 通知角标（放入标题栏右侧插槽） -->
    <template #header_right>
      <HeaderControls />
    </template>

    <!-- 组件主体内容 -->
    <div class="c-env-monitor-root">
      <!-- Tab 切换栏：一氧化碳 / 能见度 / 洞内照明 / 洞外光强 -->
      <EnvTabBar />

      <!-- 图表区域：CO 浓度面积图 -->
      <ChartSection />
    </div>
  </base-panel>
</template>