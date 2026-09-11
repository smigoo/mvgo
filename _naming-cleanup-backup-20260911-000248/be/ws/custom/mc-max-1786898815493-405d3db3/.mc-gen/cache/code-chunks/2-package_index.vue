<template>
  <base-panel panelKey="default-panel">
    <div
      class="c-env-monitor-root"
      :style="{
        backgroundImage: `url(${bg3})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat'
      }"
    >
      <EnvironmentTabs
        :tabs="tabList"
        :active-tab="activeTab"
        :active-background="bgtabActive"
        :tab-icon="icontabsIcon"
        @tab-change="handleTabChange"
      />
      <MetricCards
        :cards="metricCards"
        :icon1="icon1"
        :icon2="icon2"
      />
      <TrendChart
        :chart-data="trendData"
        :loading="chartLoading"
      />
    </div>
  </base-panel>
</template>
```