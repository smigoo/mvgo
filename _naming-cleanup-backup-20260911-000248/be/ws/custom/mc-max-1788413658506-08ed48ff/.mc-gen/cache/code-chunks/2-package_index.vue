<template>
  <base-panel panelKey="default-panel">
    <template #header_right>
      <HeaderStats />
    </template>

    <!-- 默认插槽：主体内容区 -->
    <div class="c-monitor-body">
      <SummaryCards />
      <MainContent />
    </div>
  </base-panel>
</template>