<script setup>
import { onMounted } from 'vue'
import BasePanel from './base-panel.vue'
import HeaderSection from './header-section.vue'
import ContentActive from './content-active.vue'
import ContentDefault from './content-default.vue'
import TabsSection from './tabs-section.vue'
import ContentCons from './content-cons.vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

onMounted(() => {
  runtimeBuilder.publishEvent('设备监控-onload', {
    componentProps: componentProps.value,
    businessProps: businessProps.value
  })
})
</script>