<template>
  <div class="c-monitor-device-grid">
    <div
      v-for="device in devices"
      :key="device.id"
      class="c-monitor-device-card"
    >
      <img :src="device.icon" class="c-monitor-device-icon"/>
      <span class="c-monitor-device-name" :style="{ backgroundImage: 'url(' + bg13 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">{{ device.name }}</span>
      <span class="c-monitor-device-count" :style="{ backgroundImage: 'url(' + bg14 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">{{ device.count }}</span>
    </div>
  </div>
</template>

<script setup>
import bg14 from '../../resources/images/bg-8759.png'
import bg13 from '../../resources/images/bg-8730.png'
import bg12 from '../../resources/images/bg-8701.png'
import icon1 from '../../resources/images/icon-8798.png'
import icon2 from '../../resources/images/icon-8817.png'
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


import { ref} from 'vue'

const devices = ref([
  { id: 1, name: '摄像机', count: '(2/484)', icon: icon1 },
  { id: 2, name: '烟道机器人', count: '(0/484)', icon: icon2 },
  { id: 3, name: 'CO/VI检测器', count: '(0/484)', icon: icon3 },
  { id: 4, name: '光照度变送器', count: '(0/484)', icon: icon4 },
  { id: 5, name: '激光雷达', count: '(0/484)', icon: icon5 },
  { id: 6, name: '风速风向仪', count: '(1/484)', icon: icon6 },
  { id: 7, name: '温湿度传感器', count: '(0/484)', icon: icon7 },
  { id: 8, name: '紧急电话', count: '(0/484)', icon: icon8 },
  { id: 9, name: '超高检测器', count: '(0/484)', icon: icon9 },
  { id: 10, name: 'CO2传感器', count: '(0/484)', icon: icon10 },
  { id: 11, name: '压力传感器', count: '(0/484)', icon: icon11 },
  { id: 12, name: '水质监测设备', count: '(0/484)', icon: icon12 }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-device-grid {
height: 100%;
  width: 100%;

  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 0;
}

.c-monitor-device-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px 12px;
  position: relative;
}

.c-monitor-device-icon {
  width: 40px;
  height: 40px;
  margin-bottom: 8px;
}

.c-monitor-device-name {
  font-size: calc(var(--fontSize, 14px) * 0.857);
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.29;
  text-align: center;
  margin-bottom: 4px;
}

.c-monitor-device-count {
  font-size: calc(var(--fontSize, 14px) * 1.143);
  font-weight: 500;
  color: rgba(255, 255, 255, 1);
  line-height: 1.17;
  text-align: center;
}
</style>