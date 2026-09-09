<template>
  <a-modal
    v-model:open="visible"
    title="推送到 GitLab"
    @ok="handlePush"
    @cancel="handleCancel"
    :confirmLoading="pushing"
    :okText="'推送'"
    width="560px"
    destroy-on-close
  >
    <!-- 运行中警告 -->
    <a-alert
      v-if="isRunning"
      type="warning"
      show-icon
      style="margin-bottom: 16px"
    >
      <template #message>组件仍在生成中</template>
      <template #description>
        推送的是当前已落盘的中间产物，后续生成可能会覆盖 GitLab 中的代码。
      </template>
    </a-alert>

    <a-form :label-col="{ style: { width: '110px' } }" :wrapper-col="{ style: { width: '400px' } }">
      <!-- 仓库信息 -->
      <a-form-item label="个人访问令牌" required>
        <a-input-password
          v-model:value="form.accessToken"
          placeholder="glpat-xxxxxxxxxxxx"
          @change="onFormChange"
        />
      </a-form-item>

      <a-form-item label="项目" required>
        <div style="display: flex; gap: 8px; align-items: center">
          <a-auto-complete
            v-model:value="form.repoUrl"
            :options="filteredProjectOptions"
            placeholder="输入或选择项目"
            style="flex: 1"
            @change="onFormChange"
            @select="onProjectSelect"
          >
            <template #option="{ value: val }">
              <div style="display: flex; flex-direction: column; padding: 4px 0">
                <span style="font-weight: 500">{{ val }}</span>
                <span style="font-size: 12px; color: #999">{{ getProjectPath(val) }}</span>
              </div>
            </template>
          </a-auto-complete>
          <a-button 
            :loading="loadingProjects" 
            :disabled="!form.accessToken"
            @click="loadProjects"
            size="small"
          >
            {{ loadingProjects ? '加载中' : '加载项目' }}
          </a-button>
        </div>
      </a-form-item>

      <a-form-item label="分支" required>
        <div style="display: flex; gap: 8px; align-items: center">
          <a-auto-complete
            v-model:value="form.branch"
            :options="filteredBranchOptions"
            placeholder="输入或选择分支"
            style="flex: 1"
            @change="onFormChange"
          >
            <template #option="{ value: val, isDefault }">
              <span>{{ val }}</span>
              <span v-if="isDefault" style="margin-left: 8px; color: #52c41a; font-size: 12px">
                (默认)
              </span>
            </template>
          </a-auto-complete>
          <a-button 
            :loading="loadingBranches" 
            :disabled="!form.repoUrl || !form.accessToken"
            @click="loadBranches"
            size="small"
          >
            {{ loadingBranches ? '加载中' : '加载分支' }}
          </a-button>
        </div>
      </a-form-item>

      <!-- 提交信息区域 -->
      <a-divider style="margin: 8px 0">提交信息（公司规范）</a-divider>

      <!-- 模式切换 -->
      <div style="margin-bottom: 12px">
        <a-radio-group v-model:value="inputMode" button-style="solid" size="small">
          <a-radio-button value="fields">分字段填写</a-radio-button>
          <a-radio-button value="paste">整段粘贴</a-radio-button>
        </a-radio-group>
      </div>

      <!-- 模式1：分字段 -->
      <template v-if="inputMode === 'fields'">
        <a-row :gutter="12">
          <a-col :span="14">
            <a-form-item label="#code#" required>
              <a-input
                v-model:value="form.code"
                placeholder="如 50212855"
                @change="onFormChange"
              />
            </a-form-item>
          </a-col>
          <a-col :span="10">
            <a-form-item label="#reqcode#" required>
              <a-input
                v-model:value="form.reqcode"
                placeholder="默认 0"
                @change="onFormChange"
              />
            </a-form-item>
          </a-col>
        </a-row>

        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="类型" required>
              <a-select v-model:value="form.type" @change="onFormChange">
                <a-select-option value="feat">feat - 新增功能</a-select-option>
                <a-select-option value="fix">fix - Bug 修复</a-select-option>
                <a-select-option value="refactor">refactor - 重构</a-select-option>
                <a-select-option value="test">test - 单元测试</a-select-option>
                <a-select-option value="word">word - 文档</a-select-option>
                <a-select-option value="conf">conf - 配置</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="AI 生成代码">
              <a-switch
                v-model:checked="form.aiCoding"
                size="small"
                @change="onFormChange"
              />
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="描述" required>
          <a-input
            v-model:value="form.note"
            placeholder="如：新增组件推送功能"
            @change="onFormChange"
          />
        </a-form-item>
      </template>

      <!-- 模式2：整段粘贴 -->
      <template v-if="inputMode === 'paste'">
        <a-textarea
          v-model:value="pastedText"
          :rows="6"
          placeholder="粘贴完整提交信息，格式：&#10;#code#50212855&#10;#reqcode#0&#10;#note#[feat] 描述&#10;#ai-coding#"
          style="font-family: monospace; font-size: 13px"
        />
        <div style="margin-top: 4px">
          <a-button type="link" size="small" @click="parsePastedText">
            🔄 解析并回填到上方字段
          </a-button>
        </div>
      </template>

      <!-- 预览区 -->
      <a-divider style="margin: 8px 0">预览</a-divider>
      <div class="commit-preview">
        <pre>{{ commitMessagePreview }}</pre>
        <a-button type="link" size="small" @click="copyPreview" class="copy-btn">
          📋 复制
        </a-button>
      </div>
    </a-form>
  </a-modal>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import http from '@/core/http'

