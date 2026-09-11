<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

// --- 框架初始化 ---
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[c-device-monitor] $mcComponentBuilder 失败:', e)
}

// --- 导航与设备数据 ---
const navTabs = ref([
  { key: 'all', label: '全部' },
  { key: 'tunnel', label: '隧道设备' },
  { key: 'nanbei', label: '南北接线设备' }
])

const activeNavTab = ref('all')

const deviceList = ref([
  { id: 1, name: '高清摄像机', status: '在线', icon: icon1, category: 'tunnel' },
  { id: 2, name: '射流风机', status: '在线', icon: icon2, category: 'tunnel' },
  { id: 3, name: 'CO检测器', status: '离线', icon: icon3, category: 'tunnel' },
  { id: 4, name: '紧急电话', status: '在线', icon: icon4, category: 'nanbei' },
  { id: 5, name: '光纤收发器', status: '在线', icon: icon5, category: 'nanbei' },
  { id: 6, name: 'PLC控制柜', status: '离线', icon: icon1, category: 'nanbei' }
])

const filteredDeviceList = computed(() => {
  if (activeNavTab.value === 'all') {
    return deviceList.value
  }
  return deviceList.value.filter(device => device.category === activeNavTab.value)
})

// --- 生命周期 ---
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('c-device-monitor-onload', {
      componentId: 'c-device-monitor',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理逻辑
})
</script>