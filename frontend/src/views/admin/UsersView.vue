<template>
  <div class="mg-root">
    <header class="mg-header">
      <div>
        <h1 class="mg-title">用户管理</h1>
        <p class="mg-sub">可管理 · 所有用户及其 AI / API 配置，可在右侧动态设置管理员权限</p>
      </div>
      <a-tag color="blue" class="mg-readonly-tag">可管理</a-tag>
    </header>

    <section class="mg-section">
      <div class="mg-section-head">
        <h2 class="mg-section-title">QS 登录用户</h2>
        <div class="mg-head-right">
          <a-select
            v-model:value="deptFilter"
            class="mg-dept-select"
            placeholder="按部门筛选"
            allow-clear
            @change="onFilterChange"
          >
            <a-select-option value="">全部部门</a-select-option>
            <a-select-option v-for="d in departmentOptions" :key="d" :value="d">{{ d }}</a-select-option>
          </a-select>
          <a-select
            v-model:value="usageFilter"
            class="mg-usage-select"
            mode="multiple"
            placeholder="按使用状态筛选（可多选）"
            :max-tag-count="2"
            allow-clear
            @change="onFilterChange"
          >
            <a-select-option value="configured">已配置</a-select-option>
            <a-select-option value="hasComponent">已生成组件</a-select-option>
            <a-select-option value="hasApi">已生成接口</a-select-option>
          </a-select>
          <a-input-search
            v-model:value="search"
            placeholder="搜索用户名 / 姓名 / 部门 / UID"
            class="mg-search"
            allow-clear
            @search="onSearch"
          />
          <span class="mg-count">共 {{ filteredUsers.length }} 位用户</span>
        </div>
      </div>

      <div class="mg-table-wrap">
        <a-table
          class="mg-table"
          size="middle"
          :columns="userColumns"
          :data-source="filteredUsers"
          :loading="loading"
          :pagination="pagination"
          :scroll="{ x: 1080 }"
          row-key="id"
          @change="onTableChange"
        >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'isAdmin'">
            <a-switch
              :checked="record.isAdmin"
              :loading="!!record._saving"
              @change="(checked: boolean) => setAdmin(record, checked)"
            />
          </template>
          <template v-else-if="column.key === 'hasConfig'">
            <a-tag :color="record.hasConfig ? 'green' : 'default'">
              {{ record.hasConfig ? '已配置' : '未配置' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'createdAt'">
            <span class="mg-muted">{{ formatTime(record.createdAt) }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" size="small" class="mg-action-btn" @click="openDrawer(record)">查看配置</a-button>
            <a-popconfirm
              title="确定删除该用户？"
              :description="`将同时删除该用户的组件、配置、文档等所有数据，不可恢复`"
              ok-text="删除"
              cancel-text="取消"
              ok-type="danger"
              @confirm="handleDeleteUser(record)"
            >
              <a-button type="link" size="small" danger class="mg-action-btn">删除</a-button>
            </a-popconfirm>
          </template>
          <template v-else>
            <span>{{ record[column.key] || '-' }}</span>
          </template>
        </template>
      </a-table>
      </div>

      <a-alert v-if="error" type="error" :message="error" show-icon class="mg-alert" />
    </section>

    <!-- 配置详情抽屉 -->
    <a-drawer
      :open="drawerVisible"
      :title="drawerTitle"
      placement="right"
      :width="440"
      @close="drawerVisible = false"
    >
      <template v-if="activeUser">
        <div class="ud-block">
          <div class="ud-row"><span class="ud-label">用户名</span><span class="ud-value">{{ activeUser.username }}</span></div>
          <div class="ud-row"><span class="ud-label">姓名</span><span class="ud-value">{{ activeUser.name || '-' }}</span></div>
          <div class="ud-row"><span class="ud-label">部门</span><span class="ud-value">{{ activeUser.deptName || '-' }}</span></div>
          <div class="ud-row"><span class="ud-label">组织</span><span class="ud-value">{{ activeUser.orgName || '-' }}</span></div>
          <div class="ud-row"><span class="ud-label">门户UID</span><span class="ud-value">{{ activeUser.uid || '-' }}</span></div>
        </div>

        <a-divider orientation="left">使用统计</a-divider>
        <div class="ud-stats">
          <div class="ud-stat">
            <span class="ud-stat-num">{{ activeUser.componentCount ?? 0 }}</span>
            <span class="ud-stat-label">生成组件</span>
          </div>
          <div class="ud-stat">
            <span class="ud-stat-num">{{ activeUser.taskCount ?? 0 }}</span>
            <span class="ud-stat-label">生成任务</span>
          </div>
          <div class="ud-stat">
            <span class="ud-stat-num">{{ activeUser.apiTaskCount ?? 0 }}</span>
            <span class="ud-stat-label">接口批数</span>
          </div>
          <div class="ud-stat">
            <span class="ud-stat-num">{{ activeUser.apiCount ?? 0 }}</span>
            <span class="ud-stat-label">接口总数</span>
          </div>
        </div>

        <a-divider orientation="left">AI / API 配置</a-divider>

        <template v-if="activeUser.config">
          <div class="ud-subtitle">已配置密钥（已脱敏）</div>
          <div class="ud-secret-tags">
            <a-tag v-for="s in drawerSecretTags" :key="s.label" :color="s.color" class="ud-secret-tag">
              {{ s.label }}：{{ s.masked }}
            </a-tag>
            <span v-if="!drawerSecretTags.length" class="mg-muted">无</span>
          </div>

          <div class="ud-subtitle" style="margin-top:16px;">其他配置</div>
          <div v-if="plainEntries.length" class="ud-plain">
            <div v-for="p in plainEntries" :key="p.key" class="ud-plain-row">
              <span class="ud-plain-key">{{ p.label }}</span>
              <span class="ud-plain-val">{{ p.value }}</span>
            </div>
          </div>
          <span v-else class="mg-muted">无</span>
        </template>
        <a-empty v-else description="该用户尚未配置 AI / API" />
      </template>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { message } from 'ant-design-vue'
import { useUserStore } from '@/store/modules/user'
import http from '@/core/http'

const userStore = useUserStore()

function formatTime(v: any): string {
  if (!v) return '-'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '-'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ---------- 用户列表 ----------
const users = ref<any[]>([])
const loading = ref(false)
const error = ref('')
const search = ref('')
const deptFilter = ref('')
// 使用状态筛选（多选，非互斥）：[]=全部 | configured=已配置 | hasComponent=已生成组件 | hasApi=已生成接口
// 满足任一选中状态即命中（并集）
const usageFilter = ref<string[]>([])

// 部门下拉选项（从当前用户数据动态提取去重，按字母排序）
const departmentOptions = computed(() => {
  const set = new Set<string>()
  users.value.forEach((u) => {
    if (u.deptName) set.add(String(u.deptName))
  })
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

const userColumns = [
  { title: '用户名', key: 'username', dataIndex: 'username', width: 130, ellipsis: true },
  { title: '姓名', key: 'name', dataIndex: 'name', width: 100, ellipsis: true },
  { title: '部门', key: 'deptName', dataIndex: 'deptName', width: 140, ellipsis: true },
  { title: '组织', key: 'orgName', dataIndex: 'orgName', width: 140, ellipsis: true },
  { title: '门户UID', key: 'uid', dataIndex: 'uid', width: 130, ellipsis: true },
  { title: '管理员', key: 'isAdmin', dataIndex: 'isAdmin', width: 80, align: 'center' },
  { title: '配置状态', key: 'hasConfig', width: 100, align: 'center' },
  { title: '注册时间', key: 'createdAt', width: 150, sorter: (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(), defaultSortOrder: 'descend' },
  { title: '操作', key: 'action', width: 150, fixed: 'right', align: 'center' },
]

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100'],
})

const filteredUsers = computed(() => {
  const kw = search.value.trim().toLowerCase()
  const dept = deptFilter.value
  const usage = usageFilter.value
  return users.value.filter((u) => {
    // 部门筛选
    if (dept && u.deptName !== dept) return false
    // 使用状态筛选（多选并集；统计字段来自后端 user-stats，老数据无字段按 0）
    if (usage.length) {
      const hit = usage.some((f) => {
        if (f === 'configured') return !!u.hasConfig
        if (f === 'hasComponent') return (u.componentCount ?? 0) > 0 || (u.taskCount ?? 0) > 0
        if (f === 'hasApi') return (u.apiTaskCount ?? 0) > 0 || (u.apiCount ?? 0) > 0
        return false
      })
      if (!hit) return false
    }
    // 关键字筛选
    if (kw) {
      return [u.username, u.name, u.deptName, u.orgName, u.uid]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw))
    }
    return true
  })
})

const SECRET_LABELS: Record<string, string> = {
  textApiKey: '文本Key',
  visionApiKey: '视觉Key',
  unifiedApiKey: '统一Key',
  figmaToken: 'Figma',
  apifoxToken: 'Apifox',
}
const PLAIN_LABELS: Record<string, string> = {
  textBaseURL: '文本BaseURL',
  textModel: '文本模型',
  textProviderType: '文本类型',
  visionBaseURL: '视觉BaseURL',
  visionModel: '视觉模型',
  visionProviderType: '视觉类型',
  unifiedBaseURL: '统一BaseURL',
  unifiedModel: '统一模型',
  unifiedProviderType: '统一类型',
  modelMode: '模型模式',
  requestConcurrency: '并发数',
  requestQueueTimeoutMs: '队列超时(ms)',
  requestTimeoutMs: '请求超时(ms)',
  requestMaxRetries: '最大重试',
}

async function loadUsers() {
  loading.value = true
  error.value = ''
  try {
    const data = await http.get('/api/admin/users')
    users.value = data.data.list || []
    // pagination.total 由 filteredUsers 推算（前端三件套筛选：关键字 / 部门 / 使用状态都是客户端过滤），
    // 这里不再用 API.total —— 否则「过滤后 5 条用户 + total=100」会出现「1 2 3 4 5」翻页器的假象。
  } catch (e: any) {
    error.value = e.message || '加载用户列表失败'
    if (e.status === 401 || e.status === 403) message.error('无权限或登录已过期')
  } finally {
    loading.value = false
  }
}

// 同步 pagination.total = 过滤后的实际行数；
// 同时修正「当前页越界」（过滤后页数变少时，停留在原页码会显示空白）。
watch(
  filteredUsers,
  (list) => {
    pagination.total = list.length
    const maxPage = Math.max(1, Math.ceil(list.length / pagination.pageSize))
    if (pagination.current > maxPage) pagination.current = 1
  },
  { immediate: true },
)

function onSearch() {
  pagination.current = 1
}
function onFilterChange() {
  pagination.current = 1
}
function onTableChange(pag: any) {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
}

// ---------- 配置详情抽屉 ----------
const drawerVisible = ref(false)
const activeUser = ref<any>(null)
const drawerTitle = computed(() =>
  activeUser.value ? `用户配置 · ${activeUser.value.username}` : '用户配置',
)

const drawerSecretTags = computed(() => {
  const secrets = activeUser.value?.config?.secrets || {}
  return Object.keys(SECRET_LABELS)
    .filter((k) => secrets[k])
    .map((k) => ({ label: SECRET_LABELS[k], masked: secrets[k], color: 'green' }))
})
const plainEntries = computed(() => {
  const plain = activeUser.value?.config?.plain || {}
  return Object.keys(PLAIN_LABELS)
    .filter((k) => plain[k] !== undefined && plain[k] !== null && plain[k] !== '')
    .map((k) => ({ key: k, label: PLAIN_LABELS[k], value: plain[k] }))
})

function openDrawer(record: any) {
  activeUser.value = record
  drawerVisible.value = true
}

// ---------- 设置管理员（动态开关） ----------
async function setAdmin(record: any, checked: boolean) {
  record._saving = true
  try {
    await http.post(`/api/admin/users/${record.id}`, { isAdmin: checked })
    record.isAdmin = checked
    message.success(`${record.username} 已${checked ? '设为' : '取消'}管理员`)
    // 若操作的是当前登录账号，刷新 store 角色，使导航与权限同步
    if (record.id && record.id === userStore.userInfo?.id) {
      await userStore.fetchCurrentUser()
    }
  } catch (e: any) {
    message.error(e.message || '设置失败')
    record.isAdmin = !checked // 回滚显示
  } finally {
    record._saving = false
  }
}

// ---------- 删除用户 ----------
const deletingId = ref<string | null>(null)

async function handleDeleteUser(record: any) {
  if (deletingId.value) return
  deletingId.value = record.id
  try {
    const res = await http.post(`/api/admin/users/${record.id}/delete`)
    const { deletedComponents = 0, cleanedCollections = [] } = res?.data || {}
    message.success(`已删除用户 ${record.username}，清理: ${cleanedCollections.length > 0 ? cleanedCollections.join(', ') : '无关联数据'}`)
    // 从列表中移除
    users.value = users.value.filter((u: any) => u.id !== record.id)
  } catch (e: any) {
    message.error(e.message || '删除失败')
  } finally {
    deletingId.value = null
  }
}

onMounted(() => {
  loadUsers()
})
</script>

<style lang="less" scoped>
// 基础 .mg-* 样式已抽到全局 src/assets/styles/admin.less，此处仅保留本页特有样式

.mg-head-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.mg-dept-select {
  width: 180px;
}

.mg-usage-select {
  width: 210px;
}

.mg-table-wrap {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}

.mg-table {
  min-width: 1080px;
}

.mg-action-btn {
  white-space: nowrap;
}

// 抽屉内用户信息
.ud-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

// 使用统计卡片
.ud-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.ud-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 4px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.ud-stat-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--brand, #1677ff);
  line-height: 1.2;
}

.ud-stat-label {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.ud-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-size: 13px;
}

.ud-label {
  width: 64px;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.ud-value {
  color: var(--text-primary);
  font-weight: 500;
  word-break: break-all;
}

.ud-subtitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.ud-secret-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ud-secret-tag {
  margin: 0;
}

.ud-plain {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ud-plain-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-size: 13px;
}

.ud-plain-key {
  width: 110px;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.ud-plain-val {
  color: var(--text-primary);
  word-break: break-all;
}
</style>
