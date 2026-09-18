<template>
  <div class="c-device-monitor-cons-root">
    <div class="c-device-monitor-cons-grid">
      <div
        v-for="(item, index) in deviceList"
        :key="index"
        class="c-device-monitor-cons-item"
        :style="{ backgroundImage: `url(${bg3})` }"
      >
        <div class="c-device-monitor-cons-item-icon">
          <img :src="getIcon(index)" class="c-device-monitor-cons-icon-img" />
        </div>
        <div class="c-device-monitor-cons-item-text">
          <div class="c-device-monitor-cons-label">{{ item.label }}</div>
          <div class="c-device-monitor-cons-value">{{ item.value }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg3 from '../../resources/images/bg-8439.png'
import icon5 from '../../resources/images/icon-8444.png'
import icon16 from '../../resources/images/icon-8764.png'


import { ref} from 'vue'

const deviceList = ref([
  { label: '摄像机', value: '(2/484)' },
  { label: '烟道机器人', value: '(0/484)' },
  { label: 'CO/VI检测器', value: '(0/484)' },
  { label: '光照度变送器', value: '(0/484)' },
  { label: '激光雷达', value: '(0/484)' },
  { label: '风速风向仪', value: '(1/484)' },
  { label: '温湿度传感器', value: '(0/484)' },
  { label: '紧急电话', value: '(0/484)' },
  { label: '超高检测器', value: '(0/484)' },
  { label: 'CO2传感器', value: '(0/484)' },
  { label: '压力传感器', value: '(0/484)' },
  { label: '水质监测设备', value: '(0/484)' }
])

const iconMap = [icon5, icon8, icon11, icon14, icon9, icon6, icon12, icon15, icon7, icon10, icon13, icon16]

const getIcon = (index) => {
  return iconMap[index] || icon5
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';


.c-device-monitor-cons-grid {grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(4, 1fr);
  display: grid;}

.c-device-monitor-cons-item {background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat}


.c-device-monitor-cons-icon-img {object-fit: contain}

.c-device-monitor-cons-item-text {min-width: 0}

.c-device-monitor-cons-label {font-size: calc(var(--fontSize, 14px) * 0.857);
  color: #333333;
  line-height: 1.5;
  white-space: nowrap;
  text-overflow: ellipsis}

.c-device-monitor-cons-value {font-size: calc(var(--fontSize, 14px) * 1.143);
  font-weight: 500;
  color: var(--colorBgContainer, #ffffff);
  line-height: 1.3;
  white-space: nowrap;
  text-overflow: ellipsis}
</style>