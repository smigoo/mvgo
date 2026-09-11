<script setup>
import { ref, computed, onMounted } from 'vue'
import HeaderStats from './components/HeaderStats.vue'
import DeviceTabs from './components/DeviceTabs.vue'
import DeviceGrid from './components/DeviceGrid.vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 头部统计数据 ===
const headerStats = ref([
  {
    label: '设备类型',
    value: '28',
    valueColor: 'rgba(25, 144, 255, 1)'
  },
  {
    label: '设备总数',
    value: '68562',
    valueColor: 'rgba(25, 144, 255, 1)'
  },
  {
    label: '完好率',
    value: '98%',
    valueColor: 'rgba(8, 163, 165, 1)'
  }
])
// === Tab选项 ===
const deviceTabs = ref([
  {
    key: 'tunnel',
    label: '隧道设备',
    totalCount: 56302,
    errorCount: 5
  },
  {
    key: 'building',
    label: '房建管维设备',
    totalCount: 1280,
    errorCount: 3
  }
])
// === 当前激活的Tab ===
const activeTab = ref('tunnel')
// === 隧道设备列表 ===
const tunnelDevices = ref([
  {
    name: '摄像机',
    icon: 'icon1',
    errorCount: 2,
    totalCount: 484
  },
  {
    name: '风速风向仪',
    icon: 'icon2',
    errorCount: 1,
    totalCount: 484
  },
  {
    name: '超高检测器',
    icon: 'icon3',
    errorCount: 0,
    totalCount: 484
  },
  {
    name: '烟雾机器人',
    icon: 'icon4',
    errorCount: 0,
    totalCount: 484
  },
  {
    name: '激光雷达',
    icon: 'icon5',
    errorCount: 0,
    totalCount: 484
  },
  {
    name: 'CO传感器',
    icon: 'icon6',
    errorCount: 0,
    totalCount: 484
  },
  {
    name: 'CO/VI检测器',
    icon: 'icon7',
    errorCount: 0,
    totalCount: 484
  },
  {
    name: '温湿度传感器',
    icon: 'icon8',
    errorCount: 0,
    totalCount: 484
  },
  {
    name: '压力传感器',
    icon: 'icon9',
    errorCount: 0,
    totalCount: 484
  },
  {
    name: '光照度变送器',
    icon: 'icon10',
    errorCount: 0,
    totalCount: 484
  },
  {
    name: '紧急电话',
    icon: 'icon11',
    errorCount: 0,
    totalCount: 484
  },
  {
    name: '水质监测设备',
    icon: 'icon12',
    errorCount: 0,
    totalCount: 484
  }
])
// === 房建管维设备列表 ===
const buildingDevices = ref([
  {
    name: '摄像机',
    icon: 'icon1',
    errorCount: 1,
    totalCount: 320
  },
  {
    name: '风速风向仪',
    icon: 'icon2',
    errorCount: 0,
    totalCount: 320
  },
  {
    name: '超高检测器',
    icon: 'icon3',
    errorCount: 0,
    totalCount: 320
  },
  {
    name: '烟雾机器人',
    icon: 'icon4',
    errorCount: 0,
    totalCount: 320
  },
  {
    name: '激光雷达',
    icon: 'icon5',
    errorCount: 0,
    totalCount: 320
  },
  {
    name: 'CO传感器',
    icon: 'icon6',
    errorCount: 0,
    totalCount: 320
  },
  {
    name: 'CO/VI检测器',
    icon: 'icon7',
    errorCount: 1,
    totalCount: 320
  },
  {
    name: '温湿度传感器',
    icon: 'icon8',
    errorCount: 0,
    totalCount: 320
  },
  {
    name: '压力传感器',
    icon: 'icon9',
    errorCount: 0,
    totalCount: 320
  },
  {
    name: '光照度变送器',
    icon: 'icon10',
    errorCount: 0,
    totalCount: 320
  },
  {
    name: '紧急电话',
    icon: 'icon11',
    errorCount: 1,
    totalCount: 320
  },
  {
    name: '水质监测设备',
    icon: 'icon12',
    errorCount: 0,
    totalCount: 320
  }
])
// === 当前显示的设备列表（根据activeTab计算） ===
const currentDevices = computed(() => {
  return activeTab.value === 'tunnel' ? tunnelDevices.value : buildingDevices.value
})
// === Tab切换处理 ===
const handleTabChange = (tabKey) => {
  activeTab.value = tabKey
}
// === 组件加载事件 ===
onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>