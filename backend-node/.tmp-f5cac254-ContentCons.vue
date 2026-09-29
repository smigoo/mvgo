<template>
  <div data-section-id="2:8437" class="c-device-monitor-cons" v-bind="$attrs">
    <div
      v-for="item in deviceList"
      :key="item.id"
      class="c-device-monitor-group-2136637321"
    >
      <div class="c-device-monitor-cons-icon">
        <img :src="item.icon" :alt="item.label" class="c-device-monitor-cons-icon-img" />
      </div>
      <div class="c-device-monitor-cons-text" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
        <span class="c-device-monitor-cons-label" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">{{ item.label }}</span>
        <span class="c-device-monitor-cons-value" :style="{ backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }"><span v-for="(seg, segIdx) in formatDeviceCountSegments(item.value)" :key="segIdx" :style="{ color: seg.color, fontSize: seg.fontSize ? seg.fontSize + 'px' : undefined, fontWeight: seg.fontWeight || undefined }">{{ seg.text }}</span></span>
      </div>
    </div>
  </div>
</template>

<script setup>
// 🛡️ P-11 分段着色（确定性装配 · 真值来自 Figma per-character）
const COUNT_SEG_BASE = 'rgb(25,144,255)'
const COUNT_SEG_ABNORMAL = 'rgb(224,52,52)'
const COUNT_SEG_NORMAL = 'rgb(8,163,165)'
const COUNT_SEG_BASE_SIZE = 16
const COUNT_SEG_BASE_WEIGHT = 500
const COUNT_SEG_NUM_SIZE = 12
const COUNT_SEG_NUM_WEIGHT = 500
function formatDeviceCountSegments(raw) {
  const s = String(raw == null ? '' : raw)
  const m = s.match(/^(\D*?)(\d+)(\/[\s\S]*)$/)
  if (!m) return [{ text: s, color: COUNT_SEG_BASE }]
  const n = Number(m[2])
  return [
    { text: m[1], color: COUNT_SEG_BASE, fontSize: COUNT_SEG_BASE_SIZE, fontWeight: COUNT_SEG_BASE_WEIGHT },
    { text: m[2], color: n > 0 ? COUNT_SEG_ABNORMAL : COUNT_SEG_NORMAL, fontSize: COUNT_SEG_NUM_SIZE, fontWeight: COUNT_SEG_NUM_WEIGHT },
    { text: m[3], color: COUNT_SEG_BASE, fontSize: COUNT_SEG_BASE_SIZE, fontWeight: COUNT_SEG_BASE_WEIGHT },
  ].filter((x) => x.text)
}

import bg3 from '../../resources/images/bg-8439.png'
import icon9 from '../../resources/images/icon-8561.png'
import icon15 from '../../resources/images/icon-8648.png'
import icon13 from '../../resources/images/icon-8735.png'
import icon14 from '../../resources/images/icon-8532.png'
import icon7 from '../../resources/images/icon-8677.png'
import icon6 from '../../resources/images/icon-8590.png'
import icon16 from '../../resources/images/icon-8764.png'
import icon11 from '../../resources/images/icon-8503.png'
import icon12 from '../../resources/images/icon-8619.png'
import icon10 from '../../resources/images/icon-8706.png'
import icon5 from '../../resources/images/icon-8444.png'
import icon8 from '../../resources/images/icon-8473.png'


import { ref} from 'vue'

// 设备列表（文案与图标均来自 Figma 真值）
const deviceList = ref([
  { id: 'camera', label: '摄像机', value: '(2/484)', icon: icon9 },
  { id: 'smoke-robot', label: '烟道机器人', value: '(0/484)', icon: icon15 },
  { id: 'co-vi', label: 'CO/VI检测器', value: '(0/484)', icon: icon13 },
  { id: 'illuminance', label: '光照度变送器', value: '(0/484)', icon: icon14 },
  { id: 'laser-radar', label: '激光雷达', value: '(0/484)', icon: icon7 },
  { id: 'wind', label: '风速风向仪', value: '(1/484)', icon: icon6 },
  { id: 'temp-humidity', label: '温湿度传感器', value: '(0/484)', icon: icon16 },
  { id: 'emergency-phone', label: '紧急电话', value: '(0/484)', icon: icon11 },
  { id: 'ultrasonic', label: '超高检测器', value: '(0/484)', icon: icon12 },
  { id: 'co2', label: 'CO2传感器', value: '(0/484)', icon: icon10 },
  { id: 'pressure', label: '压力传感器', value: '(0/484)', icon: icon5 },
  { id: 'water-quality', label: '水质监测设备', value: '(0/484)', icon: icon8 }
])
</script>

<style lang="less" scoped>@color-text-base: #333333;
@color-text-inverse: #FFFFFF;

@fontWeightStrong: var(--fontWeightStrong, 400);

@import '../../resources/styles/index.less';

.c-device-monitor-cons {grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 1fr;
  height: 100%;
  min-height: 0;
  display: grid;}

.c-device-monitor-group-2136637321 {width: 100%;
  flex: 1 1 0;
  min-height: 0;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat}

.c-device-monitor-cons-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.c-device-monitor-cons-icon-img {
  width: 27px;
  height: 32px;
  object-fit: contain;
}

.c-device-monitor-cons-text {width: 100%;
height: 100%;
gap: 2px;
  min-width: 0}

.c-device-monitor-cons-label {width: 100%;
height: 100%;

  font-size: calc(@fontSize * 0.857);
  color: @color-text-base;
  line-height: 1.5;
  white-space: nowrap;
}

.c-device-monitor-cons-value {width: 100%;
height: 100%;

  font-size: calc(@fontSize * 1.143);
  font-weight: @fontWeightStrong;
  color: @color-text-inverse;
  line-height: 1.2;
  white-space: nowrap;
}
</style>