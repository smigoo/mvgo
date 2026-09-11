<template>
  <base-panel panelKey="default-panel">
    <template #title-left>
      <img :src="icon1" class="c-mc-max-1785981394966-e19214f4-title-dot" alt="" />
    </template>
    <template #header-right>
      <div class="c-mc-max-1785981394966-e19214f4-header-stats">
        <div class="c-mc-max-1785981394966-e19214f4-stat-group">
          <span class="c-mc-max-1785981394966-e19214f4-stat-label">设备类型</span>
          <span class="c-mc-max-1785981394966-e19214f4-stat-value">28</span>
        </div>
        <div class="c-mc-max-1785981394966-e19214f4-stat-group">
          <span class="c-mc-max-1785981394966-e19214f4-stat-label">设备总数</span>
          <span class="c-mc-max-1785981394966-e19214f4-stat-value">68562</span>
        </div>
        <div class="c-mc-max-1785981394966-e19214f4-stat-group">
          <span class="c-mc-max-1785981394966-e19214f4-stat-label">完好率</span>
          <span class="c-mc-max-1785981394966-e19214f4-stat-value-green">98%</span>
        </div>
        <img :src="icon2" class="c-mc-max-1785981394966-e19214f4-header-icon" alt="" />
      </div>
    </template>

    <!-- 默认插槽：业务内容区 -->
    <div
      class="c-mc-max-1785981394966-e19214f4-body"
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <!-- 顶部切换区：隧道设备 / 南北接线设备 -->
      <div class="c-mc-max-1785981394966-e19214f4-switch-row">
        <!-- 激活态：隧道设备 -->
        <div
          class="c-mc-max-1785981394966-e19214f4-switch-item"
          :class="activeSwitch === 'tunnel' ? 'c-mc-max-1785981394966-e19214f4-switch-item--active' : 'c-mc-max-1785981394966-e19214f4-switch-item--default'"
          :style="activeSwitch === 'tunnel' ? { backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' } : { backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          @click="activeSwitch = 'tunnel'"
        >
          <img :src="icon3" class="c-mc-max-1785981394966-e19214f4-switch-icon" alt="" />
          <div class="c-mc-max-1785981394966-e19214f4-switch-info">
            <span :class="activeSwitch === 'tunnel' ? 'c-mc-max-1785981394966-e19214f4-switch-title--active' : 'c-mc-max-1785981394966-e19214f4-switch-title--default'">隧道设备</span>
            <div class="c-mc-max-1785981394966-e19214f4-switch-data-row">
              <span :class="activeSwitch === 'tunnel' ? 'c-mc-max-1785981394966-e19214f4-switch-data-label--active' : 'c-mc-max-1785981394966-e19214f4-switch-data-label--default'">总数:</span>
              <span :class="activeSwitch === 'tunnel' ? 'c-mc-max-1785981394966-e19214f4-switch-data-value--active' : 'c-mc-max-1785981394966-e19214f4-switch-data-value--default'">56302</span>
            </div>
            <div class="c-mc-max-1785981394966-e19214f4-switch-data-row">
              <span :class="activeSwitch === 'tunnel' ? 'c-mc-max-1785981394966-e19214f4-switch-data-label--active' : 'c-mc-max-1785981394966-e19214f4-switch-data-label--default'">异常数:</span>
              <span :class="activeSwitch === 'tunnel' ? 'c-mc-max-1785981394966-e19214f4-switch-data-value--active' : 'c-mc-max-1785981394966-e19214f4-switch-data-value--default'">5</span>
            </div>
          </div>
        </div>

        <!-- 默认态：南北接线设备 -->
        <div
          class="c-mc-max-1785981394966-e19214f4-switch-item"
          :class="activeSwitch === 'connection' ? 'c-mc-max-1785981394966-e19214f4-switch-item--active' : 'c-mc-max-1785981394966-e19214f4-switch-item--default'"
          :style="activeSwitch === 'connection' ? { backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' } : { backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          @click="activeSwitch = 'connection'"
        >
          <img :src="icon4" class="c-mc-max-1785981394966-e19214f4-switch-icon" alt="" />
          <div class="c-mc-max-1785981394966-e19214f4-switch-info">
            <span :class="activeSwitch === 'connection' ? 'c-mc-max-1785981394966-e19214f4-switch-title--active' : 'c-mc-max-1785981394966-e19214f4-switch-title--default'">南北接线 设备</span>
            <div class="c-mc-max-1785981394966-e19214f4-switch-data-row">
              <span :class="activeSwitch === 'connection' ? 'c-mc-max-1785981394966-e19214f4-switch-data-label--active' : 'c-mc-max-1785981394966-e19214f4-switch-data-label--default'">总数:</span>
              <span :class="activeSwitch === 'connection' ? 'c-mc-max-1785981394966-e19214f4-switch-data-value--active' : 'c-mc-max-1785981394966-e19214f4-switch-data-value--default'">1280</span>
            </div>
            <div class="c-mc-max-1785981394966-e19214f4-switch-data-row">
              <span :class="activeSwitch === 'connection' ? 'c-mc-max-1785981394966-e19214f4-switch-data-label--active' : 'c-mc-max-1785981394966-e19214f4-switch-data-label--default'">异常数:</span>
              <span :class="activeSwitch === 'connection' ? 'c-mc-max-1785981394966-e19214f4-switch-data-value--active' : 'c-mc-max-1785981394966-e19214f4-switch-data-value--default'">3</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 左侧竖排标签 + 右侧设备卡片网格 -->
      <div class="c-mc-max-1785981394966-e19214f4-main-area">
        <!-- 左侧竖向 Tab -->
        <div class="c-mc-max-1785981394966-e19214f4-tab-list">
          <div
            v-for="tab in tabList"
            :key="tab.key"
            class="c-mc-max-1785981394966-e19214f4-tab-item"
            :class="activeTab === tab.key ? 'c-mc-max-1785981394966-e19214f4-tab-item--active' : ''"
            :style="activeTab === tab.key
              ? { backgroundImage: `url(${tab.activeBg})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }
              : { backgroundImage: `url(${tab.defaultBg})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
            @click="activeTab = tab.key"
          >
            <span class="c-mc-max-1785981394966-e19214f4-tab-label">{{ tab.label }}</span>
            <span v-if="tab.badge != null" class="c-mc-max-1785981394966-e19214f4-tab-badge">{{ tab.badge }}</span>
          </div>
        </div>

        <!-- 右侧设备卡片网格 -->
        <div class="c-mc-max-1785981394966-e19214f4-device-grid">
          <div
            v-for="(device, idx) in currentDevices"
            :key="device.name"
            class="c-mc-max-1785981394966-e19214f4-device-card"
            :style="{ backgroundImage: `url(${deviceBgList[idx]})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          >
            <img :src="deviceIconList[idx]" class="c-mc-max-1785981394966-e19214f4-device-icon" alt="" />
            <div class="c-mc-max-1785981394966-e19214f4-device-info">
              <span class="c-mc-max-1785981394966-e19214f4-device-name">{{ device.name }}</span>
              <span class="c-mc-max-1785981394966-e19214f4-device-ratio">{{ device.ratio }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import icon1 from '../resources/images/g-8421.png'
import icon2 from '../resources/images/Frame-8856.png'
import bg1 from '../resources/images/bg-8418.png'
import bg2 from '../resources/images/bg-8788.png'
import bg3 from '../resources/images/bg-8807.png'
import icon3 from '../resources/images/icon-8798.png'
import icon4 from '../resources/images/icon-8817.png'
import bg4 from '../resources/images/bg-8831.png'
import bg5 from '../resources/images/bg-8831.png'
import bg6 from '../resources/images/bg-8831.png'
import bg7 from '../resources/images/bg-8847.png'
import bg8 from '../resources/images/bg-8852.png'
import bg9 from '../resources/images/bg-8439.png'
import bg20 from '../resources/images/bg-8759.png'
import icon5 from '../resources/images/icon-8444.png'
import icon16 from '../resources/images/icon-8764.png'
import bg10 from '../resources/images/bg-8468.png'
import bg11 from '../resources/images/bg-8498.png'
import bg12 from '../resources/images/bg-8527.png'
import bg13 from '../resources/images/bg-8556.png'
import bg14 from '../resources/images/bg-8585.png'
import bg15 from '../resources/images/bg-8614.png'
import bg16 from '../resources/images/bg-8643.png'
import bg17 from '../resources/images/bg-8672.png'
import bg18 from '../resources/images/bg-8701.png'
import bg19 from '../resources/images/bg-8730.png'
import icon6 from '../resources/images/icon-8473.png'
import icon7 from '../resources/images/icon-8503.png'
import icon8 from '../resources/images/icon-8532.png'
import icon9 from '../resources/images/icon-8561.png'
import icon10 from '../resources/images/icon-8590.png'
import icon11 from '../resources/images/icon-8619.png'
import icon12 from '../resources/images/icon-8648.png'
import icon13 from '../resources/images/icon-8677.png'
import icon14 from '../resources/images/icon-8706.png'
import icon15 from '../resources/images/icon-8735.png'

import { ref, computed, onMounted} from 'vue'

// $mcComponentBuilder 用 try-catch 包裹，防止框架未就绪时组件不可见
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function'
    ? $mcComponentBuilder({
        componentId: 'mc-max-1785981394966-e19214f4',
        componentProps: {},
        componentName: 'mc-max-1785981394966-e19214f4'
      })
    : null
  runtimeBuilder = builder?.runtimeBuilder ?? null
} catch (e) {
  console.warn('[mc-max-1785981394966-e19214f4] $mcComponentBuilder 失败:', e)
}

// 当前切换区激活项
const activeSwitch = ref('tunnel')

// 左侧竖向 Tab 数据
const tabList = ref([
  { key: 'monitor', label: '监控', badge: '3/3740', activeBg: bg4, defaultBg: bg4 },
  { key: 'lighting', label: '照明', badge: '3', activeBg: bg5, defaultBg: bg5 },
  { key: 'ventilation', label: '通风', badge: null, activeBg: bg6, defaultBg: bg6 },
  { key: 'fire', label: '消防', badge: null, activeBg: bg6, defaultBg: bg6 },
  { key: 'traffic-guide', label: '交通诱导', badge: null, activeBg: bg7, defaultBg: bg7 },
  { key: 'power', label: '供配电', badge: null, activeBg: bg8, defaultBg: bg8 },
])

const activeTab = ref('monitor')

// 设备卡片列表（监控 tab 下的设备，来自 Figma cons 区域）
const allDeviceData = {
  monitor: [
    { name: '摄像机', ratio: '(2/484)' },
    { name: '烟道机器人', ratio: '(0/484)' },
    { name: 'CO/VI检测器', ratio: '(0/484)' },
    { name: '光照度变送器', ratio: '(0/484)' },
    { name: '激光雷达', ratio: '(0/484)' },
    { name: '风速风向仪', ratio: '(1/484)' },
    { name: '温湿度传感器', ratio: '(0/484)' },
    { name: '紧急电话', ratio: '(0/484)' },
    { name: '超高检测器', ratio: '(0/484)' },
    { name: 'CO2传感器', ratio: '(0/484)' },
    { name: '压力传感器', ratio: '(0/484)' },
    { name: '水质监测设备', ratio: '(0/484)' },
  ],
  lighting: [
    { name: '照明控制器', ratio: '(0/256)' },
    { name: '调光模块', ratio: '(0/256)' },
    { name: '照度传感器', ratio: '(0/256)' },
    { name: '应急灯', ratio: '(0/256)' },
    { name: '开关面板', ratio: '(0/256)' },
    { name: '回路控制器', ratio: '(0/256)' },
    { name: '智能网关', ratio: '(0/256)' },
    { name: '电能表', ratio: '(0/256)' },
    { name: '配电箱', ratio: '(0/256)' },
    { name: '变压器', ratio: '(0/256)' },
    { name: '漏电保护器', ratio: '(0/256)' },
    { name: '断路器', ratio: '(0/256)' },
  ],
  ventilation: [
    { name: '射流风机', ratio: '(0/128)' },
    { name: '轴流风机', ratio: '(0/128)' },
    { name: '风速传感器', ratio: '(0/128)' },
    { name: 'CO检测仪', ratio: '(0/128)' },
    { name: 'VI能见度仪', ratio: '(0/128)' },
    { name: '变频器', ratio: '(0/128)' },
    { name: '温度传感器', ratio: '(0/128)' },
    { name: '压差传感器', ratio: '(0/128)' },
    { name: '风量调节阀', ratio: '(0/128)' },
    { name: '通风控制柜', ratio: '(0/128)' },
    { name: '防火阀', ratio: '(0/128)' },
    { name: '排风机', ratio: '(0/128)' },
  ],
  fire: [
    { name: '感烟探测器', ratio: '(0/64)' },
    { name: '感温探测器', ratio: '(0/64)' },
    { name: '手动报警按钮', ratio: '(0/64)' },
    { name: '消火栓', ratio: '(0/64)' },
    { name: '灭火器', ratio: '(0/64)' },
    { name: '喷淋头', ratio: '(0/64)' },
    { name: '消防广播', ratio: '(0/64)' },
    { name: '防火卷帘', ratio: '(0/64)' },
    { name: '排烟风机', ratio: '(0/64)' },
    { name: '消防泵', ratio: '(0/64)' },
    { name: '报警控制器', ratio: '(0/64)' },
    { name: '联动控制箱', ratio: '(0/64)' },
  ],
  'traffic-guide': [
    { name: '可变信息板', ratio: '(0/32)' },
    { name: '车道信号灯', ratio: '(0/32)' },
    { name: '限速标志', ratio: '(0/32)' },
    { name: '雷达测速仪', ratio: '(0/32)' },
    { name: '车辆检测器', ratio: '(0/32)' },
    { name: '行程时间仪', ratio: '(0/32)' },
    { name: '气象检测站', ratio: '(0/32)' },
    { name: '事件检测器', ratio: '(0/32)' },
    { name: '紧急广播', ratio: '(0/32)' },
    { name: '交通控制器', ratio: '(0/32)' },
    { name: '引导牌', ratio: '(0/32)' },
    { name: '光纤传感器', ratio: '(0/32)' },
  ],
  power: [
    { name: '变压器', ratio: '(0/16)' },
    { name: '高压开关柜', ratio: '(0/16)' },
    { name: '低压配电柜', ratio: '(0/16)' },
    { name: 'UPS电源', ratio: '(0/16)' },
    { name: '蓄电池组', ratio: '(0/16)' },
    { name: '电能质量仪', ratio: '(0/16)' },
    { name: '无功补偿装置', ratio: '(0/16)' },
    { name: '谐波过滤器', ratio: '(0/16)' },
    { name: '接地装置', ratio: '(0/16)' },
    { name: '避雷器', ratio: '(0/16)' },
    { name: '电力监控器', ratio: '(0/16)' },
    { name: '智能断路器', ratio: '(0/16)' },
  ],
}

const currentDevices = computed(() => allDeviceData[activeTab.value] || allDeviceData.monitor)

// 设备卡片背景图列表（bg9~bg20 对应 12 张卡片背景）
const deviceBgList = [bg9, bg10, bg11, bg12, bg13, bg14, bg15, bg16, bg17, bg18, bg19, bg20]

// 设备卡片图标列表（icon5~icon16 对应 12 个设备图标）
const deviceIconList = [icon5, icon6, icon7, icon8, icon9, icon10, icon11, icon12, icon13, icon14, icon15, icon16]

// onload 事件
const emitLoadEvent = () => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-max-1785981394966-e19214f4-onload', {
      componentId: 'mc-max-1785981394966-e19214f4',
      timestamp: Date.now()
    })
  }
}

onMounted(() => {
  emitLoadEvent()
})
</script>
