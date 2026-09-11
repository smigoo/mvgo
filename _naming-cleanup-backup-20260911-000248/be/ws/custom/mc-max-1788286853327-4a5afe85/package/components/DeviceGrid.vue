<template>
  <div class="c-monitor-device-grid">
    <div
      v-for="(device, index) in devices"
      :key="index"
      class="c-monitor-device-card"
    >
      <img :src="device.icon" class="c-monitor-device-icon" alt="" />
      <div class="c-monitor-device-label">{{ device.label }}</div>
      <div class="c-monitor-device-status">
        <span class="c-monitor-device-status-online">{{ device.online }}</span>
        <span class="c-monitor-device-status-total">/{{ device.total }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg14 from '../../resources/images/bg-8439.png'
import icon3 from '../../resources/images/icon-8444.png'
import icon4 from '../../resources/images/icon-8473.png'
import icon5 from '../../resources/images/icon-8503.png'
import icon6 from '../../resources/images/icon-8532.png'
import icon7 from '../../resources/images/icon-8561.png'
import icon8 from '../../resources/images/icon-8590.png'
import icon9 from '../../resources/images/icon-8619.png'
import icon10 from '../../resources/images/icon-8648.png'
import icon11 from '../../resources/images/icon-8677.png'
import icon12 from '../../resources/images/icon-8706.png'
import icon13 from '../../resources/images/icon-8735.png'
import icon14 from '../../resources/images/icon-8764.png'


const devices = ref([
  { label: '摄像机', online: 2, total: 484, icon: icon3 },
  { label: '风速风向仪', online: 1, total: 484, icon: icon4 },
  { label: '超高检测器', online: 0, total: 484, icon: icon5 },
  { label: '烟雾机器人', online: 0, total: 484, icon: icon6 },
  { label: '激光雷达', online: 0, total: 484, icon: icon7 },
  { label: 'CO传感器', online: 0, total: 484, icon: icon8 },
  { label: 'CO/VI检测器', online: 0, total: 484, icon: icon9 },
  { label: '温湿度传感器', online: 0, total: 484, icon: icon10 },
  { label: '压力传感器', online: 0, total: 484, icon: icon11 },
  { label: '光照度变送器', online: 0, total: 484, icon: icon12 },
  { label: '紧急电话', online: 0, total: 484, icon: icon13 },
  { label: '水质监测设备', online: 0, total: 484, icon: icon14 }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-device-grid {
width: 100%;

  flex: 295 1 0;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 0;
}

.c-monitor-device-card {
  width: 100%;
  height: 80px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-sizing: border-box;
}

.c-monitor-device-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.c-monitor-device-label {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: rgba(51, 51, 51, 1);
  font-weight: normal;
  line-height: 1.5;
  text-align: center;
}

.c-monitor-device-status {
  display: flex;
  align-items: baseline;
  gap: 0;
}

.c-monitor-device-status-online {
  font-size: calc(var(--fontSize, 14px) * 1);
  color: rgba(25, 144, 255, 1);
  font-weight: bold;
  line-height: 1.17;
}

.c-monitor-device-status-total {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: rgba(153, 153, 153, 1);
  font-weight: normal;
  line-height: 1.17;
}
</style>