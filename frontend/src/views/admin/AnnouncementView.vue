<template>
  <div class="announcement-view">
    <div class="page-header">
      <h2>系统公告管理</h2>
      <a-button type="primary" @click="showCreateModal">
        <template #icon><PlusOutlined /></template>
        新建公告
      </a-button>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <a-input-search
        v-model:value="searchKeyword"
        placeholder="搜索标题、内容、版本号"
        style="width: 300px"
        @search="loadAnnouncements"
        allow-clear
      />
      <a-select
        v-model:value="filterActive"
        style="width: 120px"
        @change="loadAnnouncements"
      >
        <a-select-option :value="undefined">全部状态</a-select-option>
        <a-select-option :value="true">已发布</a-select-option>
        <a-select-option :value="false">草稿</a-select-option>
      </a-select>
    </div>

    <!-- 公告列表 -->
    <a-table
      :columns="columns"
      :data-source="announcements"
      :loading="loading"
      :pagination="pagination"
      @change="handleTableChange"
      row-key="_id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'title'">
          <div class="title-cell">
            <span class="title-text">{{ record.title }}</span>
            <a-tag v-if="record.version" color="blue">v{{ record.version }}</a-tag>
          </div>
        </template>

        <template v-if="column.key === 'type'">
          <a-tag :color="typeColors[record.type]">{{ typeLabels[record.type] }}</a-tag>
        </template>

        <template v-if="column.key === 'active'">
          <a-switch
            :checked="record.active"
            @change="toggleActive(record._id)"
            :loading="record._toggleLoading"
          />
        </template>

        <template v-if="column.key === 'publishAt'">
          {{ formatDate(record.publishAt) }}
        </template>

        <template v-if="column.key === 'expireAt'">
          {{ record.expireAt ? formatDate(record.expireAt) : '永久' }}
        </template>

        <template v-if="column.key === 'action'">
          <a-space>
            <a-button type="link" size="small" @click="showEditModal(record)">
              编辑
            </a-button>
            <a-popconfirm
              title="确定要删除这条公告吗？"
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

    <!-- 新建/编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="editingId ? '编辑公告' : '新建公告'"
      :confirm-loading="modalLoading"
      @ok="handleSubmit"
      width="700px"
    >
      <a-form
        :model="formState"
        :label-col="{ span: 5 }"
        :wrapper-col="{ span: 18 }"
      >
        <a-form-item label="标题" required>
          <a-input v-model:value="formState.title" placeholder="请输入公告标题" />
        </a-form-item>

        <a-form-item label="版本号">
          <a-input v-model:value="formState.version" placeholder="如：1.0.0（可选）" />
        </a-form-item>

        <a-form-item label="类型">
          <a-select v-model:value="formState.type">
            <a-select-option value="info">信息</a-select-option>
            <a-select-option value="success">成功</a-select-option>
            <a-select-option value="warning">警告</a-select-option>
            <a-select-option value="error">错误</a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item label="内容" required>
          <a-textarea
            v-model:value="formState.content"
            placeholder="请输入公告内容"
            :rows="6"
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
            placeholder="不填表示永久有效"
          />
        </a-form-item>

        <a-form-item label="优先级">
          <a-input-number
            v-model:value="formState.priority"
            :min="0"
            :max="999"
            style="width: 100%"
          />
          <div class="form-hint">数字越大优先级越高，显示在列表前面</div>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
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
  { title: '标题', key: 'title', width: 300 },
  { title: '类型', key: 'type', width: 100 },
  { title: '状态', key: 'active', width: 100 },
  { title: '发布时间', key: 'publishAt', width: 180 },
  { title: '过期时间', key: 'expireAt', width: 180 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' }
]

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

const modalVisible = ref(false)
const modalLoading = ref(false)
const editingId = ref(null)

const formState = reactive({
  title: '',
  version: '',
  type: 'info',
  content: '',
  publishAt: null,
  expireAt: null,
  priority: 0
})

function formatDate(date) {
  if (!date) return ''
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

async function loadAnnouncements() {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: pagination.current.toString(),
      pageSize: pagination.pageSize.toString()
    })
    if (searchKeyword.value) {
      params.append('keyword', searchKeyword.value)
    }
    if (filterActive.value !== undefined) {
      params.append('active', filterActive.value.toString())
    }

    const res = await http.get(`/api/announcements/admin?${params.toString()}`)
    announcements.value = res.data.list || []
    pagination.total = res.data.total || 0
  } catch (error) {
    message.error('加载公告列表失败')
    console.error(error)
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
  editingId.value = null
  Object.assign(formState, {
    title: '',
    version: '',
    type: 'info',
    content: '',
    publishAt: dayjs(),
    expireAt: null,
    priority: 0
  })
  modalVisible.value = true
}

function showEditModal(record) {
  editingId.value = record._id
  Object.assign(formState, {
    title: record.title,
    version: record.version || '',
    type: record.type,
    content: record.content,
    publishAt: record.publishAt ? dayjs(record.publishAt) : null,
    expireAt: record.expireAt ? dayjs(record.expireAt) : null,
    priority: record.priority || 0
  })
  modalVisible.value = true
}

async function handleSubmit() {
  if (!formState.title || !formState.content) {
    message.warning('标题和内容为必填项')
    return
  }

  modalLoading.value = true
  try {
    const payload = {
      title: formState.title,
      version: formState.version || undefined,
      type: formState.type,
      content: formState.content,
      publishAt: formState.publishAt ? formState.publishAt.toISOString() : undefined,
      expireAt: formState.expireAt ? formState.expireAt.toISOString() : undefined,
      priority: formState.priority
    }

    if (editingId.value) {
      await http.put(`/api/announcements/${editingId.value}`, payload)
      message.success('公告已更新')
    } else {
      await http.post('/api/announcements', payload)
      message.success('公告已创建')
    }

    modalVisible.value = false
    loadAnnouncements()
  } catch (error) {
    message.error(error.response?.data?.message || '操作失败')
    console.error(error)
  } finally {
    modalLoading.value = false
  }
}

async function toggleActive(id) {
  const item = announcements.value.find(a => a._id === id)
  if (!item) return

  item._toggleLoading = true
  try {
    await http.put(`/api/announcements/${id}/toggle`)
    item.active = !item.active
    message.success(item.active ? '已发布' : '已转为草稿')
  } catch (error) {
    message.error('操作失败')
    console.error(error)
  } finally {
    item._toggleLoading = false
  }
}

async function deleteAnnouncement(id) {
  try {
    await http.delete(`/api/announcements/${id}`)
    message.success('公告已删除')
    loadAnnouncements()
  } catch (error) {
    message.error('删除失败')
    console.error(error)
  }
}

onMounted(() => {
  loadAnnouncements()
})
</script>

<style scoped>
.announcement-view {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.title-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-text {
  font-weight: 500;
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #999;
}
</style>
