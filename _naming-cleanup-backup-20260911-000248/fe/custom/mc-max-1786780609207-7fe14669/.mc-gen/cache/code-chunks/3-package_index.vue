<script setup>
import { ref, defineAsyncComponent } from 'vue'

const MonitorStats = defineAsyncComponent(() => import('./components/MonitorStats.vue'))
const MonitorTrend = defineAsyncComponent(() => import('./components/MonitorTrend.vue'))
const MonitorDistribution = defineAsyncComponent(() => import('./components/MonitorDistribution.vue'))

let runtimeBuilder = null
let componentProps = {}

try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
  componentProps = builder?.componentProps || {}
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 失败:', e)
}

const timeTabs = [
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' }
]

const activeTimeTab = ref('24h')

const statsData = ref([
  { label: '总流量', value: '12,458', unit: '辆' },
  { label: '客车流量', value: '8,234', unit: '辆' },
  { label: '货车流量', value: '4,224', unit: '辆' }
])

const trendRef = ref(null)
const distributionRef = ref(null)

const handleTabChange = (value) => {
  if (activeTimeTab.value === value) return
  activeTimeTab.value = value
}
</script>