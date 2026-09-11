<script setup>
import { onMounted } from 'vue'

// 生命周期：触发组件加载事件
onMounted(() => {
  emitLoadEvent()
})
</script>