<script setup>
import { computed } from 'vue'

const props = defineProps({
  attribute: { type: Object, default: () => ({}) },
  theme: { type: String, default: 'light' }
})

const componentId = 'c-monitor'
const onloadEventName = 'monitor-onload'

const title = computed(() => props.attribute?.title || 'cp-流量监测')
const description = computed(() => props.attribute?.description || '')
const imgUrl = computed(() => props.attribute?.imgUrl || '')
const boxStyle = computed(() => {
  const ratio = props.attribute?.aspectRatio || [16, 9]
  return { aspectRatio: `${ratio[0]} / ${ratio[1]}` }
})

let runtimeBuilder = null
try {
  runtimeBuilder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder().runtimeBuilder : null
} catch (e) {
  console.warn('[组件] $mcComponentBuilder 初始化失败:', e)
  runtimeBuilder = null
}

const publishEvent = runtimeBuilder?.publishEvent || (() => {})
</script>