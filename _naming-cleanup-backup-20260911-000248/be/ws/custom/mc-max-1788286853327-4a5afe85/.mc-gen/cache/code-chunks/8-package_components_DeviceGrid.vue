<template>
  <div class="c-monitor-device-grid">
    <div
      v-for="item in deviceList"
      :key="item.id"
      class="c-monitor-device-card"
      :style="{ backgroundImage: `url(${item.bgImage})` }"
    >
      <img :src="item.icon" class="c-monitor-device-icon" />
      <span class="c-monitor-device-label">{{ item.label }}</span>
      <div class="c-monitor-device-status">
        <span class="c-monitor-status-online">{{ item.online }}</span>
        <span class="c-monitor-status-total">/{{ item.total }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const deviceList = ref([
  { id: 1, label: '摄像机', online: 2, total: 484, icon: icon3, bgImage: bg3 },
  { id: 2, label: '风速风向仪', online: 1, total: 484, icon: icon4, bgImage: bg4 },
  { id: 3, label: '超高检测器', online: 0, total: 484, icon: icon5, bgImage: bg5 },
  { id: 4, label: '烟雾机器人', online: 0, total: 484, icon: icon6, bgImage: bg6 },
  { id: 5, label: '激光雷达', online: 0, total: 484, icon: icon7, bgImage: bg7 },
  { id: 6, label: 'CO传感器', online: 0, total: 484, icon: icon8, bgImage: bg8 },
  { id: 7, label: 'CO/VI检测器', online: 0, total: 484, icon: icon9, bgImage: bg9 },
  { id: 8, label: '温湿度传感器', online: 0, total: 484, icon: icon10, bgImage: bg10 },
  { id: 9, label: '压力传感器', online: 0, total: 484, icon: icon11, bgImage: bg11 },
  { id: 10, label: '光照度变送器', online: 0, total: 484, icon: icon12, bgImage: bg12 },
  { id: 11, label: '紧急电话', online: 0, total: 484, icon: icon13, bgImage: bg13 },
  { id: 12, label: '水质监测设备', online: 0, total: 484, icon: icon14, bgImage: bg14 }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-device-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.c-monitor-device-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 8px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  border-radius: 8px;
}

.c-monitor-device-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.c-monitor-device-label {
  font-size: calc(@fontSize * 0.857);
  color: rgba(51, 51, 51, 1);
  margin-bottom: 4px;
}

.c-monitor-device-status {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.c-monitor-status-online {
  font-size: calc(@fontSize * 1);
  font-weight: bold;
  color: rgba(25, 144, 255, 1);
}

.c-monitor-status-total {
  font-size: calc(@fontSize * 0.857);
  color: rgba(153, 153, 153, 1);
}
</style>
