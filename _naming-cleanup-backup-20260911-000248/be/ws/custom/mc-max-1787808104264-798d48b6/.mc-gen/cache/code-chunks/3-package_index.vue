<script setup>
import { ref, onMounted } from 'vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const tabs = ref([
  { label: '监控', count: '3/3740' },
  { label: '照明', count: '3' },
  { label: '通风' },
  { label: '消防' },
  { label: '交通诱导' },
  { label: '供配电' }
])
const activeTabIndex = ref(0)

const devices = ref([
  { name: '摄像机', value: '(2/484)' },
  { name: '烟道机器人', value: '(0/484)' },
  { name: 'CO/VI检测器', value: '(0/484)' },
  { name: '光照度变送器', value: '(0/484)' },
  { name: '激光雷达', value: '(0/484)' },
  { name: '风速风向仪', value: '(1/484)' },
  { name: '温湿度传感器', value: '(0/484)' },
  { name: '紧急电话', value: '(0/484)' },
  { name: '超高检测器', value: '(0/484)' },
  { name: 'CO2传感器', value: '(0/484)' },
  { name: '压力传感器', value: '(0/484)' },
  { name: '水质监测设备', value: '(0/484)' }
])

onMounted(() => {
  runtimeBuilder.publishEvent('device-monitor-onload', {
    componentId: 'device-monitor',
    timestamp: Date.now()
  })
})
</script>