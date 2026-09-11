<template>
  <div class="c-device-monitor-group-robot-decor">
    <!-- 烟道机器人设备卡片：图标 + 名称 + 异常数/总数 -->
    <div
      class="c-device-monitor-group-2136637552"
      :style="{ backgroundImage: `url(${bg4})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <!-- 图标区域 -->
      <div class="c-device-monitor-icon">
        <img :src="icon4" alt="烟道机器人" class="c-device-monitor-device-icon" />
      </div>
      <!-- 名称 -->
      <div class="c-device-monitor-device-name">烟道机器人</div>
      <!-- 数值：(0/484) -->
      <div class="c-device-monitor-device-value">
        <span class="c-device-monitor-device-num-secondary">(0/484)</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// 系统自动注入 bg4, icon4，无需手写 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-group-robot-decor {
  width: 100%;
  height: 100%;
}

.c-device-monitor-group-2136637552 {
  width: 117px;
  height: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  box-sizing: border-box;
  padding: 4px 6px;
  gap: 2px;
}

.c-device-monitor-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-device-monitor-device-icon {
  width: 27px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-device-monitor-device-name {
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: calc(@fontSize * 0.857);
  font-weight: 400;
  line-height: 18px;
  color: var(--colorTextBase, #333333);
  text-align: center;
  white-space: nowrap;
  flex-shrink: 0;
}

.c-device-monitor-device-value {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-device-monitor-device-num-secondary {
  font-family: 'Roboto', sans-serif;
  font-size: calc(@fontSize * 1.143);
  font-weight: 500;
  line-height: 18.75px;
  color: var(--colorTextSecondary, #666666);
  white-space: nowrap;
}
</style>