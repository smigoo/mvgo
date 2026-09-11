<template>
  <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-cards">
    <!-- 隧道设备卡片 -->
    <div class="c-monitor-summary-card c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-card--tunnel">
      <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-icon">
        <img :src="icon10" class="c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-icon-img" alt="隧道设备图标" />
      </div>
      <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-info">
        <div class="c-monitor-summary-title c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-title--tunnel">隧道设备</div>
        <div class="c-monitor-summary-line c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line--tunnel">
          <span class="c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-label c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-label--tunnel">总数:</span>
          <span class="c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-value c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-value--tunnel">56302</span>
        </div>
        <div class="c-monitor-summary-line c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line--tunnel">
          <span class="c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-label c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-label--tunnel">异常数:</span>
          <span class="c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-value c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-value--error">5</span>
        </div>
      </div>
    </div>

    <!-- 南北接线设备卡片 -->
    <div class="c-monitor-summary-card c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-card--connection">
      <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-icon">
        <img :src="icon16" class="c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-icon-img" alt="南北接线设备图标" />
      </div>
      <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-info">
        <div class="c-monitor-summary-title c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-title--connection">南北接线 / 设备</div>
        <div class="c-monitor-summary-line c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line--connection">
          <span class="c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-label c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-label--connection">总数:</span>
          <span class="c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-value c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-value--connection">1280</span>
        </div>
        <div class="c-monitor-summary-line c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line--connection">
          <span class="c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-label c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-label--connection">异常数:</span>
          <span class="c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-value c-mc-max-1787812418444-fd7e9caf-c-monitor-summary-line-value--error">3</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon10 from '../../resources/images/隧道_1-8804.png'
import icon16 from '../../resources/images/extension-cord_1-8823.png'

// 资源变量由系统自动注入，不可自行编写 import 语句
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* ===== 主要设备统计卡片区 ===== */
.c-monitor-summary-cards {  width: 100%;

  display: flex;
  flex-direction: row;
  gap: 12px;
  flex-shrink: 0;
}

.c-monitor-summary-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: 8px;

  /* 隧道设备卡片：蓝色渐变背景 */
  &--tunnel {
    background: linear-gradient(270deg, #318aff 0%, #70bfff 100%);
  }

  /* 南北接线设备卡片：浅蓝背景 */
  &--connection {
    background: #93ccff;
  }
}

.c-monitor-summary-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-monitor-summary-icon-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.c-monitor-summary-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
  min-height: 0;}

.c-monitor-summary-title {
  /* 标题字体 */
  font-family: 'YouSheBiaoTiHei', 'Source Han Sans CN', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 15.6px;
  text-align: left;
  white-space: nowrap;

  &--tunnel {
    color: #ffffff;
  }

  &--connection {
    color: #333333;
    text-align: center;
  }
}

.c-monitor-summary-line {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1px;
  line-height: 23px;
}

.c-monitor-summary-line-label {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  text-align: left;
  white-space: nowrap;

  &--tunnel {
    color: #ffffff;
  }

  &--connection {
    color: #333333;
  }
}

.c-monitor-summary-line-value {
  font-family: 'Roboto', sans-serif;
  font-size: 20px;
  font-weight: 700;
  line-height: 23.4px;
  text-align: left;
  white-space: nowrap;

  &--tunnel {
    color: #ffffff;
  }

  &--connection {
    color: #1990ff;
  }

  &--error {
    color: #e03434;
  }
}
</style>