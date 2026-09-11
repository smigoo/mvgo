<script setup>
import { ref, reactive, computed, watch, provide } from 'vue'
import TotalTraffic from './components/TotalTraffic.vue'
import TunnelChart from './components/TunnelChart.vue'
import BridgeChart from './components/BridgeChart.vue'
import VehicleType from './components/VehicleType.vue'
import FlowForecast from './components/FlowForecast.vue'
import declareJson from '../declare.json'

// --- 框架初始化 ---
let runtimeBuilder = null
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
</script>