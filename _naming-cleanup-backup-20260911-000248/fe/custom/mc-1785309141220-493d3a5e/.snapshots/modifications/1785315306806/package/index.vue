<template>
  <base-panel panelKey="default-panel">
    <!-- Fixed: 头部统计信息放入 #header-right 插槽，补充 "*数据实时更新" 提示 -->
    <template #header-right>
      <div class="c-mc-1785309141220-493d3a5e-header-stats">
        <div class="c-mc-1785309141220-493d3a5e-stat-item">
          <span class="c-mc-1785309141220-493d3a5e-stat-label">设备类型</span>
          <span class="c-mc-1785309141220-493d3a5e-stat-value--primary">28</span>
        </div>
        <div class="c-mc-1785309141220-493d3a5e-stat-item">
          <span class="c-mc-1785309141220-493d3a5e-stat-label">设备总数</span>
          <span class="c-mc-1785309141220-493d3a5e-stat-value--primary">68562</span>
        </div>
        <div class="c-mc-1785309141220-493d3a5e-stat-item">
          <span class="c-mc-1785309141220-493d3a5e-stat-label">完好率</span>
          <span class="c-mc-1785309141220-493d3a5e-stat-value--success">98%</span>
        </div>
        <!-- [Layout Refine] 补充 Figma 中的 "*数据实时更新" 文本 -->
        <span class="c-mc-1785309141220-493d3a5e-update-tip">*数据实时更新</span>
      </div>
    </template>

    <div class="c-mc-1785309141220-493d3a5e-container">
      <!-- [Layout Refine] 重构 switch 内部布局以匹配 Figma 绝对定位 -->
      <div class="c-mc-1785309141220-493d3a5e-switch">
        <div
          v-for="tab in switchTabs"
          :key="tab.key"
          class="c-mc-1785309141220-493d3a5e-switch-item"
          :class="{ 'is-active': activeSwitch === tab.key }"
          @click="activeSwitch = tab.key"
        >
          <div
            class="c-mc-1785309141220-493d3a5e-switch-bg"
            :style="{
              backgroundImage: `url(${activeSwitch === tab.key ? bg1 : bg2})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }"
          ></div>
          <img :src="tab.icon" class="c-mc-1785309141220-493d3a5e-switch-icon" />
          <span class="c-mc-1785309141220-493d3a5e-switch-title">{{ tab.label }}</span>
          <div class="c-mc-1785309141220-493d3a5e-switch-data">
            <div class="c-mc-1785309141220-493d3a5e-switch-data-row">
              <span class="c-mc-1785309141220-493d3a5e-switch-data-label">总数:</span>
              <span class="c-mc-1785309141220-493d3a5e-switch-data-value">{{ tab.total }}</span>
            </div>
            <div class="c-mc-1785309141220-493d3a5e-switch-data-row">
              <span class="c-mc-1785309141220-493d3a5e-switch-data-label">异常数:</span>
              <span class="c-mc-1785309141220-493d3a5e-switch-data-value c-mc-1785309141220-493d3a5e-switch-data-value--error">{{ tab.error }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 内容区域：垂直标签 + 设备卡片网格 -->
      <div class="c-mc-1785309141220-493d3a5e-content">
        <!-- 垂直标签导航 -->
        <div class="c-mc-1785309141220-493d3a5e-vtabs">
          <div
            v-for="tab in verticalTabs"
            :key="tab.key"
            class="c-mc-1785309141220-493d3a5e-vtab-item"
            :class="{ 'is-active': activeVTab === tab.key }"
            @click="activeVTab = tab.key"
          >
            <span class="c-mc-1785309141220-493d3a5e-vtab-text">{{ tab.label }}</span>
          </div>
        </div>

        <!-- 设备卡片网格 (3列×4行) -->
        <div class="c-mc-1785309141220-493d3a5e-device-grid">
          <div
            v-for="(device, index) in currentDevices"
            :key="`${activeSwitch}-${index}`"
            class="c-mc-1785309141220-493d3a5e-device-card"
          >
            <div
              class="c-mc-1785309141220-493d3a5e-device-bg"
              :style="{
                backgroundImage: `url(${getDeviceBg(index)})`,
                backgroundSize: '100% 100%',
                backgroundPosition: 'center center',
                backgroundRepeat: 'no-repeat'
              }"
            ></div>
            <img :src="device.icon" class="c-mc-1785309141220-493d3a5e-device-icon" />
            <div class="c-mc-1785309141220-493d3a5e-device-info">
              <span class="c-mc-1785309141220-493d3a5e-device-name">{{ device.name }}</span>
              <span class="c-mc-1785309141220-493d3a5e-device-count">{{ device.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-8788.png'
import bg2 from '../resources/images/bg-8807.png'
import bg3 from '../resources/images/bg-8439.png'
import bg9 from '../resources/images/bg-8643.png'
import icon3 from '../resources/images/icon-8798.png'
import icon4 from '../resources/images/icon-8817.png'
import bg4 from '../resources/images/bg-8468.png'
import bg5 from '../resources/images/bg-8498.png'
import bg6 from '../resources/images/bg-8527.png'
import bg7 from '../resources/images/bg-8556.png'
import bg8 from '../resources/images/bg-8614.png'
import icon5 from '../resources/images/icon-8444.png'
import icon8 from '../resources/images/icon-8532.png'
import icon6 from '../resources/images/icon-8473.png'
import icon7 from '../resources/images/icon-8503.png'

import { ref, computed, onMounted } from 'vue'

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder || null
} catch (e) {
  console.warn('[设备监测] $mcComponentBuilder 失败:', e)
}

const activeSwitch = ref('tunnel')
const activeVTab = ref('tab1')

/* [Layout Refine] 补充 Figma 中的 switch 数据 (total/error) */
const switchTabs = [
  { key: 'tunnel', label: '隧道设备', icon: icon3, total: '56302', error: '5' },
  { key: 'bridge', label: '南北接线设备', icon: icon4, total: '1280', error: '3' }
]

const deviceBgs = [bg3, bg4, bg5, bg6, bg7, bg8, bg9]
const getDeviceBg = (index) => deviceBgs[index % deviceBgs.length]

/* [Layout Refine] 修正垂直标签文本以严格对齐 Figma */
const verticalTabs = [
  { key: 'tab1', label: '监控' },
  { key: 'tab2', label: '照明' },
  { key: 'tab3', label: '通风' },
  { key: 'tab4', label: '消防' },
  { key: 'tab5', label: '交通诱导' },
  { key: 'tab6', label: '供配电' }
]

const deviceIcons = [icon5, icon6, icon7, icon8]

/* [Layout Refine] 修正设备列表数据以严格对齐 Figma 卡片内容 */
const tunnelDevices = [
  { name: '摄像机', count: '(2/484)', icon: deviceIcons[0] },
  { name: '风速风向仪', count: '(1/484)', icon: deviceIcons[1] },
  { name: '超高检测器', count: '(0/484)', icon: deviceIcons[2] },
  { name: '烟道机器人', count: '(0/484)', icon: deviceIcons[3] },
  { name: '激光雷达', count: '(0/484)', icon: deviceIcons[0] },
  { name: 'CO2传感器', count: '(0/484)', icon: deviceIcons[1] },
  { name: 'CO/VI检测器', count: '(0/484)', icon: deviceIcons[2] },
  { name: '温湿度传感器', count: '(0/484)', icon: deviceIcons[3] },
  { name: '压力传感器', count: '(0/484)', icon: deviceIcons[0] },
  { name: '光照度变送器', count: '(0/484)', icon: deviceIcons[1] },
  { name: '紧急电话', count: '(0/484)', icon: deviceIcons[2] },
  { name: '水质监测设备', count: '(0/484)', icon: deviceIcons[3] }
]

const bridgeDevices = [
  { name: '传感器', count: '(0/484)', icon: deviceIcons[0] },
  { name: '摄像头', count: '(0/484)', icon: deviceIcons[1] },
  { name: '控制器', count: '(0/484)', icon: deviceIcons[2] },
  { name: '交换机', count: '(0/484)', icon: deviceIcons[3] },
  { name: '光缆', count: '(0/484)', icon: deviceIcons[0] },
  { name: '电源', count: '(0/484)', icon: deviceIcons[1] },
  { name: '接线箱', count: '(0/484)', icon: deviceIcons[2] },
  { name: '防雷器', count: '(0/484)', icon: deviceIcons[3] },
  { name: '配电箱', count: '(0/484)', icon: deviceIcons[0] },
  { name: '监控器', count: '(0/484)', icon: deviceIcons[1] },
  { name: '报警器', count: '(0/484)', icon: deviceIcons[2] },
  { name: '路由器', count: '(0/484)', icon: deviceIcons[3] }
]

const currentDevices = computed(() => {
  return activeSwitch.value === 'tunnel' ? tunnelDevices : bridgeDevices
})

onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-1785309141220-493d3a5e-onload', {
      componentId: 'mc-1785309141220-493d3a5e',
      timestamp: Date.now()
    })
  }
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>