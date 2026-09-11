<script setup>
import { onMounted } from 'vue'
import TotalTrafficSection from './components/TotalTrafficSection.vue'
import TrafficBarSection from './components/TrafficBarSection.vue'
import VehicleTypeSection from './components/VehicleTypeSection.vue'
import ForecastSection from './components/ForecastSection.vue'

// 微码运行时初始化（仅此一次调用，直接解构）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 组件常量：运行时事件标识
const COMPONENT_ID = 'c-monitor'
const MONITOR_ONLOAD_EVENT = 'monitor-onload'
</script>