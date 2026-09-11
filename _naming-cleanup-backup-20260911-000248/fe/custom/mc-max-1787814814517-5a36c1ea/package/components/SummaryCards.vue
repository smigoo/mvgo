<template>
  <div class="c-mc-max-1787814814517-5a36c1ea-c-monitor-summary-cards">
    <div class="c-monitor-summary-card c-mc-max-1787814814517-5a36c1ea-c-monitor-summary-card--tunnel">
      <img :src="icon10" class="c-mc-max-1787814814517-5a36c1ea-c-monitor-summary-card-icon" alt="隧道设备图标" />
      <div class="c-mc-max-1787814814517-5a36c1ea-c-monitor-summary-card-content">
        <span class="c-mc-max-1787814814517-5a36c1ea-c-monitor-summary-card-total">总数:56302</span>
        <span class="c-mc-max-1787814814517-5a36c1ea-c-monitor-summary-card-anomaly">异常数:5</span>
      </div>
    </div>
    <div class="c-monitor-summary-card c-mc-max-1787814814517-5a36c1ea-c-monitor-summary-card--connection">
      <img :src="icon16" class="c-mc-max-1787814814517-5a36c1ea-c-monitor-summary-card-icon" alt="南北接线设备图标" />
      <div class="c-mc-max-1787814814517-5a36c1ea-c-monitor-summary-card-content">
        <span class="c-mc-max-1787814814517-5a36c1ea-c-monitor-summary-card-total">总数:1280</span>
        <span class="c-mc-max-1787814814517-5a36c1ea-c-monitor-summary-card-anomaly">异常数:3</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon10 from '../../resources/images/隧道_1-8804.png'
import icon16 from '../../resources/images/extension-cord_1-8823.png'

// 资源变量 icon10、icon16 由系统自动注入，无需 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-summary-cards {
  display: flex;
  gap: 12px;
  width: 100%;
}

.c-monitor-summary-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 8px;
  box-sizing: border-box;
  min-width: 0;
}

.c-monitor-summary-card--tunnel {
  background: linear-gradient(270deg, #318aff 0%, #70bfff 100%);
}

.c-monitor-summary-card--connection {
  background: rgba(255, 255, 255, 0.6);
}

.c-monitor-summary-card-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  object-fit: contain;
}

.c-monitor-summary-card-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
  min-height: 0;}

.c-monitor-summary-card-total {
  font-size: 20px;
  font-weight: bold;
  line-height: 1.2;
  white-space: nowrap;
}

.c-monitor-summary-card--tunnel .c-monitor-summary-card-total {
  color: #ffffff;
}

.c-monitor-summary-card--connection .c-monitor-summary-card-total {
  color: rgba(25, 144, 255, 1);
}

.c-monitor-summary-card-anomaly {
  font-size: 14px;
  color: #f53f3f;
  white-space: nowrap;
}
</style>