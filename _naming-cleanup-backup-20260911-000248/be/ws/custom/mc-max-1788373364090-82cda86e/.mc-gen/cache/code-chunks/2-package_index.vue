<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <HeaderStats />
    </template>

    <div class="c-monitor-root">
      <div class="c-monitor-body">
        <SummaryCards />
        <TabAndContent />
      </div>
    </div>
  </base-panel>
</template>
