<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <!-- Section 1: 面板标题 -->
      <SectionTitle />

      <!-- Section 2: 监测指标切换栏 -->
      <SectionTabs
        :active-tab="activeTab"
        @tab-change="handleTabChange"
      />

      <!-- Section 3: CO浓度趋势图 -->
      <SectionChart :chart-type="activeTab" />
    </div>
  </base-panel>
</template>