<template>
  <div data-section-id="48:5816" class="c-aiot-dpjh-bsjd-group-2136638416">
    <div class="c-aiot-dpjh-bsjd-group-2136638414">
      <div class="c-aiot-dpjh-bsjd-icon">
        <img :src="icon5" class="c-aiot-dpjh-bsjd-icon-img" alt="" style="width:40px;height:40px;object-fit:contain" />
      </div>
      <div class="c-aiot-dpjh-bsjd-node-info">
        <span class="c-aiot-dpjh-bsjd-node-name">{{ nodeData.name }}</span>
        <span class="c-aiot-dpjh-bsjd-node-address">{{ nodeData.address }}</span>
        <span class="c-aiot-dpjh-bsjd-node-online">
          <span class="c-aiot-dpjh-bsjd-node-online-value">{{ nodeData.online }}</span>
          <span class="c-aiot-dpjh-bsjd-node-online-label">在线</span>
        </span>
        <span class="c-aiot-dpjh-bsjd-node-offline">
          <span class="c-aiot-dpjh-bsjd-node-offline-value">{{ nodeData.offline }}</span>
          <span class="c-aiot-dpjh-bsjd-node-offline-label">离线</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon5 from '../../resources/images/icon-5823.png'

const nodeData = {
  name: '江苏沿江公司节点',
  address: '江苏省南京市建邺区江东中路',
  online: '2,138',
  offline: '12'
}
</script>

<style lang="less" scoped>
@fontWeightStrong: 400;

@import '../../resources/styles/index.less';

.c-aiot-dpjh-bsjd-group-2136638416 {  display: flex;
  flex-direction: row;

  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.c-aiot-dpjh-bsjd-group-2136638414 {  display: flex;
  flex-direction: row;

  align-items: center;
  flex: 1 1 0;
}

.c-aiot-dpjh-bsjd-icon-img {
  flex-shrink: 0;
}

.c-aiot-dpjh-bsjd-node-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  margin-left: 12px;
  min-height: 0; /* VERT-004: 防 column flex 容器高度计算异常 */
}

.c-aiot-dpjh-bsjd-node-address {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: @color-text-secondary;
  line-height: 14px;
  white-space: nowrap;
  flex-shrink: 0;
  order: 1;
  display: flex;}

.c-aiot-dpjh-bsjd-node-name {
  font-size: calc(var(--fontSize, 14px) * 1.286);
  color: @color-text-base;
  font-weight: @fontWeightStrong;
  line-height: 18px;
  white-space: nowrap;
  flex-shrink: 0;
  order: 2;
}

.c-aiot-dpjh-bsjd-node-online {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 4px;
  flex-shrink: 0;
  order: 3;
}

.c-aiot-dpjh-bsjd-node-online-value {
  font-size: calc(var(--fontSize, 14px) * 1.286);
  color: @color-success;
  font-weight: @fontWeightStrong;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
}

.c-aiot-dpjh-bsjd-node-online-label {
  font-size: @fontSize;
  color: @color-text-secondary;
  line-height: 14px;
  white-space: nowrap;
}

.c-aiot-dpjh-bsjd-node-offline {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 4px;
  flex-shrink: 0;
  order: 4;
}

.c-aiot-dpjh-bsjd-node-offline-value {
  font-size: calc(var(--fontSize, 14px) * 1.286);
  color: @color-error;
  font-weight: @fontWeightStrong;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
}

.c-aiot-dpjh-bsjd-node-offline-label {
  font-size: @fontSize;
  color: @color-text-secondary;
  line-height: 14px;
  white-space: nowrap;
}
</style>