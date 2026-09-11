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
        <span class="c-monitor-device-count-total">/{{ device.total }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import bg3 from '../../resources/images/bg-8439.png'
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