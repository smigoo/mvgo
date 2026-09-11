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
      <EnvStatsOverview
        class="c-env-monitor-stats"
        :point-icon="icon1"
        :alarm-icon="icon2"
        :point-count="pointCount"
        :alarm-count="alarmCount"
      />

      <EnvMonitorTabs
        class="c-env-monitor-tabs"
        :tabs="monitorTabs"
        :active-tab="activeTab"
        :active-bg="bgtabActive"
        :tab-icon="icontabsIcon"
        @tab-change="handleTabChange"
      />

      <EnvMonitorChart
        class="c-env-monitor-chart"
        :active-tab="activeTab"
      />
    </div>
  </base-panel>
</template>