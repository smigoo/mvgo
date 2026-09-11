<script setup>
import { defineAsyncComponent } from 'vue'

// 引入 4 个 section 级子组件
const HeaderStats = defineAsyncComponent(() => import('./components/HeaderStats.vue'))
const DeviceTabs = defineAsyncComponent(() => import('./components/DeviceTabs.vue'))
const EquipmentGrid = defineAsyncComponent(() => import('./components/EquipmentGrid.vue'))
const LeftCategoryNav = defineAsyncComponent(() => import('./components/LeftCategoryNav.vue'))

// 微码组件构建器（仅调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
</script>