<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

// 系统自动注入的资源变量，此处声明以满足 Vue 模板编译器检查
const bg1 = (typeof window !== 'undefined' && window.bg1) || ''
const icon1 = (typeof window !== 'undefined' && window.icon1) || ''
const icon2 = (typeof window !== 'undefined' && window.icon2) || ''
const icon3 = (typeof window !== 'undefined' && window.icon3) || ''
const icon4 = (typeof window !== 'undefined' && window.icon4) || ''

// $mcComponentBuilder 初始化
let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[环境监测] $mcComponentBuilder 失败:', e)
}

// 环境监测指标数据
const envIndicators = ref([
  { icon: icon1, label: '温度', value: '24.5', unit: '℃' },
  { icon: icon2, label: '湿度', value: '65', unit: '%' },
  { icon: icon3, label: 'CO浓度', value: '12', unit: 'ppm' },
  { icon: icon4, label: '能见度', value: '150', unit: 'm' }
])

// 生命周期
onMounted(() => {
  if (runtimeBuilder) {
    runtimeBuilder.publishEvent('mc-max-1786072596911-a2f6d560-onload', {
      componentId: 'mc-max-1786072596911-a2f6d560',
      timestamp: Date.now()
    })
  }
})

onUnmounted(() => {
  // 清理逻辑
})
</script>