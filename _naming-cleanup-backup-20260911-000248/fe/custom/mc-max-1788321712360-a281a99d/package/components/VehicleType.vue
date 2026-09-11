<template>
  <div class="c-monitor-vehicle-type">
    <div class="c-monitor-vehicle-type-header">
      <img :src="icon2" class="c-monitor-vehicle-type-icon" />
      <span class="c-monitor-vehicle-type-title">车型分布</span>
    </div>
    <div class="c-monitor-vehicle-type-body">
      <div class="c-monitor-vehicle-group" :style="{ backgroundImage: 'url(' + bg2 + ')' }">
        <div class="c-monitor-vehicle-group-title">江阴靖江长江隧道</div>
        <div class="c-monitor-vehicle-items">
          <div class="c-monitor-vehicle-item">
            <span class="c-monitor-vehicle-label">客车</span>
            <span class="c-monitor-vehicle-value c-monitor-vehicle-value--blue">22350</span>
          </div>
          <div class="c-monitor-vehicle-item">
            <span class="c-monitor-vehicle-label">货车</span>
            <span class="c-monitor-vehicle-value c-monitor-vehicle-value--orange">16270</span>
          </div>
        </div>
      </div>
      <div class="c-monitor-vehicle-group" :style="{ backgroundImage: 'url(' + bg4 + ')' }">
        <div class="c-monitor-vehicle-group-title">江阴大桥</div>
        <div class="c-monitor-vehicle-items">
          <div class="c-monitor-vehicle-item">
            <span class="c-monitor-vehicle-label">客车</span>
            <span class="c-monitor-vehicle-value c-monitor-vehicle-value--blue">66109</span>
          </div>
          <div class="c-monitor-vehicle-item">
            <span class="c-monitor-vehicle-label">货车</span>
            <span class="c-monitor-vehicle-value c-monitor-vehicle-value--orange">16270</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-3561.png'
import bg2 from '../../resources/images/bg-_m-36.png'
import bg4 from '../../resources/images/bg-_m-35.png'


</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-vehicle-type {
  width: 100%;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.c-monitor-vehicle-type-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-monitor-vehicle-type-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.c-monitor-vehicle-type-title {
  font-size: calc(var(--fontSize, 14px) * 1.14);
  color: #333333;
  font-weight: 500;
  line-height: 1.5;
}

.c-monitor-vehicle-type-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}

.c-monitor-vehicle-group {
  flex: 1;
  min-width: 0;
  min-height: 0;
  background-size: 100% auto;
  background-position: center top;
  background-repeat: no-repeat;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px;
  box-sizing: border-box;
}

.c-monitor-vehicle-group-title {
  font-size: calc(var(--fontSize, 14px) * 1);
  color: #333333;
  font-weight: 500;
  margin-bottom: 8px;
}

.c-monitor-vehicle-items {
  display: flex;
  gap: 24px;
}

.c-monitor-vehicle-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.c-monitor-vehicle-label {
  font-size: calc(var(--fontSize, 14px) * 0.85);
  color: #666666;
}

.c-monitor-vehicle-value {
  font-size: calc(var(--fontSize, 14px) * 1.43);
  font-weight: bold;
  
  &--blue {
    color: #1990ff;
  }
  
  &--orange {
    color: #fa8c16;
  }
}
</style>