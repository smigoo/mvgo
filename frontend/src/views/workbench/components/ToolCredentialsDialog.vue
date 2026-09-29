<template>
  <teleport to="body">
    <div v-if="visible" class="tool-credentials-overlay" @click.self="$emit('close')">
      <div class="tool-credentials-dialog">
        <div class="dialog-header">
          <h3>工具凭据配置</h3>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>

        <div class="dialog-body">
          <p class="description">
            为当前对话配置独立的工具凭据，缺省时将使用全局配置。
          </p>

          <!-- 加载 / 错误态：避免异步返回前误显示"未配置" -->
          <div v-if="loading" class="loading-tip">正在读取凭据状态…</div>
          <div v-else-if="loadError" class="error-tip">{{ loadError }}</div>

          <!-- Figma Token -->
          <div class="credential-section">
            <div class="section-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 5.5A3.5 3.5 0 1 0 12 5.5A3.5 3.5 0 1 0 19 5.5M5 12.5A3.5 3.5 0 1 0 12 12.5A3.5 3.5 0 1 0 19 12.5M5 19.5A3.5 3.5 0 1 0 12 19.5A3.5 3.5 0 1 0 19 19.5"/>
              </svg>
              <span>Figma Token</span>
              <span v-if="loading" class="status-badge loading">读取中</span>
              <span v-else-if="credentials.figmaToken" class="status-badge configured">已配置</span>
              <span v-else class="status-badge not-configured">未配置(回退全局)</span>
            </div>
            <div class="input-wrapper">
              <input
                v-model="form.figmaToken"
                type="password"
                placeholder="输入 Figma Personal Access Token"
              />
              <button
                v-if="form.figmaToken"
                class="clear-btn"
                @click="form.figmaToken = ''"
                title="清除"
              >
                ✕
              </button>
            </div>
          </div>

          <!-- Apifox Token -->
          <div class="credential-section">
            <div class="section-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <span>Apifox Token</span>
              <span v-if="loading" class="status-badge loading">读取中</span>
              <span v-else-if="credentials.apifoxToken" class="status-badge configured">已配置</span>
              <span v-else class="status-badge not-configured">未配置(回退全局)</span>
            </div>
            <div class="input-wrapper">
              <input
                v-model="form.apifoxToken"
                type="password"
                placeholder="输入 Apifox Access Token"
              />
              <button
                v-if="form.apifoxToken"
                class="clear-btn"
                @click="form.apifoxToken = ''"
                title="清除"
              >
                ✕
              </button>
            </div>
          </div>

          <!-- GitLab Token -->
          <div class="credential-section">
            <div class="section-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16v16H4z"/>
                <path d="M9 9h6v6H9z"/>
              </svg>
              <span>GitLab Token</span>
              <span v-if="loading" class="status-badge loading">读取中</span>
              <span v-else-if="credentials.gitlabToken" class="status-badge configured">已配置</span>
              <span v-else class="status-badge not-configured">未配置(回退全局)</span>
            </div>
            <div class="input-wrapper">
              <input
                v-model="form.gitlabToken"
                type="password"
                placeholder="输入 GitLab Personal Access Token"
              />
              <button
                v-if="form.gitlabToken"
                class="clear-btn"
                @click="form.gitlabToken = ''"
                title="清除"
              >
                ✕
              </button>
            </div>
          </div>

          <!-- GitLab Project URL -->
          <div class="credential-section">
            <div class="section-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
              <span>GitLab 项目 URL</span>
              <span v-if="loading" class="status-badge loading">读取中</span>
              <span v-else-if="credentials.gitlabProjectUrl" class="status-badge configured">已配置</span>
              <span v-else class="status-badge not-configured">未配置</span>
            </div>
            <div class="input-wrapper">
              <input
                v-model="form.gitlabProjectUrl"
                type="text"
                placeholder="例如：https://gitlab.com/your-org/your-project"
              />
              <button
                v-if="form.gitlabProjectUrl"
                class="clear-btn"
                @click="form.gitlabProjectUrl = ''"
                title="清除"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="cancel-btn" @click="$emit('close')">取消</button>
          <button class="save-btn" @click="handleSave" :disabled="saving">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, reactive, watch } from 'vue';
import { useWorkbenchStore } from '@/stores/workbench';

const props = defineProps({
  visible: Boolean,
  conversationId: String,
});

const emit = defineEmits(['close', 'saved']);

const workbenchStore = useWorkbenchStore();

const credentials = ref({
  figmaToken: false,
  apifoxToken: false,
  gitlabToken: false,
  gitlabProjectUrl: false,
});

const form = reactive({
  figmaToken: '',
  apifoxToken: '',
  gitlabToken: '',
  gitlabProjectUrl: '',
});

const saving = ref(false);
const loading = ref(false);
const loadError = ref('');

// 加载当前凭据状态
// 用 immediate watch：避免因 <teleport> + v-if 的首帧渲染时序，
// 导致 credentials 停留在初始值 false（UI 恒显示"未配置"）。
watch(
  () => [props.visible, props.conversationId],
  async ([visible, conversationId]) => {
    if (!visible || !conversationId) return;
    loading.value = true;
    loadError.value = '';
    try {
      const creds = await workbenchStore.fetchToolCredentials(conversationId);
      if (creds) {
        credentials.value = creds;
      } else {
        loadError.value = '未获取到凭据状态';
      }
    } catch (err) {
      console.error('Failed to fetch tool credentials:', err);
      loadError.value = err?.message || '加载失败';
    } finally {
      loading.value = false;
    }
    // 清空表单（不显示已配置的值的明文）
    form.figmaToken = '';
    form.apifoxToken = '';
    form.gitlabToken = '';
    form.gitlabProjectUrl = '';
  },
  { immediate: true },
);

