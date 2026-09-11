<template>
  <base-panel panelKey="default-panel">
    <!-- 标题栏右侧统计指标 -->
    <template #header-right>
      <div class="c-mc-max-1785989464992-3d0e83bb-header-stats">
        <!-- Fixed: 使用响应式数据驱动统计数值 -->
        <dl class="c-mc-max-1785989464992-3d0e83bb-stat-group">
          <dt class="c-mc-max-1785989464992-3d0e83bb-stat-label">设备类型</dt>
          <!-- Fixed: aria-label提升可访问性 -->
          <dd
            class="c-mc-max-1785989464992-3d0e83bb-stat-value"
            :aria-label="'设备类型：' + deviceTypeCount"
          >{{ deviceTypeCount }}</dd>
        </dl>
        <dl class="c-mc-max-1785989464992-3d0e83bb-stat-group">
          <dt class="c-mc-max-1785989464992-3d0e83bb-stat-label">设备总数</dt>
          <dd
            class="c-mc-max-1785989464992-3d0e83bb-stat-value"
            :aria-label="'设备总数：' + deviceTotalCount"
          >{{ deviceTotalCount }}</dd>
        </dl>
        <dl class="c-mc-max-1785989464992-3d0e83bb-stat-group">
          <dt class="c-mc-max-1785989464992-3d0e83bb-stat-label">完好率</dt>
          <dd
            class="c-mc-max-1785989464992-3d0e83bb-stat-value c-mc-max-1785989464992-3d0e83bb-stat-value--health"
            :aria-label="'完好率：' + healthRate"
          >{{ healthRate }}</dd>
        </dl>
        <!-- Fixed: icon2为功能性设置按钮，包裹在button中 -->
        <button
          class="c-mc-max-1785989464992-3d0e83bb-setting-btn"
          aria-label="设置"
          title="设置"
        >
          <img :src="icon2" alt="" role="presentation" width="16" height="16" />
        </button>
      </div>
    </template>

    <!-- 默认插槽：业务内容区 -->
    <!-- Fixed: 使用bg1背景图，问题17修复 -->
    <div
      class="c-mc-max-1785989464992-3d0e83bb-body"
      :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <!-- 切换区域：隧道设备 / 南北接线设备 -->
      <div class="c-mc-max-1785989464992-3d0e83bb-switch-area">
        <div
          class="c-mc-max-1785989464992-3d0e83bb-switch-item"
          :class="{ 'is-active': activeSwitch === 'tunnel' }"
          :style="activeSwitch === 'tunnel'
            ? { backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }
            : { backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          @click="activeSwitch = 'tunnel'"
        >
          <span class="c-mc-max-1785989464992-3d0e83bb-switch-title"
            :class="activeSwitch === 'tunnel' ? 'c-mc-max-1785989464992-3d0e83bb-switch-title--active' : 'c-mc-max-1785989464992-3d0e83bb-switch-title--default'"
          >隧道设备</span>
          <div class="c-mc-max-1785989464992-3d0e83bb-switch-stats">
            <div class="c-mc-max-1785989464992-3d0e83bb-switch-line">
              <span class="c-mc-max-1785989464992-3d0e83bb-switch-stat-label">总数:</span>
              <span class="c-mc-max-1785989464992-3d0e83bb-switch-stat-num">{{ switchData.tunnel.total }}</span>
            </div>
            <div class="c-mc-max-1785989464992-3d0e83bb-switch-line">
              <span class="c-mc-max-1785989464992-3d0e83bb-switch-stat-label">异常数:</span>
              <span class="c-mc-max-1785989464992-3d0e83bb-switch-stat-num">{{ switchData.tunnel.abnormal }}</span>
            </div>
          </div>
          <img :src="icon3" alt="" role="presentation" class="c-mc-max-1785989464992-3d0e83bb-switch-icon" width="35" height="28" />
        </div>

        <div
          class="c-mc-max-1785989464992-3d0e83bb-switch-item"
          :class="{ 'is-active': activeSwitch === 'junction' }"
          :style="activeSwitch === 'junction'
            ? { backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }
            : { backgroundImage: `url(${bg3})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          @click="activeSwitch = 'junction'"
        >
          <span class="c-mc-max-1785989464992-3d0e83bb-switch-title"
            :class="activeSwitch === 'junction' ? 'c-mc-max-1785989464992-3d0e83bb-switch-title--active' : 'c-mc-max-1785989464992-3d0e83bb-switch-title--default'"
          >南北接线 设备</span>
          <div class="c-mc-max-1785989464992-3d0e83bb-switch-stats">
            <div class="c-mc-max-1785989464992-3d0e83bb-switch-line">
              <span class="c-mc-max-1785989464992-3d0e83bb-switch-stat-label">总数:</span>
              <span class="c-mc-max-1785989464992-3d0e83bb-switch-stat-num">{{ switchData.junction.total }}</span>
            </div>
            <div class="c-mc-max-1785989464992-3d0e83bb-switch-line">
              <span class="c-mc-max-1785989464992-3d0e83bb-switch-stat-label">异常数:</span>
              <span class="c-mc-max-1785989464992-3d0e83bb-switch-stat-num">{{ switchData.junction.abnormal }}</span>
            </div>
          </div>
          <img :src="icon4" alt="" role="presentation" class="c-mc-max-1785989464992-3d0e83bb-switch-icon" width="35" height="28" />
        </div>
      </div>

      <!-- 右侧：纵向Tab + 设备卡片网格 -->
      <div class="c-mc-max-1785989464992-3d0e83bb-main-area">
        <!-- 纵向Tab栏 -->
        <div class="c-mc-max-1785989464992-3d0e83bb-tab-bar">
          <div
            v-for="tab in tabList"
            :key="tab.key"
            class="c-mc-max-1785989464992-3d0e83bb-tab-item"
            :class="{ 'is-active': activeTab === tab.key }"
            :style="getTabBgStyle(tab)"
            @click="activeTab = tab.key"
            :aria-label="tab.label"
          >
            <span class="c-mc-max-1785989464992-3d0e83bb-tab-label">{{ tab.label }}</span>
            <span
              v-if="tab.badge"
              class="c-mc-max-1785989464992-3d0e83bb-tab-badge"
            >{{ tab.badge }}</span>
          </div>
        </div>

        <!-- 设备卡片网格 -->
        <div class="c-mc-max-1785989464992-3d0e83bb-device-grid">
          <div
            v-for="(device, index) in currentDevices"
            :key="device.name"
            class="c-mc-max-1785989464992-3d0e83bb-device-card"
            :style="{ backgroundImage: `url(${getDeviceBg(index)})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
          >
            <span class="c-mc-max-1785989464992-3d0e83bb-device-name">{{ device.name }}</span>
            <span class="c-mc-max-1785989464992-3d0e83bb-device-count">{{ device.count }}</span>
            <img
              v-if="getDeviceIcon(index)"
              :src="getDeviceIcon(index)"
              alt=""
              role="presentation"
              class="c-mc-max-1785989464992-3d0e83bb-device-icon"
              width="27"
              height="32"
            />
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'

// Fixed: $mcComponentBuilder 用 try-catch 包裹，问题3修复
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function'
    ? $mcComponentBuilder({
        componentId: 'mc-max-1785989464992-3d0e83bb',
        componentProps: {},
        componentName: 'mc-max-1785989464992-3d0e83bb'
      })
    : null
  runtimeBuilder = builder?.runtimeBuilder ?? null
} catch (e) {
  console.warn('[cp-设备监测] $mcComponentBuilder 失败:', e)
}

// Fixed: 统计数值改为响应式数据，问题11修复
const deviceTypeCount = ref(28)
const deviceTotalCount = ref(68562)
const healthRate = ref('98%')

// 切换状态：隧道设备 / 南北接线设备
const activeSwitch = ref('tunnel')

const switchData = ref({
  tunnel: { total: 56302, abnormal: 5 },
  junction: { total: 1280, abnormal: 3 }
})

// 纵向Tab数据
const activeTab = ref('monitor')

const tabList = ref([
  { key: 'monitor', label: '监控', badge: '3/3740' },
  { key: 'lighting', label: '照明', badge: '3' },
  { key: 'ventilation', label: '通风', badge: null },
  { key: 'fire', label: '消防', badge: null },
  { key: 'traffic', label: '交通诱导', badge: null },
  { key: 'power', label: '供配电', badge: null }
])

// 各Tab对应的设备卡片数据（监控类设备列表）
const devicesMap = ref({
  monitor: [
    { name: '摄像机', count: '(2/484)' },
    { name: '烟道机器人', count: '(0/484)' },
    { name: 'CO/VI检测器', count: '(0/484)' },
    { name: '光照度变送器', count: '(0/484)' },
    { name: '激光雷达', count: '(0/484)' },
    { name: '风速风向仪', count: '(1/484)' },
    { name: '温湿度传感器', count: '(0/484)' },
    { name: '紧急电话', count: '(0/484)' },
    { name: '超高检测器', count: '(0/484)' },
    { name: 'CO2传感器', count: '(0/484)' },
    { name: '压力传感器', count: '(0/484)' },
    { name: '水质监测设备', count: '(0/484)' }
  ],
  lighting: [
    { name: '照明控制器', count: '(0/120)' },
    { name: '灯光传感器', count: '(0/120)' },
    { name: '调光模块', count: '(0/120)' },
    { name: '配电箱', count: '(0/120)' },
    { name: '应急照明', count: '(0/120)' },
    { name: '照度仪', count: '(0/120)' },
    { name: '节能控制器', count: '(0/120)' },
    { name: '路灯控制器', count: '(0/120)' },
    { name: '照明主机', count: '(0/120)' },
    { name: '灯管', count: '(0/120)' },
    { name: '继电器', count: '(0/120)' },
    { name: '控制面板', count: '(0/120)' }
  ],
  ventilation: [
    { name: '风机', count: '(0/80)' },
    { name: '风阀', count: '(0/80)' },
    { name: '送风机', count: '(0/80)' },
    { name: '排风机', count: '(0/80)' },
    { name: '通风主机', count: '(0/80)' },
    { name: '风量传感器', count: '(0/80)' },
    { name: '风压传感器', count: '(0/80)' },
    { name: '控制器', count: '(0/80)' },
    { name: '变频器', count: '(0/80)' },
    { name: '电动风阀', count: '(0/80)' },
    { name: '新风机', count: '(0/80)' },
    { name: '回风机', count: '(0/80)' }
  ],
  fire: [
    { name: '烟感探测器', count: '(0/200)' },
    { name: '温感探测器', count: '(0/200)' },
    { name: '手动报警', count: '(0/200)' },
    { name: '喷淋系统', count: '(0/200)' },
    { name: '消防主机', count: '(0/200)' },
    { name: '灭火器', count: '(0/200)' },
    { name: '消防泵', count: '(0/200)' },
    { name: '防火门', count: '(0/200)' },
    { name: '应急广播', count: '(0/200)' },
    { name: '安全出口', count: '(0/200)' },
    { name: '灭火装置', count: '(0/200)' },
    { name: '报警器', count: '(0/200)' }
  ],
  traffic: [
    { name: '诱导屏', count: '(0/60)' },
    { name: '可变情报板', count: '(0/60)' },
    { name: '车速检测器', count: '(0/60)' },
    { name: '车辆检测器', count: '(0/60)' },
    { name: '信号控制机', count: '(0/60)' },
    { name: '违章抓拍', count: '(0/60)' },
    { name: '交通引导灯', count: '(0/60)' },
    { name: '超速检测', count: '(0/60)' },
    { name: '交通控制器', count: '(0/60)' },
    { name: '行人检测', count: '(0/60)' },
    { name: '路况感知', count: '(0/60)' },
    { name: '诱导灯', count: '(0/60)' }
  ],
  power: [
    { name: '变压器', count: '(0/40)' },
    { name: '配电柜', count: '(0/40)' },
    { name: '发电机', count: '(0/40)' },
    { name: 'UPS电源', count: '(0/40)' },
    { name: '电表', count: '(0/40)' },
    { name: '断路器', count: '(0/40)' },
    { name: '接触器', count: '(0/40)' },
    { name: '电缆', count: '(0/40)' },
    { name: '开关柜', count: '(0/40)' },
    { name: '母线槽', count: '(0/40)' },
    { name: '充电桩', count: '(0/40)' },
    { name: '供电主机', count: '(0/40)' }
  ]
})

const currentDevices = computed(() => devicesMap.value[activeTab.value] || [])

// 设备卡片背景图映射（bg9~bg20对应12张卡片背景）
const deviceBgList = [
  bg9, bg10, bg11, bg12, bg13, bg14,
  bg15, bg16, bg17, bg18, bg19, bg20
]

const getDeviceBg = (index) => {
  return deviceBgList[index % deviceBgList.length]
}

// 设备图标映射（icon5~icon16对应12个图标）
const deviceIconList = [
  icon5, icon6, icon7, icon8, icon9, icon10,
  icon11, icon12, icon13, icon14, icon15, icon16
]

const getDeviceIcon = (index) => {
  return deviceIconList[index % deviceIconList.length]
}

// Tab背景图样式
const getTabBgStyle = (tab) => {
  if (activeTab.value === tab.key) {
    return {
      backgroundImage: `url(${bg4})`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat'
    }
  }
  // 根据Tab高度选择对应bg
  if (tab.key === 'traffic') {
    return {
      backgroundImage: `url(${bg7})`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat'
    }
  }
  if (tab.key === 'power') {
    return {
      backgroundImage: `url(${bg8})`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat'
    }
  }
  return {
    backgroundImage: `url(${bg5})`,
    backgroundSize: '100% 100%',
    backgroundPosition: 'center center',
    backgroundRepeat: 'no-repeat'
  }
}

// Tab切换监听，数据联动
watch(activeTab, (newTab) => {
  // 切换Tab时可在此处触发数据请求
  console.log('[cp-设备监测] Tab切换至:', newTab)
})

// Fixed: onMounted中触发onload事件，问题6修复
onMounted(() => {
  runtimeBuilder?.publishEvent('mc-max-1785989464992-3d0e83bb-onload', {
    componentId: 'mc-max-1785989464992-3d0e83bb',
    timestamp: Date.now()
  })
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// 设置按钮样式（私有，不放common.less）
.c-mc-max-1785989464992-3d0e83bb-setting-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
  &:hover {
    opacity: 0.8;
  }
}
</style>