<template>
  <div class="c-mc-max-1787565993770-7ada59d5-c-monitor-category-stats-container">
    <div class="c-mc-max-1787565993770-7ada59d5-c-monitor-category-stats-header">
      <h3 class="c-mc-max-1787565993770-7ada59d5-c-monitor-category-stats-title">分类统计</h3>
    </div>
    <div class="c-mc-max-1787565993770-7ada59d5-c-monitor-category-stats-content">
      <div 
        v-for="item in categoryList" 
        :key="item.id" 
        class="c-mc-max-1787565993770-7ada59d5-c-monitor-category-item"
      >
        <div class="c-mc-max-1787565993770-7ada59d5-c-monitor-category-info">
          <span class="c-mc-max-1787565993770-7ada59d5-c-monitor-category-name">{{ item.name }}</span>
          <span class="c-mc-max-1787565993770-7ada59d5-c-monitor-category-value">{{ item.value }}</span>
        </div>
        <div class="c-mc-max-1787565993770-7ada59d5-c-monitor-category-progress">
          <div 
            class="c-mc-max-1787565993770-7ada59d5-c-monitor-category-progress-bar" 
            :style="{ width: item.percentage + '%', backgroundColor: item.color }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const categoryList = ref([
  { id: 1, name: '网络设备', value: 120, percentage: 80, color: '#1890ff' },
  { id: 2, name: '安全设备', value: 85, percentage: 56, color: '#52c41a' },
  { id: 3, name: '存储设备', value: 60, percentage: 40, color: '#faad14' },
  { id: 4, name: '计算设备', value: 45, percentage: 30, color: '#f5222d' }
])

onMounted(() => {
  runtimeBuilder.publishEvent('CategoryStats-onload', {
    message: 'CategoryStats component loaded',
    data: categoryList.value
  })
})
</script>

<style scoped lang="less">
@import '../../resources/styles/index.less';
.category-stats-container {  width: 100%;

  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 16px;
  margin-top: 16px;
}

.category-stats-header {
  margin-bottom: 16px;
}

.category-stats-title {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  margin: 0;
}

.category-stats-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.category-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.category-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.category-name {
  font-size: 14px;
  color: #e0e0e0;
}

.category-value {
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
}

.category-progress {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.category-progress-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}
</style>