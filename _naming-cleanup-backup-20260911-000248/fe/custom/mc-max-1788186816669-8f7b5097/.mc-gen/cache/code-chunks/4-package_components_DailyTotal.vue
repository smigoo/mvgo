<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

// 资源变量声明（系统会自动注入实际值）
const bg1 = ref(null)
const bgm_2 = ref(null)

// 统计数据
const stats = ref([
  {
    label: '江阴靖江长江隧道',
    value: '34,620',
    bgResource: 'bg1'
  },
  {
    label: '江阴大桥',
    value: '82,379',
    bgResource: 'bg1'
  }
])

// 时间选择器选项
const timeOptions = ref([
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' }
])

const selectedTime = ref('24h')

// 时间切换处理
const handleTimeChange = (value) => {
  selectedTime.value = value
  // 可以在这里触发数据刷新
}

onMounted(() => {
  // 组件挂载后的初始化逻辑
})

onUnmounted(() => {
  // 清理工作
})
</script>
