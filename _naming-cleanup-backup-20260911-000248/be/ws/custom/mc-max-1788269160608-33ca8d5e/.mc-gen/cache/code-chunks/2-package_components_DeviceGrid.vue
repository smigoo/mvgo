<template>
  <div class="c-monitor-device-grid">
    <div 
      v-for="device in devices" 
      :key="device.id"
      class="c-monitor-device-card"
      :style="{ backgroundImage: `url(${bg1})` }"
    >
      <img :src="device.icon" class="c-monitor-device-icon" />
      <div class="c-monitor-device-content">
        <!-- 设备名称在上 -->
        <span class="c-monitor-device-name">{{ device.name }}</span>
        <!-- 数量在下 -->
        <span class="c-monitor-device-count">{{ device.count }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import bg1 from '../../resources/images/bg-8788.png'
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
import icon13 from '../../resources/images/icon-8735.png'
import icon14 from '../../resources/images/icon-8764.png'

const devices = ref([
  { id: 1, name: '摄像机', count: '(2/484)', icon: icon1 },
  { id: 2, name: '风速风向仪', count: '(1/484)', icon: icon2 },
  { id: 3, name: '超高检测器', count: '(0/484)', icon: icon3 },
  { id: 4, name: '烟雾机器人', count: '(0/484)', icon: icon4 },
  { id: 5, name: '激光雷达', count: '(0/484)', icon: icon5 },
  { id: 6, name: 'CO传感器', count: '(0/484)', icon: icon6 },
  { id: 7, name: 'CO/VI检测器', count: '(0/484)', icon: icon7 },
  { id: 8, name: '温湿度传感器', count: '(0/484)', icon: icon8 },
  { id: 9, name: '压力传感器', count: '(0/484)', icon: icon9 },
  { id: 10, name: '光照度变送器', count: '(0/484)', icon: icon10 },
  { id: 11, name: '紧急电话', count: '(0/484)', icon: icon11 },
  { id: 12, name: '水质监测设备', count: '(0/484)', icon: icon12 }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
