<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'

// --- $mcComponentBuilder 初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[c-monitor] $mcComponentBuilder 失败:', e)
}

// --- 顶部统计数据 ---
const deviceTypeCount = ref(12)
const totalDeviceCount = ref(1024)
const integrityRate = ref('98.5%')

// --- 隧道设备数据 ---
const tunnelOnline = ref(450)
const tunnelOffline = ref(12)
const tunnelFault = ref(3)

// --- 南北接线设备数据 ---
const junctionOnline = ref(320)
const junctionOffline = ref(8)
const junctionFault = ref(1)

// --- 导航Tab数据 ---
const navTabs = ref([
  { key: 'all', label: '全部' },
  { key: 'camera', label: '摄像机' },
  { key: 'detector', label: '检测器' },
  { key: 'sign', label: '情报板' },
  { key: 'light', label: '照明' }
])
const activeNav = ref('all')

// --- 设备列表数据（联动Tab切换） ---
const deviceList = computed(() => {
  const allDevices = [
    { key: '1', icon: icon1, name: '高清摄像机', status: '在线', statusClass: 'status-online' },
    { key: '2', icon: icon2, name: '微波检测器', status: '在线', statusClass: 'status-online' },
    { key: '3', icon: icon3, name: 'CO检测器', status: '离线', statusClass: 'status-offline' },
    { key: '4', icon: icon4, name: '情报板', status: '故障', statusClass: 'status-fault' },
    { key: '5', icon: icon5, name: '照明控制器', status: '在线', statusClass: 'status-online' },
    { key: '6', icon: icon6, name: '火灾报警器', status: '在线', statusClass: 'status-online' },
    { key: '7', icon: icon7, name: '车道指示器', status: '离线', statusClass: 'status-offline' },
    { key: '8', icon: icon8, name: '风速仪', status: '在线', statusClass: 'status-online' }
  ]
  
  if (activeNav.value === 'all') {
    return allDevices
  }
  
  const typeMap = {
    'camera': ['高清摄像机'],
    'detector': ['微波检测器', 'CO检测器', '风速仪'],
    'sign': ['情报板'],
    'light': ['照明控制器', '车道指示器']
  }
  
  const filterNames = typeMap[activeNav.value] || []
  return allDevices.filter(d => filterNames.includes(d.name))
})

// --- 生命周期 ---
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'c-monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理监听或定时器
})
</script>