<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

let mcContext = {}
try {
  mcContext = $mcComponentBuilder()
} catch (error) {
  console.error('微码组件初始化失败:', error)
}

const {
  componentProps = {},
  businessProps = {},
  runtimeBuilder = null,
  componentApi = null
} = mcContext

const activeOverview = ref('tunnel')
const activeCategory = ref('monitor')

const overviewCards = ref([
  {
    key: 'tunnel',
    title: '隧道设备',
    total: '56302',
    abnormal: '5',
    icon: icon10
  },
  {
    key: 'connection',
    title: '南北接线\n设备',
    total: '1280',
    abnormal: '3',
    icon: icon16
  }
])

const categoryTabs = ref([
  { key: 'monitor', label: '监控', count: '3/3740' },
  { key: 'lighting', label: '照明', count: '3' },
  { key: 'ventilation', label: '通风', count: '' },
  { key: 'fire', label: '消防', count: '' },
  { key: 'traffic', label: '交通诱导', count: '' },
  { key: 'power', label: '供配电', count: '' }
])

const deviceDataMap = {
  monitor: [
    { name: '摄像机', value: '(2/484)', icon: icon28, iconVisible: true },
    { name: '烟道机器人', value: '(0/484)', icon: icon29, iconVisible: true },
    { name: 'CO/VI检测器', value: '(0/484)', icon: icon41, iconVisible: true },
    { name: '光照度变送器', value: '(0/484)', icon: icon53, iconVisible: true },
    { name: '激光雷达', value: '(0/484)', icon: icon65, iconVisible: true },
    { name: '风速风向仪', value: '(1/484)', icon: icon77, iconVisible: true },
    { name: '温湿度传感器', value: '(0/484)', icon: icon89, iconVisible: true },
    { name: '紧急电话', value: '(0/484)', icon: icon101, iconVisible: true },
    { name: '超高检测器', value: '(0/484)', icon: icon113, iconVisible: true },
    { name: 'CO2传感器', value: '(0/484)', icon: icon125, iconVisible: true },
    { name: '压力传感器', value: '(0/484)', icon: icon137, iconVisible: true },
    { name: '水质监测设备', value: '(0/484)', icon: icon149, iconVisible: true }
  ],
  lighting: [
    { name: '摄像机', value: '(2/484)', icon: icon28, iconVisible: true },
    { name: '烟道机器人', value: '(0/484)', icon: icon29, iconVisible: true },
    { name: '光照度变送器', value: '(0/484)', icon: icon53, iconVisible: true }
  ],
  ventilation: [],
  fire: [],
  traffic: [],
  power: []
}

const currentDeviceList = computed(() => deviceDataMap[activeCategory.value] || [])

const handleOverviewChange = (key) => {
  if (activeOverview.value === key) return
  activeOverview.value = key
}

const handleCategoryChange = (key) => {
  if (activeCategory.value === key) return
  activeCategory.value = key
}

watch(activeOverview, (key) => {
  runtimeBuilder?.publishEvent?.('monitor-overview-change', {
    overviewKey: key,
    timestamp: Date.now()
  })
})

watch(activeCategory, (key) => {
  runtimeBuilder?.publishEvent?.('monitor-category-change', {
    categoryKey: key,
    timestamp: Date.now()
  })
})

onMounted(() => {
  runtimeBuilder?.publishEvent?.('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {})
</script>