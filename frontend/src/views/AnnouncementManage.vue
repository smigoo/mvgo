<template>
  <div class="announcement-manage">
    <div class="page-header">
      <div class="header-left">
        <router-link to="/announcements" class="back-link">
          <ArrowLeftOutlined />
          返回公告页
        </router-link>
        <h1 class="page-title">公告管理</h1>
      </div>
      <a-button type="primary" @click="showCreateModal">
        <PlusOutlined />
        发布公告
      </a-button>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <a-input-search
        v-model:value="searchKeyword"
        placeholder="搜索标题"
        style="width: 250px"
        allow-clear
        @search="loadAnnouncements"
      />
      <a-select
        v-model:value="filterActive"
        placeholder="状态筛选"
        style="width: 120px"
        allow-clear
        @change="loadAnnouncements"
      >
        <a-select-option :value="true">已启用</a-select-option>
        <a-select-option :value="false">已禁用</a-select-option>
      </a-select>
    </div>

    <!-- 公告列表 -->
    <a-table
      :columns="columns"
      :data-source="announcements"
      :loading="loading"
      :pagination="pagination"
      row-key="_id"
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'title'">
          <span class="title-cell">
            {{ record.title }}
            <a-tag v-if="record.version" size="small" color="blue">v{{ record.version }}</a-tag>
          </span>
        </template>

        <template v-if="column.key === 'type'">
          <a-tag :color="typeColors[record.type]">{{ typeLabels[record.type] }}</a-tag>
        </template>

        <template v-if="column.key === 'active'">
          <a-switch
            :checked="record.active"
            checked-children="启用"
            un-checked-children="禁用"
            @change="toggleActive(record)"
          />
        </template>

        <template v-if="column.key === 'publishAt'">
          {{ formatDate(record.publishAt) }}
        </template>

        <template v-if="column.key === 'expireAt'">
          {{ record.expireAt ? formatDate(record.expireAt) : '-' }}
        </template>

        <template v-if="column.key === 'action'">
          <a-space>
            <a-button type="link" size="small" @click="showEditModal(record)">
              编辑
            </a-button>
            <a-popconfirm
              title="确定删除这条公告吗？"
              ok-text="确定"
              cancel-text="取消"
              @confirm="deleteAnnouncement(record._id)"
            >
              <a-button type="link" size="small" danger>
                删除
              </a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 创建/编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="isEdit ? '编辑公告' : '发布公告'"
      :confirm-loading="modalLoading"
      @ok="handleSubmit"
      @cancel="resetForm"
      width="600px"
    >
      <a-form
        :model="formState"
        :label-col="{ span: 5 }"
        :wrapper-col="{ span: 18 }"
        style="margin-top: 20px"
      >
        <a-form-item label="标题" required>
          <a-input v-model:value="formState.title" placeholder="请输入公告标题" />
        </a-form-item>

        <a-form-item label="版本号">
          <a-input v-model:value="formState.version" placeholder="如：1.0.0" />
        </a-form-item>

        <a-form-item label="类型">
          <a-select v-model:value="formState.type">
            <a-select-option value="info">信息</a-select-option>
            <a-select-option value="warning">提醒</a-select-option>
            <a-select-option value="success">成功</a-select-option>
            <a-select-option value="error">重要</a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item label="内容" required>
          <a-textarea
            v-model:value="formState.content"
            :rows="6"
            placeholder="请输入公告内容"
          />
        </a-form-item>

        <a-form-item label="发布时间">
          <a-date-picker
            v-model:value="formState.publishAt"
            show-time
            format="YYYY-MM-DD HH:mm"
            style="width: 100%"
          />
        </a-form-item>

        <a-form-item label="过期时间">
          <a-date-picker
            v-model:value="formState.expireAt"
            show-time
            format="YYYY-MM-DD HH:mm"
            style="width: 100%"
          />
        </a-form-item>

        <a-form-item label="优先级">
          <a-input-number v-model:value="formState.priority" :min="0" :max="999" />
          <span style="margin-left: 8px; color: var(--text-tertiary); font-size: 12px">数字越大越靠前</span>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons-vue'
import dayjs from 'dayjs'
import http from '@/core/http'

