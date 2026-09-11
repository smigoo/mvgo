<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <HeaderStats />
    </template>
    
    <div class="c-c-monitor-body">
      <SummaryCards />
      <div class="c-c-monitor-list-wrapper">
        <Nav />
        <DeviceListArea />
      </div>
    </div>
  </base-panel>
</template>