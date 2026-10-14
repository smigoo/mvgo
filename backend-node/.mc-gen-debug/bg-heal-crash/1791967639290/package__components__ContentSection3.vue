<template>
  <div class="c-aiot-dpjh-bsjd-group-2136638414">
    <div class="c-aiot-dpjh-bsjd-group-2136638414-item">
      <div class="c-aiot-dpjh-bsjd-icon">
        <img :src="icon5" class="c-aiot-dpjh-bsjd-icon-img" alt="节点图标" />
        <span class="c-aiot-dpjh-bsjd-icon-dot"></span>
      </div>
      <div class="c-aiot-dpjh-bsjd-group-2136638414-info">
        <div class="c-aiot-dpjh-bsjd-group-2136638414-title">江苏沿江公司节点</div>
        <div class="c-aiot-dpjh-bsjd-group-2136638414-addr">江苏省南京市建邺区江东中路</div>
      </div>
      <div class="c-aiot-dpjh-bsjd-group-2136638414-stats">
        <span class="c-aiot-dpjh-bsjd-stat-online-value">2,138</span>
        <span class="c-aiot-dpjh-bsjd-stat-label">在线</span>
        <span class="c-aiot-dpjh-bsjd-stat-offline-value">12</span>
        <span class="c-aiot-dpjh-bsjd-stat-label">离线</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon5 from '../../resources/images/icon-5823.png'


// 资源变量由系统自动注入，无需 import
</script>

<style lang="less" scoped>
@fontWeightStrong: 400;

@import '../../resources/styles/index.less';

.c-aiot-dpjh-bsjd-group-2136638414 {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.c-aiot-dpjh-bsjd-group-2136638414-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  padding: 0 12px;
}

.c-aiot-dpjh-bsjd-icon {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.c-aiot-dpjh-bsjd-icon-img {
  width: 40px;
  height: 40px;
  object-fit: contain;
  display: block;
}

.c-aiot-dpjh-bsjd-icon-dot {
  position: absolute;
  right: 0;
  top: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: @color-error;
}

.c-aiot-dpjh-bsjd-group-2136638414-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.c-aiot-dpjh-bsjd-group-2136638414-title {
  font-size: calc(@fontSize * 1.286);
  font-weight: @fontWeightStrong;
  color: @color-text-base;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-aiot-dpjh-bsjd-group-2136638414-addr {
  font-size: @fontSize;
  font-weight: normal;
  color: @color-text-secondary;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.c-aiot-dpjh-bsjd-group-2136638414-stats {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 6px;
  flex-shrink: 0;
}

.c-aiot-dpjh-bsjd-stat-online-value {
  font-size: calc(@fontSize * 1.286);
  font-weight: @fontWeightStrong;
  color: @color-success;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.c-aiot-dpjh-bsjd-stat-offline-value {
  font-size: @fontSize;
  font-weight: @fontWeightStrong;
  color: @color-error;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.c-aiot-dpjh-bsjd-stat-label {
  font-size: @fontSize;
  font-weight: normal;
  color: @color-text-secondary;
  line-height: 1.2;
}
</style>