<template>
  <base-panel panelKey="default-panel">
    <template #title_left>
      <SectionHeader />
    </template>

    <div class="c-env-monitor-root">
      <TabsTools />
      <ConcentrationChart />
    </div>
  </base-panel>
</template>