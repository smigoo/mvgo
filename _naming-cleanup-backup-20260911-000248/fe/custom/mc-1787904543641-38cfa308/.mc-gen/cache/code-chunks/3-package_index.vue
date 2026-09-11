<script setup>
import { ref, onMounted } from 'vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 左侧分类 Tab 列表（监控/照明/通风/供配电/消防/交通诱导） ===
const tabs = ref([
  { label: '监控', badge: '3/3740' },
  { label: '照明', badge: '3' },
  { label: '通风' },
  { label: '供配电' },
  { label: '消防' },
  { label: '交通诱导' }
])
// === 当前激活的分类 ===
const activeTab = ref('监控')
// === 设备网格列表（异常数/总数，数据来自设计稿文字清单） ===
const deviceList = ref([
  { name: '摄像机', count: '(2/484)' },
  { name: '风速风向仪', count: '(1/484)' },
  { name: '超高检测器', count: '(0/484)' },
  { name: '烟道机器人', count: '(0/484)' },
  { name: '激光雷达', count: '(0/484)' },
  { name: 'CO2传感器', count: '(0/484)' },
  { name: 'CO/VI检测器', count: '(0/484)' },
  { name: '温湿度传感器', count: '(0/484)' },
  { name: '压力传感器', count: '(0/484)' },
  { name: '光照度变送器', count: '(0/484)' },
  { name: '紧急电话', count: '(0/484)' },
  { name: '水质监测设备', count: '(0/484)' }
])
// === 组件加载完成事件 ===
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>