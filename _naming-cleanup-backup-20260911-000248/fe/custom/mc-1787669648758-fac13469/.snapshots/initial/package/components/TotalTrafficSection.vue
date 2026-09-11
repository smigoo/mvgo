<template>
  <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-total-traffic">
    <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-total-traffic__header">
      <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-total-traffic__title-group">
        <img :src="diamondIcon" class="c-mc-max-1787669212260-72ba6f17-c-monitor-total-traffic__title-icon" alt="icon" />
        <span class="c-mc-max-1787669212260-72ba6f17-c-monitor-total-traffic__title-text">当日总流量</span>
      </div>
      <a-select
        v-model:value="selectedTime"
        class="c-mc-max-1787669212260-72ba6f17-c-monitor-total-traffic__time-select"
        :options="timeOptions"
        :suffix-icon="ArrowIcon"
      />
    </div>

    <div 
      class="c-mc-max-1787669212260-72ba6f17-c-monitor-total-traffic__stats-container"
      :style="{ backgroundImage: `url(${bgImage})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-mc-max-1787669212260-72ba6f17-c-monitor-total-traffic__stat-item">
        <span class="c-mc-max-1787669212260-72ba6f17-c-monitor-total-traffic__stat-label">江阴大桥</span>
        <span class="c-monitor-total-traffic__stat-value c-mc-max-1787669212260-72ba6f17-c-monitor-total-traffic__stat-value--bridge">82,379</span>
      </div>
      <div class="c-monitor-total-traffic__stat-item c-mc-max-1787669212260-72ba6f17-c-monitor-total-traffic__stat-item--right">
        <span class="c-monitor-total-traffic__stat-value c-mc-max-1787669212260-72ba6f17-c-monitor-total-traffic__stat-value--tunnel">34,620</span>
        <span class="c-mc-max-1787669212260-72ba6f17-c-monitor-total-traffic__stat-label">江阴靖江长江隧道</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, h } from 'vue'

const props = defineProps({
  bgImage: { type: String, default: '' },
  diamondIcon: { type: String, default: '' },
  selectArrow: { type: String, default: '' }
})

const selectedTime = ref('24h')
const timeOptions = [
  { value: '24h', label: '24小时' }
]

const ArrowIcon = () => h('img', { 
  src: props.selectArrow, 
  style: { width: '8px', height: '4px' } 
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-total-traffic {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  flex-shrink: 0;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 30px;
    flex-shrink: 0;
  }

  &__title-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  &__title-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  &__title-text {
    font-size: 16px;
    font-weight: 500;
    color: #333333;
    line-height: 24px;
    text-shadow: 0px 5px 5px rgba(255, 255, 255, 0.8);
  }

  &__time-select {
    width: 100px;
    height: 30px;
    
    :deep(.ant-select-selector) {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      height: 30px !important;
    }
    
    :deep(.ant-select-selection-item) {
      font-size: 14px;
      color: #333333;
      line-height: 30px !important;
    }
  }

  &__stats-container {
    width: 100%;
    height: 91px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  &__stat-item {
    display: flex;
    flex-direction: column;
    gap: 4px;

    &--right {
      align-items: flex-end;
    }
  }

  &__stat-label {
    font-size: 16px;
    font-weight: 500;
    color: #333333;
    line-height: 24px;
  }

  &__stat-value {
    font-family: 'Roboto', sans-serif;
    font-size: 24px;
    font-weight: 900;
    line-height: 28px;

    &--bridge {
      color: #0c9dbe;
    }

    &--tunnel {
      color: #006fe3;
    }
  }
}
</style>