<template>
  <div class="announcement-page">
    <div class="announcement-header">
      <div class="header-content">
        <div class="header-text">
          <h1 class="page-title">系统公告</h1>
          <p class="page-subtitle">查看平台最新动态和版本更新</p>
        </div>
        <router-link to="/announcements/manage" class="manage-link">
          <SettingOutlined />
          管理公告
        </router-link>
      </div>
    </div>

    <div class="announcement-list">
      <div v-if="loading" class="loading-state">
        <a-spin size="large" />
        <p>加载中...</p>
      </div>

      <div v-else-if="announcements.length === 0" class="empty-state">
        <a-empty description="暂无公告" />
      </div>

      <div v-else class="announcement-items">
        <div
          v-for="item in announcements"
          :key="item._id"
          class="announcement-card"
        >
          <div class="card-header">
            <div class="title-row">
              <h2 class="announcement-title">{{ item.title }}</h2>
              <a-tag v-if="item.version" color="blue">v{{ item.version }}</a-tag>
              <a-tag :color="typeColors[item.type]">{{ typeLabels[item.type] }}</a-tag>
            </div>
            <div class="meta-info">
              <span class="publish-time">
                <CalendarOutlined />
                {{ formatDate(item.publishAt) }}
              </span>
              <span v-if="item.author" class="author">
                <UserOutlined />
                {{ item.author }}
              </span>
            </div>
          </div>

          <div class="card-content">
            <div class="content-text" v-html="formatContent(item.content)"></div>
          </div>

          <div v-if="item.expireAt" class="card-footer">
            <span class="expire-info">
              <ClockCircleOutlined />
              有效期至 {{ formatDate(item.expireAt) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { CalendarOutlined, UserOutlined, ClockCircleOutlined, SettingOutlined } from '@ant-design/icons-vue'
import dayjs from 'dayjs'
import http from '@/core/http'

const loading = ref(false)
const announcements = ref([])

const typeColors = {
  info: 'blue',
  warning: 'orange',
  success: 'green',
  error: 'red'
}

const typeLabels = {
  info: '信息',
  warning: '提醒',
  success: '成功',
  error: '重要'
}

function formatDate(date) {
  if (!date) return ''
  return dayjs(date).format('YYYY-MM-DD')
}

function formatContent(content) {
  if (!content) return ''
  // 简单处理换行
  return content.replace(/\n/g, '<br>')
}

async function fetchAnnouncements() {
  loading.value = true
  try {
    const res = await http.get('/api/announcements/active')
    if (res.success) {
      announcements.value = res.data || []
    }
  } catch (error) {
    console.error('获取公告失败:', error)
    message.error('获取公告失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchAnnouncements()
})
</script>

<style scoped>
.announcement-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 24px;
}

.announcement-header {
  text-align: center;
  margin-bottom: 48px;
}

.page-title {
  font-size: 32px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.page-subtitle {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 80px 0;
  color: var(--text-secondary);
}

.announcement-items {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.announcement-card {
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 24px;
  transition: box-shadow 0.2s;
}

.announcement-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.card-header {
  margin-bottom: 20px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.announcement-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  flex: 1;
}

.meta-info {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

.publish-time,
.author {
  display: flex;
  align-items: center;
  gap: 6px;
}

.card-content {
  margin-bottom: 16px;
}

.content-text {
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-primary);
}

.card-footer {
  padding-top: 16px;
  border-top: 1px solid var(--border-light);
}

.expire-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-tertiary);
}

@media (max-width: 768px) {
  .announcement-page {
    padding: 24px 16px;
  }

  .page-title {
    font-size: 24px;
  }

  .announcement-card {
    padding: 20px;
  }

  .announcement-title {
    font-size: 18px;
  }
}
</style>
