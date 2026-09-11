<template>
  <div class="c-monitor-device-grid">
    <div 
      v-for="(device, index) in devices" 
      :key="index"
      class="c-monitor-device-item"
      :style="{ backgroundImage: `url(${deviceBgs[index]})` }"
    >
      <img :src="deviceIcons[index]" class="c-monitor-device-icon" :alt="device.name" />
      <div class="c-monitor-device-name">{{ device.name }}</div>
      <div class="c-monitor-device-count">
        <span :class="['c-monitor-device-count-value', device.error > 0 ? 'c-monitor-device-count-value--danger' : '']">
          {{ device.error }}
        </span>
        <span class="c-monitor-device-count-total" :style="{ backgroundImage: 'url(' + bg12 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">/{{ device.total }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg12 from '../../resources/images/bg-8439.png'
import icon3 from '../../resources/images/icon-8444.png'
import icon14 from '../../resources/images/icon-8764.png'

import { ref} from 'vue'

const devices = ref([
  { name: '摄像机', error: 2, total: 484 },
  { name: '风速风向仪', error: 1, total: 484 },
  { name: '超高检测器', error: 0, total: 484 },
  { name: '烟道机器人', error: 0, total: 484 },
  { name: '激光雷达', error: 0, total: 484 },
  { name: 'CO₂传感器', error: 0, total: 484 },
  { name: 'CO/VI检测器', error: 0, total: 484 },
  { name: '温湿度传感器', error: 0, total: 484 },
  { name: '压力传感器', error: 0, total: 484 },
  { name: '光照度变送器', error: 0, total: 484 },
  { name: '紧急电话', error: 0, total: 484 },
  { name: '水质监测设备', error: 0, total: 484 }
])

const deviceBgs = [bg3, bg3, bg3, bg3, bg3, bg3, bg3, bg3, bg3, bg3, bg3, bg3]
const deviceIcons = [icon3, icon4, icon5, icon6, icon7, icon8, icon9, icon10, icon11, icon12, icon13, icon14]
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>