async function handleSave() {
  if (!props.conversationId) return;

  saving.value = true;
  try {
    // 只提交有值的字段，空字符串表示清除
    const payload = {};
    if (form.figmaToken !== undefined) payload.figmaToken = form.figmaToken;
    if (form.apifoxToken !== undefined) payload.apifoxToken = form.apifoxToken;
    if (form.gitlabToken !== undefined) payload.gitlabToken = form.gitlabToken;
    if (form.gitlabProjectUrl !== undefined) payload.gitlabProjectUrl = form.gitlabProjectUrl;

    await workbenchStore.saveToolCredentials(props.conversationId, payload);
    // saveToolCredentials 已解包到 data 层（无 success 字段），成功才走到这里 → 直接关闭并刷新
    emit('saved');
    emit('close');
  } catch (err) {
    console.error('Failed to save credentials:', err);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
/*
 * ⚠️ 本弹窗 teleport 到 body，够不到 .workbench-container 上的 --wb-* 变量。
 * 故在自身根节点上就地定义同名变量（跟随系统深色），保证浅/深色都可读。
 * 注意：<style scoped> 是普通 CSS，@media 必须写在顶层，不能嵌进选择器。
 */
.tool-credentials-overlay {
  --wb-bg: #f7f8fa;
  --wb-surface: #ffffff;
  --wb-surface-alt: #f2f3f5;
  --wb-border: #e5e7eb;
  --wb-border-light: #f0f0f0;
  --wb-text: #1a1a2e;
  --wb-text-secondary: #6b7280;
  --wb-text-muted: #9ca3af;
  --wb-primary: #4f46e5;
  --wb-primary-light: #eef2ff;
  --wb-success: #10b981;
  --wb-success-bg: #ecfdf5;

  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.tool-credentials-dialog {
  background: var(--wb-surface);
  border-radius: 12px;
  width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--wb-border);
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--wb-text);
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--wb-text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.close-btn:hover {
  background: #f3f4f6;
  color: var(--wb-text);
}

.dialog-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.description {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--wb-text-secondary);
  line-height: 1.5;
}

.credential-section {
  margin-bottom: 20px;
}

.credential-section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--wb-text);
}

.section-header svg {
  color: var(--wb-text-secondary);
}

.status-badge {
  margin-left: auto;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.status-badge.configured {
  background: #dcfce7;
  color: #166534;
}

.status-badge.not-configured {
  background: #f3f4f6;
  color: var(--wb-text-secondary);
}

/* 读取中：避免把"还没返回"误读成"没配" */
.status-badge.loading {
  background: #e0e7ff;
  color: #4338ca;
  animation: cred-pulse 1.2s ease-in-out infinite;
}

@keyframes cred-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

.loading-tip {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--wb-primary-light);
  border: 1px solid #c7d2fe;
  border-radius: 6px;
  font-size: 12px;
  color: #4338ca;
}

.error-tip {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--wb-danger-bg);
  border: 1px solid #fecaca;
  border-radius: 6px;
  font-size: 12px;
  color: #b91c1c;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-wrapper input {
  width: 100%;
  padding: 10px 12px;
  padding-right: 36px;
  border: 1px solid var(--wb-border);
  border-radius: 8px;
  font-size: 13px;
  transition: border-color 0.15s;
}

.input-wrapper input:focus {
  outline: none;
  border-color: var(--wb-primary);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.input-wrapper input::placeholder {
  color: var(--wb-text-muted);
}

.clear-btn {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: var(--wb-text-muted);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.clear-btn:hover {
  background: #f3f4f6;
  color: var(--wb-text-secondary);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--wb-border);
}

.cancel-btn,
.save-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.cancel-btn {
  background: var(--wb-surface);
  border: 1px solid var(--wb-border);
  color: var(--wb-text);
}

.cancel-btn:hover {
  background: var(--wb-surface-alt);
  border-color: var(--wb-text-muted);
}

.save-btn {
  background: #4f46e5;
  border: none;
  color: #fff;
}

.save-btn:hover:not(:disabled) {
  background: #4338ca;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 深色环境：变量就地反色（弹窗 teleport 在 body 下，跟随系统深色） */
@media (prefers-color-scheme: dark) {
  .tool-credentials-overlay {
    --wb-bg: #17181c;
    --wb-surface: #1f2126;
    --wb-surface-alt: #26282e;
    --wb-border: #34363d;
    --wb-border-light: #2b2d33;
    --wb-text: #e8e9eb;
    --wb-text-secondary: #a2a6ae;
    --wb-text-muted: #7a7e87;
    --wb-primary: #6366f1;
    --wb-primary-light: #2b2d45;
    --wb-success: #34d399;
    --wb-success-bg: #12301f;
  }

  /* 输入框：深色底 + 浅字（原样式白底黑字在深色下刺眼） */
  .input-wrapper input {
    background: var(--wb-surface-alt);
    color: var(--wb-text);
  }

  .close-btn {
    color: var(--wb-text-muted);
  }
}
</style>
