<template>
  <!-- 修复：子组件仅渲染 base-panel 默认插槽内容区，不生成独立 header / panel-header 面板标题结构 -->
  <div class="c-mc-1785154107233-dd52baa9-content">
    <div class="c-mc-1785154107233-dd52baa9-sub-section">
      <div class="c-mc-1785154107233-dd52baa9-sub-heading">
<img v-if="subIcon" :src="subIcon" alt="今日累计" class="c-mc-1785154107233-dd52baa9-sub-icon" />
        <span class="c-mc-1785154107233-dd52baa9-sub-title">今日累计</span>
      </div>

      <div class="c-mc-1785154107233-dd52baa9-card-list">
<div v-for="item in items" :key="item.key" class="c-mc-1785154107233-dd52baa9-vehicle-card" :style="{ backgroundImage: `url(${item.bg})`, backgroundSize: item.bgSize, backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }" >
<img :src="item.icon" :alt="item.label" class="c-mc-1785154107233-dd52baa9-vehicle-icon" />

          <div class="c-mc-1785154107233-dd52baa9-vehicle-info">
            <span class="c-mc-1785154107233-dd52baa9-vehicle-label">{{ item.label }}</span>
            <span class="c-mc-1785154107233-dd52baa9-vehicle-value">
              {{ item.value }}
              <small class="c-mc-1785154107233-dd52baa9-vehicle-unit">{{ item.unit }}</small>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  items: {
    type: Array,
    default: () => []
  },
  subIcon: {
    type: String,
    default: ''
  }
})
</script>