<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

let mcBuilderResult = {}
try {
  mcBuilderResult = $mcComponentBuilder()
} catch (error) {
  console.error('微码组件初始化失败:', error)
}

const { componentProps, businessProps, runtimeBuilder, componentApi } = mcBuilderResult

const activeOverviewKey = ref('tunnel')
const activeCategoryKey = ref('monitor')

const overviewCards = ref([
  {
    key: 'tunnel',
    label: '隧道设备',
    total: '56302',
    error: '5',
    iconParts: [
      { key: 'active-left-arc', src: icon5, className: 'c-c-monitor-overview-icon-part--left-arc' },
      { key: 'active-left-dot', src: icon6, className: 'c-c-monitor-overview-icon-part--left-dot' },
      { key: 'active-right-arc', src: icon7, className: 'c-c-monitor-overview-icon-part--right-arc' },
      { key: 'active-right-dot', src: icon8, className: 'c-c-monitor-overview-icon-part--right-dot' },
      { key: 'active-circle', src: icon9, className: 'c-c-monitor-overview-icon-part--circle' },
      { key: 'active-symbol', src: icon10, className: 'c-c-monitor-overview-icon-part--symbol' }
    ]
  },
  {
    key: 'connector',
    label: '南北接线\n设备',
    total: '1280',
    error: '3',
    iconParts: [
      { key: 'default-left-arc', src: icon11, className: 'c-c-monitor-overview-icon-part--left-arc' },
      { key: 'default-left-dot', src: icon12, className: 'c-c-monitor-overview-icon-part--left-dot' },
      { key: 'default-right-arc', src: icon13, className: 'c-c-monitor-overview-icon-part--right-arc' },
      { key: 'default-right-dot', src: icon14, className: 'c-c-monitor-overview-icon-part--right-dot' },
      { key: 'default-circle', src: icon15, className: 'c-c-monitor-overview-icon-part--circle' },
      { key: 'default-symbol', src: icon16, className: 'c-c-monitor-overview-icon-part--symbol' }
    ]
  }
])

const categoryTabs = ref([
  { key: 'monitor', label: '监控\n3/3740' },
  { key: 'lighting', label: '照明\n3' },
  { key: 'ventilation', label: '通风' },
  { key: 'fire', label: '消防' },
  { key: 'traffic-guide', label: '交通诱导' },
  { key: 'power', label: '供配电' }
])

const deviceDataMap = {
  monitor: [
    { key: 'camera', name: '摄像机', value: '(2/484)', icon: icon28 },
    { key: 'robot', name: '烟道机器人', value: '(0/484)', icon: icon29 },
    { key: 'co-vi', name: 'CO/VI检测器', value: '(0/484)', icon: icon41 },
    { key: 'light', name: '光照度变送器', value: '(0/484)', icon: icon53 },
    { key: 'laser', name: '激光雷达', value: '(0/484)', icon: icon65 },
    { key: 'wind', name: '风速风向仪', value: '(1/484)', icon: icon77 },
    { key: 'temperature', name: '温湿度传感器', value: '(0/484)', icon: icon89 },
    { key: 'phone', name: '紧急电话', value: '(0/484)', icon: icon101 },
    { key: 'height', name: '超高检测器', value: '(0/484)', icon: icon113 },
    { key: 'co2', name: 'CO2传感器', value: '(0/484)', icon: icon125 },
    { key: 'pressure', name: '压力传感器', value: '(0/484)', icon: icon137 },
    { key: 'water', name: '水质监测设备', value: '(0/484)', icon: icon149 }
  ],
  lighting: [
    { key: 'camera', name: '摄像机', value: '(2/484)', icon: icon28 },
    { key: 'light', name: '光照度变送器', value: '(0/484)', icon: icon53 },
    { key: 'power', name: '供配电', value: '(1/484)', icon: icon16 }
  ],
  ventilation: [
    { key: 'wind', name: '风速风向仪', value: '(1/484)', icon: icon77 },
    { key: 'co-vi', name: 'CO/VI检测器', value: '(0/484)', icon: icon41 },
    { key: 'co2', name: 'CO2传感器', value: '(0/484)', icon: icon125 }
  ],
  fire: [
    { key: 'phone', name: '紧急电话', value: '(0/484)', icon: icon101 },
    { key: 'pressure', name: '压力传感器', value: '(0/484)', icon: icon137 },
    { key: 'water', name: '水质监测设备', value: '(0/484)', icon: icon149 }
  ],
  'traffic-guide': [
    { key: 'camera', name: '摄像机', value: '(2/484)', icon: icon28 },
    { key: 'laser', name: '激光雷达', value: '(0/484)', icon: icon65 },
    { key: 'height', name: '超高检测器', value: '(0/484)', icon: icon113 }
  ],
  power: [
    { key: 'power', name: '供配电', value: '(0/484)', icon: icon16 },
    { key: 'temperature', name: '温湿度传感器', value: '(0/484)', icon: icon89 },
    { key: 'pressure', name: '压力传感器', value: '(0/484)', icon: icon137 }
  ]
}

const currentDeviceCards = computed(() => deviceDataMap[activeCategoryKey.value] || deviceDataMap.monitor)

const handleOverviewChange = (key) => {
  activeOverviewKey.value = key
}

const handleCategoryChange = (key) => {
  activeCategoryKey.value = key
}

const publishChangeEvent = (eventId, payload) => {
  if (!runtimeBuilder?.publishEvent) return
  runtimeBuilder.publishEvent(eventId, payload)
}

watch(activeOverviewKey, (key) => {
  publishChangeEvent('monitor-overview-change', {
    componentId: 'monitor',
    activeKey: key,
    timestamp: Date.now()
  })
})

watch(activeCategoryKey, (key) => {
  publishChangeEvent('monitor-category-change', {
    componentId: 'monitor',
    activeKey: key,
    timestamp: Date.now()
  })
})

let refreshTimer = null

onMounted(() => {
  if (runtimeBuilder?.publishEvent) {
    runtimeBuilder.publishEvent('monitor-onload', {
      componentId: 'monitor',
      timestamp: Date.now()
    })
  }

  refreshTimer = window.setInterval(() => {
    publishChangeEvent('monitor-refresh', {
      componentId: 'monitor',
      activeOverviewKey: activeOverviewKey.value,
      activeCategoryKey: activeCategoryKey.value,
      timestamp: Date.now()
    })
  }, 60000)
})

onUnmounted(() => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>