<script setup>
import { ref, onMounted, computed } from 'vue'

// 1. 调用 $mcComponentBuilder 并解构（声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 概览卡片数据 ===
const overviewCards = ref([
  {
    key: 'tunnel',
    name: '隧道设备',
    total: '56302',
    abnormal: '5',
    bg: '',
    icon: '',
    decorations: []
  },
  {
    key: 'cable',
    name: '南北接线 / 设备',
    total: '1280',
    abnormal: '3',
    bg: '',
    icon: '',
    decorations: []
  }
])

const activeOverview = ref('tunnel')

const handleOverviewChange = (key) => {
  activeOverview.value = key
}
// === 分类 Tabs 数据 ===
const categoryTabs = ref([
  { key: 'monitor', label: '监控', count: '3/3740' },
  { key: 'lighting', label: '照明', count: '' },
  { key: 'ventilation', label: '通风', count: '' },
  { key: 'fire', label: '消防', count: '' },
  { key: 'traffic', label: '交通诱导', count: '' },
  { key: 'power', label: '供配电', count: '' }
])

const activeCategory = ref('monitor')
// === 设备列表数据 ===
const allDevices = {
  monitor: [
    { key: 'camera', name: '摄像机', value: '(2/484)', bg: '', icon: '', decorations: [] },
    { key: 'robot', name: '烟道机器人', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'co_vi', name: 'CO/VI检测器', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'light', name: '光照度变送器', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'radar', name: '激光雷达', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'wind', name: '风速风向仪', value: '(1/484)', bg: '', icon: '', decorations: [] },
    { key: 'temp', name: '温湿度传感器', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'phone', name: '紧急电话', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'height', name: '超高检测器', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'co2', name: 'CO2传感器', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'pressure', name: '压力传感器', value: '(0/484)', bg: '', icon: '', decorations: [] },
    { key: 'water', name: '水质监测设备', value: '(0/484)', bg: '', icon: '', decorations: [] }
  ],
  lighting: [],
  ventilation: [],
  fire: [],
  traffic: [],
  power: []
}

const visibleDevices = computed(() => {
  return allDevices[activeCategory.value] || []
})

const handleCategoryChange = (key) => {
  activeCategory.value = key
}
// === 生命周期 ===
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>