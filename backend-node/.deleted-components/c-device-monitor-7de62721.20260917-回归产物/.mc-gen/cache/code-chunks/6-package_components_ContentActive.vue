<template>
  <div class="c-device-monitor-active">
    <!-- 设备图标 -->
    <div class="c-device-monitor-active-icon">
      <img :src="icon4" alt="隧道设备图标" />
    </div>

    <!-- 设备信息区 -->
    <div class="c-device-monitor-active-info">
      <div class="c-device-monitor-active-title">隧道设备</div>
      
      <div class="c-device-monitor-active-stats">
        <div class="c-device-monitor-active-stat-item">
          <span class="c-device-monitor-active-label">总数:</span>
          <span class="c-device-monitor-active-value">56302</span>
        </div>
        
        <div class="c-device-monitor-active-stat-item">
          <span class="c-device-monitor-active-label">异常数:</span>
          <span class="c-device-monitor-active-value c-device-monitor-active-value-error">5</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 资源变量由系统注入，无需 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-device-monitor-active {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background-image: url('@{bg2}');
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  border-radius: 6px;
  position: relative;
  overflow: hidden;
}

.c-device-monitor-active-icon {
  flex-shrink: 0;
  width: 35px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.c-device-monitor-active-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.c-device-monitor-active-title {
  font-size: 12px;
  color: #ffffff;
  line-height: 16px;
  white-space: nowrap;
}

.c-device-monitor-active-stats {
  display: flex;
  gap: 16px;
}

.c-device-monitor-active-stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.c-device-monitor-active-label {
  font-size: 14px;
  color: #ffffff;
  line-height: 21px;
  white-space: nowrap;
}

.c-device-monitor-active-value {
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
  line-height: 23px;
}

.c-device-monitor-active-value-error {
  color: #e03434;
}
</style>