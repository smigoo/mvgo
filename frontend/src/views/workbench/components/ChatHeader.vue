<template>
  <div class="chat-header">
    <div class="header-content">
      <h3>{{ conversation.title }}</h3>
      <div class="header-meta">
        <span class="message-count">{{ conversation.messageCount }} 条消息</span>

        <!-- R7 锚点：当前组件 chip（生成/切换组件后显示，可点击 × 清除） -->
        <div
          v-if="conversation.currentComponentId"
          class="anchor-chip"
          :title="`当前组件：${conversation.currentComponentId}（后续「修改/绑定/推送/体检/回滚」默认对它操作）`"
        >
          <span class="anchor-dot"></span>
          <span class="anchor-label">{{ conversation.currentComponentId }}</span>
          <button
            class="anchor-clear"
            @click.stop="$emit('clear-component')"
            title="清除当前组件锚点"
            aria-label="清除当前组件锚点"
          >×</button>
        </div>

        <!-- 工具栏按钮 -->
        <div class="header-toolbar">
          <!-- R16-R18 功能跳转入口 -->
          <button
            v-for="link in jumpLinks"
            :key="link.key"
            class="toolbar-btn jump-btn"
            :title="link.title"
            :aria-label="link.title"
            @click="jumpTo(link.path)"
          >
            {{ link.label }}
          </button>
          <!-- 全局配置按钮（模型 + 外部服务） -->
          <button
            class="toolbar-btn"
            @click="$emit('open-config')"
            title="全局配置"
            aria-label="全局配置"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <!-- 主题切换 -->
          <button
            class="toolbar-btn"
            @click="$emit('toggle-theme')"
            :title="isDark ? '切换到浅色' : '切换到深色'"
            :aria-label="isDark ? '切换到浅色' : '切换到深色'"
          >
            <!-- 太阳图标（深色模式下显示） -->
            <svg v-if="isDark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
            <!-- 月亮图标（浅色模式下显示） -->
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();

const props = defineProps({
  conversation: {
    type: Object,
    required: true,
  },
  isDark: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['open-config', 'toggle-theme', 'clear-component']);

// R16-R18：功能跳转入口（组件库 / 任务中心 / 接口生成）
const jumpLinks = [
  { key: 'components', title: '组件库', path: '/components', label: '组件库' },
  { key: 'tasks', title: '任务中心', path: '/tasks', label: '任务' },
  { key: 'api', title: '接口生成', path: '/generator/api', label: '接口' },
];

function jumpTo(path) {
  router.push(path);
}
</script>

<style scoped lang="less">
.chat-header {
  padding: 12px 20px;
  border-bottom: 1px solid var(--wb-border, #e5e7eb);
  background: var(--wb-surface, #ffffff);

  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;

    h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--wb-text, #1a1a2e);
    }

    .header-meta {
      display: flex;
      align-items: center;
      gap: 16px;

      .message-count {
        font-size: 11px;
        color: var(--wb-text-muted, #9ca3af);
      }

      .header-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: 8px;
      }

      .toolbar-btn {
        width: 32px;
        height: 32px;
        background: transparent;
        border: 1px solid var(--wb-border, #e5e7eb);
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--wb-text-secondary, #6b7280);
        transition:
          border-color 0.2s ease,
          color 0.2s ease,
          background 0.2s ease;
        flex-shrink: 0;

        &:hover {
          border-color: var(--wb-primary, #4f46e5);
          color: var(--wb-primary, #4f46e5);
          background: var(--wb-primary-bg, #f5f3ff);
        }

        /* R16-R18 跳转按钮：文字型，宽度自适应 */
        &.jump-btn {
          width: auto;
          padding: 0 12px;
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
        }
      }
    }
  }
}
</style>