const loading = ref(false)
const announcements = ref([])
const searchKeyword = ref('')
const filterActive = ref(undefined)

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (total) => `共 ${total} 条`
})

const columns = [
  { title: '标题', key: 'title', dataIndex: 'title', width: '30%' },
  { title: '类型', key: 'type', dataIndex: 'type', width: 100 },
  { title: '状态', key: 'active', dataIndex: 'active', width: 100 },
  { title: '发布时间', key: 'publishAt', dataIndex: 'publishAt', width: 150 },
  { title: '过期时间', key: 'expireAt', dataIndex: 'expireAt', width: 150 },
  { title: '操作', key: 'action', width: 120, fixed: 'right' }
]

const typeColors = { info: 'blue', warning: 'orange', success: 'green', error: 'red' }
const typeLabels = { info: '信息', warning: '提醒', success: '成功', error: '重要' }

const modalVisible = ref(false)
const modalLoading = ref(false)
const isEdit = ref(false)
const editingId = ref(null)

const formState = reactive({
  title: '',
  content: '',
  version: '',
  type: 'info',
  publishAt: null,
  expireAt: null,
  priority: 0
})

function formatDate(date) {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

async function loadAnnouncements() {
  loading.value = true
  try {
    const params = {
      page: pagination.current,
      pageSize: pagination.pageSize
    }
    if (searchKeyword.value) params.keyword = searchKeyword.value
    if (filterActive.value !== undefined && filterActive.value !== null) {
      params.active = filterActive.value
    }

    const res = await http.get('/api/announcements/admin', { params })
    if (res.success) {
      announcements.value = res.data.list
      pagination.total = res.data.total
    }
  } catch (error) {
    message.error('加载公告失败')
  } finally {
    loading.value = false
  }
}

function handleTableChange(pag) {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  loadAnnouncements()
}

function showCreateModal() {
  isEdit.value = false
  editingId.value = null
  resetForm()
  modalVisible.value = true
}

function showEditModal(record) {
  isEdit.value = true
  editingId.value = record._id
  formState.title = record.title
  formState.content = record.content
  formState.version = record.version || ''
  formState.type = record.type
  formState.publishAt = record.publishAt ? dayjs(record.publishAt) : null
  formState.expireAt = record.expireAt ? dayjs(record.expireAt) : null
  formState.priority = record.priority || 0
  modalVisible.value = true
}

function resetForm() {
  formState.title = ''
  formState.content = ''
  formState.version = ''
  formState.type = 'info'
  formState.publishAt = null
  formState.expireAt = null
  formState.priority = 0
}

async function handleSubmit() {
  if (!formState.title || !formState.content) {
    message.warning('请填写标题和内容')
    return
  }

  modalLoading.value = true
  try {
    const data = {
      title: formState.title,
      content: formState.content,
      version: formState.version || undefined,
      type: formState.type,
      publishAt: formState.publishAt ? formState.publishAt.toISOString() : undefined,
      expireAt: formState.expireAt ? formState.expireAt.toISOString() : undefined,
      priority: formState.priority
    }

    if (isEdit.value) {
      await http.put(`/api/announcements/${editingId.value}`, data)
      message.success('更新成功')
    } else {
      await http.post('/api/announcements', data)
      message.success('发布成功')
    }

    modalVisible.value = false
    loadAnnouncements()
  } catch (error) {
    message.error(isEdit.value ? '更新失败' : '发布失败')
  } finally {
    modalLoading.value = false
  }
}

async function toggleActive(record) {
  try {
    await http.put(`/api/announcements/${record._id}/toggle`)
    message.success(record.active ? '已禁用' : '已启用')
    loadAnnouncements()
  } catch (error) {
    message.error('操作失败')
  }
}

async function deleteAnnouncement(id) {
  try {
    await http.delete(`/api/announcements/${id}`)
    message.success('删除成功')
    loadAnnouncements()
  } catch (error) {
    message.error('删除失败')
  }
}

onMounted(() => {
  loadAnnouncements()
})
</script>

<style scoped>
.announcement-manage {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-link {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
}

.back-link:hover {
  color: var(--brand);
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.title-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
