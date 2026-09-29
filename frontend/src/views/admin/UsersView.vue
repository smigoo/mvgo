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
          <a-select v-model:value="exportPreset" class="mg-export-preset" @click.stop>
            <a-select-option value="week">本周</a-select-option>
            <a-select-option value="d30">近30天</a-select-option>
            <a-select-option value="d60">近60天</a-select-option>
            <a-select-option value="custom">自定义</a-select-option>
          </a-select>
          <a-range-picker
            v-if="exportPreset === 'custom'"
            v-model:value="exportRange"
            class="mg-export-range"
            value-format="YYYY-MM-DD"
            @click.stop
          />
          <a-button size="small" :loading="exporting === 'md'" @click.stop="downloadUsage('md')">导出 MD</a-button>
          <a-button size="small" :loading="exporting === 'html'" @click.stop="downloadUsage('html')">导出 HTML</a-button>
          <a-button size="small" :loading="exportingDept" @click.stop="downloadDeptReport">部门报表</a-button>
          <span class="mg-count">共 {{ filteredUsers.length }} 位用户</span>
        </div>
      </div>

      <div class="mg-table-wrap">
        <a-table
          class="mg-table mg-table-clickable"
          size="middle"
          :columns="userColumns"
          :data-source="filteredUsers"
          :loading="loading"
          :pagination="pagination"
          :scroll="{ x: 1080 }"
          row-key="id"
          :custom-row="rowClickable"
          @change="onTableChange"
        >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'isAdmin'">
            <!-- @click.stop：避免触发整行点击（行点击 = 打开详情抽屉） -->
            <span @click.stop>
              <a-switch
                :checked="record.isAdmin"
                :loading="!!record._saving"
                @change="(checked: boolean) => setAdmin(record, checked)"
              />
            </span>
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
            <a-button type="link" size="small" class="mg-action-btn" @click.stop="openDrawer(record)">查看配置</a-button>
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

    <!-- 用户统计（部门汇总 + 个人明细） -->
    <section class="mg-section">
      <div class="mg-section-head">
        <h2 class="mg-section-title">用户统计</h2>
        <span class="mg-count">共 {{ userStatsList.length }} 个用户 · {{ departments.length }} 个部门</span>
      </div>

      <!-- 部门汇总 -->
      <div v-if="departments.length > 0" class="ts-dept-summary">
        <h4 class="ts-sub-title">部门汇总</h4>
        <div class="ts-dept-grid">
          <div v-for="dept in departments" :key="dept.department" class="ts-dept-card">
            <div class="ts-dept-name">{{ dept.department }}</div>
            <div class="ts-dept-stats">
              <div class="ts-dept-stat">
                <span class="ts-dept-label">用户</span>
                <span class="ts-dept-value">{{ dept.userCount }}</span>
              </div>
              <div class="ts-dept-stat">
                <span class="ts-dept-label">任务</span>
                <span class="ts-dept-value">{{ dept.taskCount }}</span>
              </div>
              <div class="ts-dept-stat">
                <span class="ts-dept-label">成功率</span>
                <span class="ts-dept-value" :style="{ color: successColor(dept) }">
                  {{ rateText(dept.successRate) }}
                </span>
              </div>
              <div class="ts-dept-stat">
                <span class="ts-dept-label">耗时 P50</span>
                <span class="ts-dept-value">{{ formatDurationMs(dept.durationP50Ms) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 个人明细 -->
      <div class="ts-user-detail">
        <h4 class="ts-sub-title">个人明细</h4>
        <div class="mg-table-wrap">
          <a-table
            class="mg-table"
            size="small"
            :columns="userStatsColumns"
            :data-source="userStatsList"
            :loading="userStatsLoading"
            :pagination="false"
            :scroll="{ x: 1000 }"
            row-key="userId"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'username'">
                <a-tooltip :title="record.userId">
                  <span class="mg-muted">{{ record.username || '-' }}</span>
                </a-tooltip>
              </template>
              <template v-else-if="column.key === 'department'">
                <span class="mg-muted">{{ record.department || '-' }}</span>
              </template>
              <template v-else-if="column.key === 'successRate'">
                <span :style="{ color: successColor(record) }">{{ rateText(record.successRate) }}</span>
              </template>
              <template v-else-if="column.key === 'durationP50Ms'">
                {{ formatDurationMs(record.durationP50Ms) }}
              </template>
              <template v-else-if="column.key === 'lastUsedAt'">
                {{ formatTime(record.lastUsedAt) }}
              </template>
              <template v-else-if="column.key === 'topModels'">
                <div class="ts-top-models">
                  <span v-for="(m, i) in record.topModels" :key="i" class="ts-model-tag">
                    {{ shortModel(m.model) }}<span v-if="m.count > 1" class="ts-model-count">×{{ m.count }}</span>
                  </span>
                  <span v-if="!record.topModels?.length" class="mg-muted">-</span>
                </div>
              </template>
              <template v-else-if="column.key === 'smallSample'">
                <a-tag v-if="record.smallSample" color="default">样本少</a-tag>
                <span v-else class="mg-muted">✓</span>
              </template>
            </template>
          </a-table>
        </div>
      </div>

      <p class="ts-hint">
        <b>怎么看：</b>部门汇总显示各部门的整体使用情况；个人明细按任务数降序排列。
        成功率 = 成功 ÷ (成功 + 失败)，排除取消。「常用模型」显示该用户使用最多的前 3 个模型及次数。
        样本 &lt; 3 的结论仅供参考。
      </p>
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

        <!-- 组件构成：只看 微码 / Vue3 两类各几个 -->
        <div v-if="(activeUser.componentCount ?? 0) > 0" class="ud-type-block">
          <div class="ud-subtitle">组件构成（按生成类型）</div>
          <div class="ud-types">
            <div v-for="t in drawerTypeEntries" :key="t.key" class="ud-stat">
              <span class="ud-stat-num">{{ t.count }}</span>
              <span class="ud-stat-label">{{ t.label }}</span>
            </div>
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

          <div v-if="drawerProviders.length" class="ud-subtitle" style="margin-top:16px;">供应商池（providers）</div>
          <div v-if="drawerProviders.length" class="ud-providers-list">
            <div v-for="p in drawerProviders" :key="p.id" class="ud-provider-card">
              <div class="ud-provider-header">
                <span class="ud-provider-name">{{ p.name }}</span>
                <a-tag :color="p.role === 'vision' ? 'purple' : p.role === 'text' ? 'blue' : 'cyan'" size="small">
                  {{ p.role === 'vision' ? '视觉' : p.role === 'text' ? '文本' : '通用' }}
                </a-tag>
              </div>
              <div class="ud-provider-detail">
                <div><span class="ud-provider-label">模型:</span> {{ p.model }}</div>
                <div><span class="ud-provider-label">类型:</span> {{ p.providerType }}</div>
                <div><span class="ud-provider-label">Key:</span> {{ p.apiKey || '未配置' }}</div>
              </div>
            </div>
          </div>

          <div v-if="drawerModels.length" class="ud-subtitle" style="margin-top:16px;">模型库（models）</div>
          <div v-if="drawerModels.length" class="ud-providers-list">
            <div v-for="m in drawerModels" :key="m.id" class="ud-provider-card">
              <div class="ud-provider-header">
                <span class="ud-provider-name">{{ m.name }}</span>
                <a-tag :color="m.role === 'vision' ? 'purple' : m.role === 'text' ? 'blue' : 'cyan'" size="small">
                  {{ m.role === 'vision' ? '视觉' : m.role === 'text' ? '文本' : '通用' }}
                </a-tag>
              </div>
              <div class="ud-provider-detail">
                <div><span class="ud-provider-label">模型:</span> {{ m.model }}</div>
                <div><span class="ud-provider-label">类型:</span> {{ m.providerType }}</div>
                <div><span class="ud-provider-label">Key:</span> {{ m.apiKey || '未配置' }}</div>
              </div>
            </div>
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

        <template v-if="activeUser.usedTextModels || activeUser.usedVisionModels">
          <a-divider orientation="left">实际使用模型（任务统计）</a-divider>
          <div v-if="drawerUsedTextModels.length" class="ud-subtitle">文本模型</div>
          <div v-if="drawerUsedTextModels.length" class="ud-used-models">
            <div v-for="m in drawerUsedTextModels" :key="m.model" class="ud-used-model-row">
              <span class="ud-used-model-name">{{ m.model }}</span>
              <span class="ud-used-model-count">{{ m.count }} 次</span>
            </div>
          </div>
          <span v-if="!drawerUsedTextModels.length" class="mg-muted">无文本模型使用记录</span>

          <div v-if="drawerUsedVisionModels.length" class="ud-subtitle" style="margin-top:12px;">视觉模型</div>
          <div v-if="drawerUsedVisionModels.length" class="ud-used-models">
            <div v-for="m in drawerUsedVisionModels" :key="m.model" class="ud-used-model-row">
              <span class="ud-used-model-name">{{ m.model }}</span>
              <span class="ud-used-model-count">{{ m.count }} 次</span>
            </div>
          </div>
          <span v-if="!drawerUsedVisionModels.length" class="mg-muted">无视觉模型使用记录</span>
        </template>
      </template>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { message } from 'ant-design-vue'
import { useUserStore } from '@/store/modules/user'
import http from '@/core/http'
import { downloadByUrl } from '@/utils/download-file'

const userStore = useUserStore()

function formatTime(v: any): string {
  if (!v) return '-'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '-'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 与 TaskDetail / usage-export 同一套墙钟展示 */
function formatDurationMs(ms: unknown): string {
  const n = Number(ms)
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1000) return `${Math.round(n)}ms`
  const sec = n / 1000
  if (sec < 60) return `${sec < 10 ? sec.toFixed(1) : Math.round(sec)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h}h ${rm}m` : `${h}h`
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
const exportPreset = ref<'week' | 'd30' | 'd60' | 'custom'>('week')
const exportRange = ref<[string, string] | undefined>()
const exporting = ref<'md' | 'html' | ''>('')
const exportingDept = ref(false)

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

/** 供应商池（providers）—— 与 config 同级，不在 config 内部 */
const drawerProviders = computed(() => {
  return activeUser.value?.configProviders || []
})

/** 模型库（models）—— 与 config 同级 */
const drawerModels = computed(() => {
  return activeUser.value?.configModels || []
})

/** 实际使用的文本模型统计（按使用次数降序） */
const drawerUsedTextModels = computed(() => {
  const map = activeUser.value?.usedTextModels || {}
  return Object.entries(map)
    .map(([model, count]) => ({ model, count: count as number }))
    .sort((a, b) => b.count - a.count)
})

/** 实际使用的视觉模型统计（按使用次数降序） */
const drawerUsedVisionModels = computed(() => {
  const map = activeUser.value?.usedVisionModels || {}
  return Object.entries(map)
    .map(([model, count]) => ({ model, count: count as number }))
    .sort((a, b) => b.count - a.count)
})

function openDrawer(record: any) {
  activeUser.value = record
  drawerVisible.value = true
}

/** 行可点：单击整行打开详情抽屉（开关/按钮已用 @click.stop 阻断冒泡） */
const rowClickable = (record: any) => ({
  onClick: () => openDrawer(record),
  style: { cursor: 'pointer' },
})

/**
 * 组件构成的展示项：**只要 microcode / vue3 两类**（固定顺序、含 0）。
 * `components.target` 缺失的存量记录（unlabeled）不展示——那是数据缺口，不是「类型」。
 */
const TYPE_ORDER: Array<{ key: string; label: string; color: string }> = [
  { key: 'microcode', label: '微码组件', color: 'blue' },
  { key: 'vue3', label: 'Vue3 组件', color: 'green' },
]

/** 抽屉「组件构成」：固定两项，无数据的类型显示 0 */
const drawerTypeEntries = computed(() => {
  const by = (activeUser.value?.componentByType || {}) as Record<string, number>
  return TYPE_ORDER.map((t) => ({ ...t, count: Number(by[t.key]) || 0 }))
})

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

async function downloadUsage(format: 'md' | 'html') {
  if (exporting.value) return
  if (exportPreset.value === 'custom' && (!exportRange.value?.[0] || !exportRange.value?.[1])) {
    message.warning('自定义时间请先选择起止日期')
    return
  }
  exporting.value = format
  const params = new URLSearchParams()
  params.set('preset', exportPreset.value)
  params.set('format', format)
  if (deptFilter.value) params.set('dept', deptFilter.value)
  if (exportPreset.value === 'custom' && exportRange.value) {
    params.set('from', exportRange.value[0])
    params.set('to', exportRange.value[1])
  }
  try {
    await downloadByUrl(`/api/admin/usage-export?${params.toString()}`, `usage-export.${format}`)
  } finally {
    exporting.value = ''
  }
}

async function downloadDeptReport() {
  if (exportingDept.value) return
  exportingDept.value = true
  try {
    await downloadByUrl('/api/admin/dept-report', 'dept-report.html')
  } finally {
    exportingDept.value = false
  }
}

// ---------- 用户统计 ----------
const userStatsList = ref<any[]>([])
const departments = ref<any[]>([])
const userStatsLoading = ref(false)

const userStatsColumns = [
  { title: '用户', key: 'username', width: 120 },
  { title: '部门', key: 'department', width: 120 },
  { title: '任务数', key: 'taskCount', width: 80, sorter: (a: any, b: any) => a.taskCount - b.taskCount },
  { title: '成功', key: 'completed', width: 60 },
  { title: '失败', key: 'failed', width: 60 },
  { title: '成功率', key: 'successRate', width: 80, sorter: (a: any, b: any) => (a.successRate || 0) - (b.successRate || 0) },
  { title: '耗时 P50', key: 'durationP50Ms', width: 90, sorter: (a: any, b: any) => (a.durationP50Ms || 0) - (b.durationP50Ms || 0) },
  { title: '最近使用', key: 'lastUsedAt', width: 130, sorter: (a: any, b: any) => (a.lastUsedAt || 0) - (b.lastUsedAt || 0) },
  { title: '常用模型', key: 'topModels', width: 200 },
  { title: '样本', key: 'smallSample', width: 70 },
]

function rateText(r: number | null): string {
  if (r === null || r === undefined) return '-'
  return `${(r * 100).toFixed(0)}%`
}

function successColor(record: any): string {
  const r = record?.successRate
  if (r === null || r === undefined) return 'inherit'
  if (r >= 0.8) return '#52c41a'
  if (r >= 0.5) return '#faad14'
  return '#ff4d4f'
}

function shortModel(name: string): string {
  if (!name) return '-'
  // 取最后一段（如 qwen-plus → qwen-plus；gpt-4o → gpt-4o）
  const parts = name.split('/')
  return parts[parts.length - 1].slice(0, 16)
}

async function loadUserStats() {
  userStatsLoading.value = true
  try {
    const data = await http.get('/api/admin/user-stats')
    userStatsList.value = data.data.list || []
    departments.value = data.data.departments || []
  } catch (e: any) {
    // 静默失败：用户统计非核心功能，不阻塞用户管理主页面
    console.warn('加载用户统计失败', e.message)
  } finally {
    userStatsLoading.value = false
  }
}

onMounted(() => {
  loadUsers()
  loadUserStats()
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

.mg-export-preset {
  width: 110px;
}

.mg-export-range {
  width: 230px;
}

.mg-table-wrap {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}

.mg-table {
  min-width: 1080px;
}

// 行可点：整行单击打开详情抽屉（开关/按钮已用 @click.stop 阻断冒泡）
.mg-table-clickable :deep(.ant-table-tbody > tr) {
  cursor: pointer;
}
.mg-table-clickable :deep(.ant-table-tbody > tr:hover > td) {
  background: var(--bg-hover);
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
  background: var(--bg-alt);
  border: 1px solid var(--border-default);
  border-radius: 8px;
}

// 组件构成（按生成类型）：复用 .ud-stat 卡片样式，2 列排布
.ud-type-block {
  margin-top: 14px;
}

.ud-types {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 8px;
}

.ud-types-3 {
  grid-template-columns: repeat(3, 1fr);
}

.ud-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
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

// 供应商池 / 模型库卡片列表
.ud-providers-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ud-provider-card {
  padding: 10px 12px;
  background: var(--bg-alt);
  border: 1px solid var(--border-default);
  border-radius: 6px;
}

.ud-provider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ud-provider-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.ud-provider-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.ud-provider-label {
  color: var(--text-secondary);
  margin-right: 4px;
}

// 实际使用模型统计
.ud-used-models {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ud-used-model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--bg-alt);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-size: 13px;
}

.ud-used-model-name {
  color: var(--text-primary);
  font-weight: 500;
}

.ud-used-model-count {
  color: var(--brand, #1677ff);
  font-weight: 600;
  font-size: 12px;
}

// 用户统计区域
.ts-dept-summary {
  margin-bottom: 24px;
}

.ts-sub-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #333);
  margin: 0 0 12px;
}

.ts-dept-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.ts-dept-card {
  padding: 12px;
  background: var(--bg-elevated, #fafafa);
  border: 1px solid var(--border-color, #eee);
  border-radius: 8px;
}

.ts-dept-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #333);
  margin-bottom: 8px;
}

.ts-dept-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.ts-dept-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ts-dept-label {
  font-size: 11px;
  color: var(--text-secondary, #888);
}

.ts-dept-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #333);
}

.ts-user-detail {
  margin-top: 24px;
}

.ts-top-models {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ts-model-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  font-size: 11px;
  background: var(--bg-elevated, #fafafa);
  border: 1px solid var(--border-color, #eee);
  border-radius: 4px;
  color: var(--text-primary, #333);
}

.ts-model-count {
  margin-left: 2px;
  color: var(--text-secondary, #888);
  font-size: 10px;
}

.ts-hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--text-secondary, #888);
  line-height: 1.7;
}
</style>
