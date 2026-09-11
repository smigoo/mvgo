<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'

// 一次调用 $mcComponentBuilder 并直接解构，禁止多次调用
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 左侧导航 Tab 默认选中项
const activeTab = ref('监控')

// 左侧导航 Tab 配置（文字全部逐字来自设计稿文字清单）
const tabs = [
  { name: '监控', badge: null, page: '3/3740' },
  { name: '照明', badge: '3', page: null },
  { name: '通风', badge: null, page: null },
  { name: '供配电', badge: null, page: null },
  { name: '消防', badge: null, page: null },
  { name: '交通诱导', badge: null, page: null }
]

// 设备网格数据（文字与数值逐字来自设计稿文字清单）
const devices = ref([
  { name: '摄像机', count: '(2/484)', countClass: 'c-monitor-device-count--blue' },
  { name: '风速风向仪', count: '(1/484)', countClass: 'c-monitor-device-count--danger' },
  { name: '超高检测器', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: '烟道机器人', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: '激光雷达', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: 'CO2传感器', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: 'CO/VI检测器', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: '温湿度传感器', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: '压力传感器', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: '光照度变送器', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: '紧急电话', count: '(0/484)', countClass: 'c-monitor-device-count--info' },
  { name: '水质监测设备', count: '(0/484)', countClass: 'c-monitor-device-count--info' }
])

// 监听左侧 Tab 切换（tab-switch 交互）
// 设计稿未提供不同 Tab 下设备网格数据差异，因此不臆造具体数据变化逻辑
watch(activeTab, () => {
  // 状态切换已由 a-tabs 的 v-model:activeKey 完成
  // 此处保留扩展点：后续可根据 activeTab 从后端拉取对应设备分类数据
})

onMounted(() => {
  // 触发组件加载完成事件
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})

onUnmounted(() => {
  // 当前脚本无 listenEvent，无需清理
})
</script>
```