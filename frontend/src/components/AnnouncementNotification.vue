<template>
  <div v-if="visibleAnnouncements.length > 0" class="announcement-notification">
    <a-badge :count="visibleAnnouncements.length" :offset="[-5, 5]">
      <a-button
        type="text"
        @click="showDrawer = true"
        class="notification-button"
      >
        <NotificationOutlined />
      </a-button>
    </a-badge>

    <a-drawer
      v-model:open="showDrawer"
      title="系统公告"
      placement="right"
      :width="500"
    >
      <div class="announcement-list">
        <div
          v-for="item in visibleAnnouncements"
          :key="item._id"
          class="announcement-item"
        >
          <div class="announcement-header">
            <a-tag :color="typeColors[item.type]" size="small">
              {{ typeLabels[item.type] }}
            </a-tag>
            <span v-if="item.version" class="version-tag">v{{ item.version }}</span>
            <span class="publish-time">{{ formatDate(item.publishAt) }}</span>
          </div>
          <h3 class="announcement-title">{{ item.title }}</h3>
          <div class="announcement-content">{{ item.content }}</div>
        </div>
      </div>
    </a-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { NotificationOutlined } from '@ant-design/icons-vue'
import dayjs from 'dayjs'
import http from '@/core/http'

const showDrawer = ref(false)
const visibleAnnouncements = ref([])

const typeColors = {
  info: 'blue',
  success: 'green',
  warning: 'orange',
  error: 'red'
}

const typeLabels = {
  info: '信息',
  success: '成功',
  warning: '警告',
  error: '错误'
}

function formatDate(date) {
  if (!date) return ''
  return dayjs(date).format('MM-DD HH:mm')
}

async function loadActiveAnnouncements() {
  try {
    const res = await http.get('/api/announcements/active')
    visibleAnnouncements.value = res.data || []
  } catch (error) {
    console.error('加载公告失败:', error)
  }
}

onMounted(() => {
  loadActiveAnnouncements()
})
</script>

<style scoped>
.announcement-notification {
  display: inline-flex;
  align-items: center;
}

.notification-button {
  font-size: 18px;
  padding: 4px 8px;
}

.announcement-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.announcement-item {
  padding: 16px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  background: #fafafa;
}

.announcement-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.version-tag {
  font-size: 12px;
  color: #1890ff;
  font-weight: 500;
}

.publish-time {
  font-size: 12px;
  color: #999;
  margin-left: auto;
}

.announcement-title {
  font-size: 16px;
  font-weight: 600;
  margin: 8px 0;
  color: #333;
}

.announcement-content {
  font-size: 14px;
  line-height: 1.6;
  color: #666;
  white-space: pre-wrap;
}
</style>
