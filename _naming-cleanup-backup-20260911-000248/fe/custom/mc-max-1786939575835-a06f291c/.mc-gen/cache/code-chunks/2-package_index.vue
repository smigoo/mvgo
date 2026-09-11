<template>
  <base-panel panelKey="default-panel">
    <div class="c-device-monitor-root">
      <DeviceSummaryCards class="c-device-monitor-summary" />
      <div class="c-device-monitor-main">
        <div class="c-device-monitor-trend-section">
          <DeviceTrendChart />
        </div>
        <div class="c-device-monitor-type-section">
          <DeviceTypeChart />
        </div>
      </div>
      <DeviceStatusTable class="c-device-monitor-status" />
    </div>
  </base-panel>
</template>
```