const props = defineProps({
  /** 组件 ID */
  componentId: { type: String, required: true },
  /** 组件是否在生成中 */
  isRunning: { type: Boolean, default: false },
})

const emit = defineEmits(['success', 'cancel'])

// ─── 状态 ─────────────────────────────────────────────
const visible = ref(false)
const pushing = ref(false)
const inputMode = ref('fields')
const pastedText = ref('')

// 项目/分支自动补全
const loadingProjects = ref(false)
const loadingBranches = ref(false)
const projectOptions = ref([])
const branchOptions = ref([])
const projectMap = new Map() // repoUrl -> { pathWithNamespace, httpUrlToRepo }

// 项目/分支模糊搜索（computed 动态过滤）
const filteredProjectOptions = computed(() => {
  const keyword = form.repoUrl?.toLowerCase().trim()
  if (!keyword) return projectOptions.value
  return projectOptions.value.filter(opt => {
    const url = (opt.value || '').toLowerCase()
    const path = getProjectPath(opt.value || '').toLowerCase()
    return url.includes(keyword) || path.includes(keyword)
  })
})

const filteredBranchOptions = computed(() => {
  const keyword = form.branch?.toLowerCase().trim()
  if (!keyword) return branchOptions.value
  return branchOptions.value.filter(opt =>
    (opt.value || '').toLowerCase().includes(keyword)
  )
})

// localStorage key
const STORAGE_KEY = 'mvgo_gitlab_push'

// 表单默认值
const defaultForm = {
  accessToken: '',
  repoUrl: '',
  branch: 'main',
  code: '',
  reqcode: '0',
  type: 'feat',
  note: '',
  aiCoding: false,
}

const form = reactive({ ...defaultForm })

// ─── localStorage 缓存（不再存储 PAT） ────────────────────────────────
function loadFromCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const cached = JSON.parse(raw)
      Object.assign(form, {
        repoUrl: cached.repoUrl || '',
        branch: cached.branch || 'main',
        code: cached.code || '',
        reqcode: cached.reqcode || '0',
        type: cached.type || 'feat',
        note: cached.note || '',
        aiCoding: cached.aiCoding || false,
      })
    }
  } catch {}
}

function saveToCache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      repoUrl: form.repoUrl,
      branch: form.branch,
      code: form.code,
      reqcode: form.reqcode,
      type: form.type,
      note: form.note,
      aiCoding: form.aiCoding,
    }))
  } catch {}
}

function onFormChange() {
  saveToCache()
}

// ─── 项目/分支加载 ─────────────────────────────────
async function loadProjects() {
  if (!form.accessToken) {
    message.warning('请先填写访问令牌')
    return
  }
  loadingProjects.value = true
  try {
    const res = await http.post('/api/component/gitlab-projects', {
      accessToken: form.accessToken,
    })
    if (res.success && Array.isArray(res.data)) {
      projectMap.clear()
      projectOptions.value = res.data.map((p) => {
        projectMap.set(p.httpUrlToRepo, p)
        return { value: p.httpUrlToRepo }
      })
      message.success(`已加载 ${res.data.length} 个项目`)
    } else {
      message.error(res.message || '加载项目失败')
    }
  } catch (err) {
    console.error('加载项目失败:', err)
    const errMsg = err?.data?.message || err?.message || String(err)
    message.error('加载项目失败: ' + errMsg)
  } finally {
    loadingProjects.value = false
  }
}

async function loadBranches() {
  if (!form.accessToken || !form.repoUrl) {
    message.warning('请先填写访问令牌和项目 URL')
    return
  }
  loadingBranches.value = true
  try {
    const res = await http.post('/api/component/gitlab-branches', {
      accessToken: form.accessToken,
      repoUrl: form.repoUrl,
    })
    if (res.success && Array.isArray(res.data)) {
      branchOptions.value = res.data.map((b) => ({
        value: b.name,
        isDefault: b.isDefault,
      }))
      message.success(`已加载 ${res.data.length} 个分支`)
    } else {
      message.error(res.message || '加载分支失败')
    }
  } catch (err) {
    console.error('加载分支失败:', err)
    const errMsg = err?.data?.message || err?.message || String(err)
    message.error('加载分支失败: ' + errMsg)
  } finally {
    loadingBranches.value = false
  }
}

