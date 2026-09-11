<template>
  <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-device-grid">
    <div v-for="device in devices" :key="device.name" class="c-mc-max-1787812418444-fd7e9caf-c-monitor-device-card">
      <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-device-icon">
        <img :src="device.icon" :alt="device.name" />
      </div>
      <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-device-info">
        <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-device-name">{{ device.name }}</div>
        <div class="c-mc-max-1787812418444-fd7e9caf-c-monitor-device-value">
          <span class="c-monitor-value-bracket">(</span>
          <span :class="device.abnormal > 0 ? 'c-monitor-value-abnormal' : 'c-monitor-value-normal'">
            {{ device.abnormal }}
          </span>
          <span class="c-mc-max-1787812418444-fd7e9caf-c-monitor-value-total">/{{ device.total }})</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon27 from '../../resources/images/Group_1321317970-8459.png'
import icon40 from '../../resources/images/Group_1321317970-8518.png'
import icon52 from '../../resources/images/Group_1321317970-8547.png'
import icon64 from '../../resources/images/Group_1321317970-8576.png'
import icon76 from '../../resources/images/Group_1321317970-8605.png'
import icon88 from '../../resources/images/Group_1321317970-8634.png'
import icon100 from '../../resources/images/Group_1321317970-8663.png'
import icon112 from '../../resources/images/Group_1321317970-8692.png'
import icon124 from '../../resources/images/Group_1321317970-8721.png'
import icon136 from '../../resources/images/Group_1321317970-8750.png'
import icon148 from '../../resources/images/Group_1321317970-8779.png'

import { ref} from 'vue'

const devices = ref([
  { name: '摄像机', abnormal: 2, total: 484, icon: icon27 },
  { name: '风速风向仪', abnormal: 1, total: 484, icon: icon40 },
  { name: '超高检测器', abnormal: 0, total: 484, icon: icon52 },
  { name: '烟道机器人', abnormal: 0, total: 484, icon: icon64 },
  { name: '激光雷达', abnormal: 0, total: 484, icon: icon76 },
  { name: 'CO₂传感器', abnormal: 0, total: 484, icon: icon88 },
  { name: 'CO/VI检测器', abnormal: 0, total: 484, icon: icon100 },
  { name: '温湿度传感器', abnormal: 0, total: 484, icon: icon112 },
  { name: '压力传感器', abnormal: 0, total: 484, icon: icon124 },
  { name: '光照度变送器', abnormal: 0, total: 484, icon: icon136 },
  { name: '紧急电话', abnormal: 0, total: 484, icon: icon148 },
  { name: '水质监测设备', abnormal: 0, total: 484, icon: icon27 }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>