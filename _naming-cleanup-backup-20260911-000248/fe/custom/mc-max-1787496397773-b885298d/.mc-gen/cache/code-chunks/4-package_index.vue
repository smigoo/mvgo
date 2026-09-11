<script setup>
import { computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  attribute: { type: Object, default: () => ({}) },
  theme: { type: String, default: 'light' }
})

const componentId = 'c-monitor'
const title = computed(() => props.attribute?.title || 'cp-流量监测')
const description = computed(() => props.attribute?.description || '')
const imgUrl = computed(() => props.attribute?.imgUrl || '')
const boxStyle = computed(() => {
  const ratio = props.attribute?.aspectRatio || [16, 9]
  return { aspectRatio: `${ratio[0]} / ${ratio[1]}` }
})

let runtimeBuilder = null
try {
  ;({ runtimeBuilder } = $mcComponentBuilder())
} catch (e) {
  runtimeBuilder = null
}

const publishEvent = runtimeBuilder?.publishEvent || (() => {})

const handleResize = () => {
  // 预留：处理自适应逻辑
}

onMounted(() => {
  publishEvent('c-monitor-onload', {
    componentId,
    timestamp: Date.now()
  })

  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>