<template>
  <div class="chat-header">
    <div class="header-content">
      <h3>{{ conversation.title }}</h3>
      <div class="header-meta">
        <span class="message-count">{{ conversation.messageCount }} 条消息</span>

        <!-- P1⑤ 反馈闭环观察窗：本月 👍/👎 聚合统计（只读，hover 看说明） -->
        <span
          v-if="feedbackStats"
          class="feedback-stats"
          :title="`本月组件生成反馈：👍 ${feedbackStats.up} · 👎 ${feedbackStats.down}（共 ${feedbackStats.total} 条，好评率 ${feedbackStats.upRate}%）`"
        >
          <span class="fb-item up">👍 {{ feedbackStats.up }}</span>
          <span class="fb-item down">👎 {{ feedbackStats.down }}</span>
        </span>

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
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getFeedbackStats } from '@/api/workbench';

const router = useRouter();

// P1⑤ 反馈闭环观察窗：本月 👍/👎 聚合统计（只读展示）
const feedbackStats = ref(null);
onMounted(async () => {
  try {
    const stats = await getFeedbackStats(1);
    // 后端返回形如 { total, up, down, upRate }，total>0 才展示
    if (stats && typeof stats.total === 'number' && stats.total > 0) {
      feedbackStats.value = stats;
    }
  } catch (err) {
    // 统计拉取失败静默降级（不阻塞工作台，反馈提交本身不受影响）
    console.warn('反馈统计拉取失败（忽略）:', err);
  }
});

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

      /* P1⑤ 反馈统计 chip */
      .feedback-stats {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 8px;
        border: 1px solid var(--wb-border, #e5e7eb);
        border-radius: 999px;
        font-size: 11px;
        cursor: default;
        flex-shrink: 0;

        .fb-item {
          font-weight: 500;

          &.up {
            color: #16a34a;
          }

          &.down {
            color: #dc2626;
          }
        }
      }

      /* R7 锚点 chip */
      .anchor-chip {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 4px 3px 8px;
        border: 1px solid var(--wb-primary, #4f46e5);
        border-radius: 999px;
        background: var(--wb-primary-bg, #f5f3ff);
        max-width: 260px;
        flex-shrink: 0;

        .anchor-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--wb-primary, #4f46e5);
          flex-shrink: 0;
        }

        .anchor-label {
          font-size: 11px;
          font-weight: 500;
          color: var(--wb-primary, #4f46e5);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .anchor-clear {
          width: 16px;
          height: 16px;
          border: none;
          border-radius: 50%;
          background: transparent;
          color: var(--wb-primary, #4f46e5);
          font-size: 13px;
          line-height: 1;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.2s ease;

          &:hover {
            background: var(--wb-primary, #4f46e5);
            color: #fff;
          }
        }
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
