<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <HeaderStats />
    </template>

    <div class="c-c-monitor-root">
      <CategoryTabs class="c-c-monitor-category" />
      <DeviceGrid class="c-c-monitor-grid" />
    </div>
  </base-panel>
</template>