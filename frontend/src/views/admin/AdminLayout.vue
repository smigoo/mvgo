<template>
  <div class="admin-layout">
    <div class="admin-sidebar">
      <div class="admin-sidebar-title">管理后台</div>
      <a-menu
        v-model:selectedKeys="selectedKeys"
        mode="inline"
        @click="handleMenuClick"
      >
        <a-menu-item key="dashboard">
          <template #icon><HomeOutlined /></template>
          <span>概览</span>
        </a-menu-item>
        <a-menu-item key="operation-log">
          <template #icon><FileTextOutlined /></template>
          <span>异常监控</span>
        </a-menu-item>
        <a-menu-item key="users">
          <template #icon><UserOutlined /></template>
          <span>用户管理</span>
        </a-menu-item>
        <a-menu-item key="task-stats">
          <template #icon><DashboardOutlined /></template>
          <span>任务统计</span>
        </a-menu-item>
      </a-menu>
    </div>
    <div class="admin-content">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { HomeOutlined, FileTextOutlined, UserOutlined, DashboardOutlined } from '@ant-design/icons-vue'

const route = useRoute()
const router = useRouter()

const selectedKeys = ref([])

// 根据当前路由设置选中的菜单项
const updateSelectedKeys = () => {
  const path = route.path
  if (path.includes('dashboard')) {
    selectedKeys.value = ['dashboard']
  } else if (path.includes('operation-log')) {
    selectedKeys.value = ['operation-log']
  } else if (path.includes('users')) {
    selectedKeys.value = ['users']
  } else if (path.includes('task-stats')) {
    selectedKeys.value = ['task-stats']
  } else if (path.includes('my-stats')) {
    selectedKeys.value = ['my-stats']
  }
}

// 监听路由变化
watch(() => route.path, updateSelectedKeys, { immediate: true })

// 菜单点击跳转
const handleMenuClick = ({ key }) => {
  router.push(`/admin/${key}`)
}
</script>

<style scoped>
.admin-layout {
  display: flex;
  /* 减去 header(64px) + footer(41px) = 105px */
  height: calc(100vh - 105px);
  width: 100%;
  overflow: hidden;
  background: var(--bg-page);
}

.admin-sidebar {
  width: 240px;
  background: var(--bg-card);
  border-right: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100%;
  overflow: hidden;
}

.admin-sidebar-title {
  padding: 20px 24px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, rgba(0, 0, 0, 0.85));
  border-bottom: 1px solid var(--border-light, #e8e8e8);
  flex-shrink: 0;
}

.admin-content {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px;
}

:deep(.ant-menu) {
  border-right: none;
  background: transparent !important;
  color: var(--text-primary) !important;
}

:deep(.ant-menu-item) {
  margin: 8px;
  border-radius: 6px;
  color: var(--text-primary) !important;
  background: transparent !important;
}

:deep(.ant-menu-item:hover) {
  background: var(--bg-hover) !important;
  color: var(--text-primary) !important;
}

:deep(.ant-menu-item-selected) {
  background-color: var(--brand-bg) !important;
  color: var(--brand) !important;
}

:deep(.ant-menu-item-selected::after) {
  border-right-color: var(--brand) !important;
}

:deep(.ant-menu-item .anticon) {
  color: inherit !important;
}
</style>