function onProjectSelect(value) {
  // 选择项目后自动加载分支
  if (value && form.accessToken) {
    loadBranches()
  }
}

function getProjectPath(repoUrl) {
  const p = projectMap.get(repoUrl)
  return p?.pathWithNamespace || ''
}

// ── 打开 / 关闭 ─────────────────────────────────────
async function open() {
  loadFromCache()
  // 默认 code 为 '0'
  if (!form.code) {
    form.code = '0'
  }

  // 尝试从后端获取已配置的 PAT
  try {
    const res = await http.get('/api/user/git-credential/token')
    if (res.success && res.data?.configured && res.data.token) {
      form.accessToken = res.data.token
    }
  } catch (err) {
    console.warn('获取 PAT 失败:', err)
  }

  visible.value = true
}

function handleCancel() {
  visible.value = false
  emit('cancel')
}

// ─── 预览 ────────────────────────────────────────────
const commitMessagePreview = computed(() => {
  const lines = [
    `#code#${form.code || '0'}`,
    `#reqcode#${form.reqcode || '0'}`,
    `#note#[${form.type}] ${form.note || ''}`,
    form.aiCoding ? '#ai-coding#' : '',
  ].filter(Boolean)
  return lines.join('\n')
})

// ─── 解析粘贴文本 ────────────────────────────────────
function parsePastedText() {
  const lines = pastedText.value.split('\n').map(l => l.trim())

  const codeMatch = lines.find(l => l.startsWith('#code#'))
  const reqcodeMatch = lines.find(l => l.startsWith('#reqcode#'))
  const noteMatch = lines.find(l => l.startsWith('#note#'))
  const aiMatch = lines.find(l => l.startsWith('#ai-coding#'))

  if (codeMatch) form.code = codeMatch.replace('#code#', '').trim()
  if (reqcodeMatch) form.reqcode = reqcodeMatch.replace('#reqcode#', '').trim() || '0'

  if (noteMatch) {
    const noteText = noteMatch.replace('#note#', '')
    const typeMatch = noteText.match(/\[(feat|fix|refactor|test|word|conf)\]\s*(.+)/)
    if (typeMatch) {
      form.type = typeMatch[1]
      form.note = typeMatch[2].trim()
    } else {
      form.note = noteText.trim()
    }
  }

  form.aiCoding = !!aiMatch
  inputMode.value = 'fields'
  saveToCache()
  message.success('已解析并回填')
}

// ─── 复制 ───────────────────────────────────────────
async function copyPreview() {
  try {
    await navigator.clipboard.writeText(commitMessagePreview.value)
    message.success('已复制到剪贴板')
  } catch {
    // fallback
    const textarea = document.createElement('textarea')
    textarea.value = commitMessagePreview.value
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    message.success('已复制到剪贴板')
  }
}

// ─── 推送 ────────────────────────────────────────────
async function handlePush() {
  if (!form.accessToken) { message.error('请填写个人访问令牌'); return }
  if (!form.repoUrl) { message.error('请填写项目 URL'); return }
  if (!form.branch) { message.error('请填写分支名'); return }
  if (!form.code) { message.error('请填写 #code#'); return }
  if (!form.note) { message.error('请填写描述'); return }

  // 运行中二次确认
  if (props.isRunning) {
    // Modal.confirm 已在外部处理（调用方自行判断），此处跳过
  }

  pushing.value = true
  try {
    const res = await http.post('/api/component/push-to-gitlab', {
      componentId: props.componentId,
      repoUrl: form.repoUrl,
      branch: form.branch,
      accessToken: form.accessToken,
      commit: {
        code: form.code,
        reqcode: form.reqcode,
        type: form.type,
        note: form.note,
        aiCoding: form.aiCoding,
      },
    })
    if (res.success) {
      message.success(res.message || '推送成功！')
      visible.value = false
      emit('success', res.data)
    } else {
      message.error(res.data?.error || '推送失败')
    }
  } catch (err) {
    console.error('推送失败:', err)
    message.error('推送失败: ' + (err.message || err))
  } finally {
    pushing.value = false
  }
}

// 暴露给父组件
defineExpose({ open })
</script>

<style scoped>
.commit-preview {
  position: relative;
  background: #f5f5f5;
  padding: 12px 40px 12px 12px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.6;
  color: #333;
}

.copy-btn {
  position: absolute;
  right: 8px;
  top: 4px;
}

/* AutoComplete 选项样式优化 */
:deep(.ant-select-dropdown .ant-select-item) {
  padding: 8px 12px;
}
</style>
