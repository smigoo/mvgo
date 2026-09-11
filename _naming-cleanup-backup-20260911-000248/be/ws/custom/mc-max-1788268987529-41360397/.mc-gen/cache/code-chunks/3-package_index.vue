<script setup>
import { defineAsyncComponent } from 'vue'

// $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 异步加载子组件（保持既有结构，严禁重排）
const DailyTotalSection = defineAsyncComponent(() => import('./components/DailyTotalSection.vue'))
const VehicleTypeSection = defineAsyncComponent(() => import('./components/VehicleTypeSection.vue'))
const ForecastSection = defineAsyncComponent(() => import('./components/ForecastSection.vue'))
</script>