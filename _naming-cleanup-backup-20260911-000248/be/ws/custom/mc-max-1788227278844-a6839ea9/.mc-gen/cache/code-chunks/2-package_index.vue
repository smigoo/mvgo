<template>
  <base-panel panelKey="default-panel">
    <div class="c-env-monitor-root">
      <SectionTabs
        class="c-env-monitor-tabs"
        :icon-tabs="icontabsIcon"
        :icon1="icon1"
        :icon2="icon2"
        :bg-tab-active="bgtabActive"
      />
      <SectionChart class="c-env-monitor-chart-section" />
    </div>
  </base-panel>
</template>
