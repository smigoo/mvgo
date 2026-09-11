<template>
  <base-panel panelKey="default-panel">
    <div class="c-monitor-root" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
      <TotalTraffic />
      <TunnelChart />
      <BridgeChart />
      <VehicleType />
      <FlowForecast />
    </div>
  </base-panel>
</template>

<script setup>
import bg1 from '../resources/images/bg-_m-34.png'


import TotalTraffic from './components/TotalTraffic.vue'

import TunnelChart from './components/TunnelChart.vue'

import BridgeChart from './components/BridgeChart.vue'

import VehicleType from './components/VehicleType.vue'

import FlowForecast from './components/FlowForecast.vue'

import declareJson from '../declare.json'

// --- 框架初始化 ---

let componentProps = {}

let businessProps = {}

let componentApi = null

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentProps = builder?.componentProps || {}
  businessProps = builder?.businessProps || {}
  componentApi = builder?.componentApi
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 失败:', e)
}

// --- 配置读取 ---

const declareDefaults = {}

if (declareJson?.businessConfig && Array.isArray(declareJson.businessConfig)) {
  declareJson.businessConfig.forEach((item) => {
    if (item?.key && item.default !== undefined) {
      declareDefaults[item.key] = item.default
    }
  })
}

function getConfig(key, defaultValue) {
  const value = businessProps?.[key]
  if (value !== undefined && value !== null) {
    return value
  }
  if (declareDefaults[key] !== undefined && declareDefaults[key] !== null) {
    return declareDefaults[key]
  }
  return defaultValue
}

const config = computed(() => ({
  dataRefreshInterval: getConfig('dataRefreshInterval', 60000),
  showTimeSelector: getConfig('showTimeSelector', true)
}))

// --- 响应式状态 ---

const theme = computed(() => componentProps?.themeType || 'light')

// --- 依赖注入 ---

if (componentApi) {
  provide('componentApi', componentApi)
}

provide('componentProps', componentProps)

provide('businessProps', businessProps)

provide('config', config)

// --- 运行时构建器初始化（try-catch 防止框架未就绪） ---

let runtimeBuilder = null;

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null;
  runtimeBuilder = builder?.runtimeBuilder || null;
} catch (e) {
  console.warn('[monitor] $mcComponentBuilder 初始化失败:', e);
}

// --- 生命周期钩子 ---

onMounted(() => {
  // 触发组件加载完成事件（供框架或外部监听）
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'c-monitor',
      timestamp: Date.now()
    });
  }
});

onUnmounted(() => {
  // 根组件无全局监听需要清理，保留空实现以符合规范
});
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';
</style>