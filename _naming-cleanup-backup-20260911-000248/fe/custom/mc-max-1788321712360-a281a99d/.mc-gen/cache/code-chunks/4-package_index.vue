<script setup>
import { onMounted } from 'vue'

onMounted(() => {
  runtimeBuilder.publishEvent('monitor-onload', {
    componentId: 'monitor',
    timestamp: Date.now()
  })
})
</script>