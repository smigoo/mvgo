<template>
  <div class="c-monitor-device-grid">
    <div
      v-for="device in devices"
      :key="device.id"
      class="c-monitor-device-card"
    >
      <img :src="device.icon" class="c-monitor-device-icon" :alt="device.name"/>
      <div class="c-monitor-device-name" :style="{ backgroundImage: 'url(' + bg14 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">{{ device.name }}</div>
      <div class="c-monitor-device-status">{{ device.status }}</div>
    </div>
  </div>
</template>

<script setup>
import bg14 from '../../resources/images/bg-8759.png'
import bg13 from '../../resources/images/bg-8730.png'
import icon3 from '../../resources/images/icon-8444.png'
import icon8 from '../../resources/images/icon-8590.png'
import icon11 from '../../resources/images/icon-8677.png'
import icon4 from '../../resources/images/icon-8473.png'
import icon7 from '../../resources/images/icon-8561.png'
import icon12 from '../../resources/images/icon-8706.png'
import icon5 from '../../resources/images/icon-8503.png'
import icon9 from '../../resources/images/icon-8619.png'
import icon13 from '../../resources/images/icon-8735.png'
import icon6 from '../../resources/images/icon-8532.png'
import icon10 from '../../resources/images/icon-8648.png'
import icon14 from '../../resources/images/icon-8764.png'


import { ref} from 'vue'

const devices = ref([
  {
    id: 1,
    name: '摄像机',
    status: '(2/484)',
    icon: icon3
  },
  {
    id: 2,
    name: '风速风向仪',
    status: '(1/484)',
    icon: icon8
  },
  {
    id: 3,
    name: '超高检测器',
    status: '(0/484)',
    icon: icon11
  },
  {
    id: 4,
    name: '烟雾机器人',
    status: '(0/484)',
    icon: icon4
  },
  {
    id: 5,
    name: '激光雷达',
    status: '(0/484)',
    icon: icon7
  },
  {
    id: 6,
    name: 'CO传感器',
    status: '(0/484)',
    icon: icon12
  },
  {
    id: 7,
    name: 'CO/VI检测器',
    status: '(0/484)',
    icon: icon5
  },
  {
    id: 8,
    name: '温湿度传感器',
    status: '(0/484)',
    icon: icon9
  },
  {
    id: 9,
    name: '压力传感器',
    status: '(0/484)',
    icon: icon13
  },
  {
    id: 10,
    name: '光照度变送器',
    status: '(0/484)',
    icon: icon6
  },
  {
    id: 11,
    name: '紧急电话',
    status: '(0/484)',
    icon: icon10
  },
  {
    id: 12,
    name: '水质监测设备',
    status: '(0/484)',
    icon: icon14
  }
])
</script>

<style lang="less" scoped>
@colorTextBase: #333333;
@fontWeightStrong: 400;
@colorPrimary: #409EFF;

@import '../../resources/styles/index.less';

.c-monitor-device-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 12px;
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.c-monitor-device-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px 12px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.3s ease;
  cursor: pointer;
  min-height: 120px;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  }
}

.c-monitor-device-icon {
  width: 40px;
  height: 40px;
  margin-bottom: 8px;
  object-fit: contain;
  flex-shrink: 0;
}

.c-monitor-device-name {
  font-size: calc(var(--fontSize, 14px) * 0.875);
  color: @colorTextBase;
  text-align: center;
  margin-bottom: 4px;
  line-height: 1.4;
}

.c-monitor-device-status {
  font-size: calc(var(--fontSize, 14px) * 1.125);
  font-weight: @fontWeightStrong;
  color: @colorPrimary;
  text-align: center;
}
</style>