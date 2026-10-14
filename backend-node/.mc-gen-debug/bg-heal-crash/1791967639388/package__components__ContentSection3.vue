<template>
  <div data-section-id="48:5816" class="c-aiot-dpjh-bsjd-group-2136638414">
    <div class="c-aiot-dpjh-bsjd-group-2136638414-item">
      <div class="c-aiot-dpjh-bsjd-icon">
        <img :src="icon5" class="c-aiot-dpjh-bsjd-icon-img" alt="节点图标" style="width:40px;height:40px;object-fit:contain" />
        <span class="c-aiot-dpjh-bsjd-icon-dot"></span>
      </div>
      <div class="c-aiot-dpjh-bsjd-group-2136638414-info">
        <div class="c-aiot-dpjh-bsjd-group-2136638414-title">江苏沿江公司节点</div>
        <div class="c-aiot-dpjh-bsjd-group-2136638414-addr">江苏省南京市建邺区江东中路</div>
      </div>
      <div class="c-aiot-dpjh-bsjd-group-2136638414-stats">
        <div class="c-aiot-dpjh-bsjd-stat-online-stat"><span class="c-aiot-dpjh-bsjd-stat-online-value">2,138</span>
        <span class="c-aiot-dpjh-bsjd-stat-label">在线</span></div><div class="c-aiot-dpjh-bsjd-stat-online-stat"><span class="c-aiot-dpjh-bsjd-stat-offline-value">12</span>
        <span class="c-aiot-dpjh-bsjd-stat-label">离线</span></div>
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

.c-aiot-dpjh-bsjd-group-2136638414 {  display: flex;
  flex-direction: row;
  width: 100%;

  flex: 1 1 0;
  min-height: 0;
}

.c-aiot-dpjh-bsjd-group-2136638414-item {
  flex: 1 1 0;
  min-height: 0;
}

.c-aiot-dpjh-bsjd-icon-img {
  object-fit: contain;
}

.c-aiot-dpjh-bsjd-icon-dot {
  border-radius: 50%;
  background: @color-error;
}

.c-aiot-dpjh-bsjd-group-2136638414-info {
  min-width: 0;
}

.c-aiot-dpjh-bsjd-group-2136638414-title {
  font-size: calc(var(--fontSize, 14px) * 1.286);
  font-weight: @fontWeightStrong;
  color: @color-text-base;
  line-height: 1.2;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.c-aiot-dpjh-bsjd-group-2136638414-addr {
  font-size: @fontSize;
  font-weight: normal;
  color: @color-text-secondary;
  line-height: 1.2;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.c-aiot-dpjh-bsjd-stat-online-value {
  font-size: calc(var(--fontSize, 14px) * 1.286);
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