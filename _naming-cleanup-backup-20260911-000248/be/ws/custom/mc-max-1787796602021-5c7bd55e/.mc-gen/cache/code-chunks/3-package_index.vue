<script setup>
import { ref, onMounted } from 'vue'

// 微码组件构建器：只能调用一次，直接解构
const { runtimeBuilder } = $mcComponentBuilder()

// 左侧垂直 Tab 导航（监控/照明/通风/供配电/消防/交通诱导）
const monitorTabs = ref([
  { name: '监控', active: true, badge: '' },
  { name: '照明', active: false, badge: '3' },
  { name: '通风', active: false, badge: '' },
  { name: '供配电', active: false, badge: '' },
  { name: '消防', active: false, badge: '' },
  { name: '交通诱导', active: false, badge: '' }
])

// 默认设备列表（监控分类，数据/颜色/图标均来自设计稿）
const defaultDevices = [
  { name: '摄像机', abnormal: 2, countColor: 'danger', icon: icon27 },
  { name: '风速风向仪', abnormal: 1, countColor: 'danger', icon: icon76 },
  { name: '超高检测器', abnormal: 0, countColor: 'normal', icon: icon112 },
  { name: '烟道机器人', abnormal: 0, countColor: 'normal', icon: icon29 },
  { name: '激光雷达', abnormal: 0, countColor: 'normal', icon: icon64 },
  { name: 'CO2传感器', abnormal: 0, countColor: 'normal', icon: icon124 },
  { name: 'CO/VI检测器', abnormal: 0, countColor: 'normal', icon: icon40 },
  { name: '温湿度传感器', abnormal: 0, countColor: 'normal', icon: icon88 },
  { name: '压力传感器', abnormal: 0, countColor: 'normal', icon: icon136 },
  { name: '光照度变送器', abnormal: 0, countColor: 'normal', icon: icon52 },
  { name: '紧急电话', abnormal: 0, countColor: 'normal', icon: icon100 },
  { name: '水质监测设备', abnormal: 0, countColor: 'normal', icon: icon148 }
]

// 当前展示的设备网格（Tab 切换时联动刷新）
const monitorDevices = ref([...defaultDevices])

// 切换设备分类：更新 Tab 激活态 + 刷新设备网格
const handleMonitorTabChange = (name) => {
  monitorTabs.value.forEach((tab) => {
    tab.active = tab.name === name
  })
  // 仅“监控”分类有设计稿设备数据，其余分类无数据证据时展示空列表
  monitorDevices.value = name === '监控' ? [...defaultDevices] : []
}

// 组件加载完成事件
const emitMonitorLoad = () => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitMonitorLoad()
})
</script>