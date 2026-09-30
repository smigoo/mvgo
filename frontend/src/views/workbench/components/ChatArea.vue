<template>
  <div class="chat-area" ref="chatContainer">
    <!-- 空消息态：首屏引导（R8）—— 欢迎语 + 4 个真工具快捷入口 -->
    <div v-if="messages.length === 0" class="welcome">
      <div class="welcome-icon">👋</div>
      <h2>欢迎使用工作台</h2>
      <p>通过自然语言对话完成组件生成、修改、管理与发布</p>
      <div class="quick-actions">
        <button
          v-for="(a, idx) in quickActions"
          :key="idx"
          class="quick-action"
          @click="onQuickAction(a)"
        >
          <span class="qa-icon">{{ a.icon }}</span>
          <span class="qa-text">
            <span class="qa-label">{{ a.label }}</span>
            <span class="qa-desc">{{ a.desc }}</span>
          </span>
        </button>
      </div>
    </div>

    <div v-else class="messages-wrapper">
      <MessageBubble
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        @confirm="emit('confirm', $event)"
        @cancel="emit('cancel', $event)"
        @action="emit('action', $event)"
        @edit="emit('edit', $event)"
      />
      
      <div v-if="sending" class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import MessageBubble from './MessageBubble.vue';

const props = defineProps({
  messages: {
    type: Array,
    required: true,
  },
  sending: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['confirm', 'cancel', 'quick-send', 'quick-focus', 'action', 'edit']);

const chatContainer = ref(null);

// 自动滚动到底部
watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
  }
);

/**
 * 首屏快捷入口（R8）。
 * 两类：
 * - send：直接发一条预设意图消息，命中后端工具（查组件 / 查任务）
 * - focus：需要素材的工具（截图 / Figma），点击后聚焦输入框并提示提供素材，
 *   不凭空触发（否则后端会生成 placeholder 任务）。
 */
const quickActions = [
  { icon: '📷', label: '从截图生成', desc: '粘贴或拖拽截图', action: 'focus', placeholder: '请粘贴截图，或拖拽图片到输入框…' },
  { icon: '🎨', label: '从 Figma 生成', desc: '粘贴 Figma 链接（含 node-id）', action: 'focus', placeholder: '请粘贴 Figma 链接，例如 https://figma.com/file/xxx?node-id=1-2 …' },
  { icon: '📦', label: '查看我的组件', desc: '列出已生成组件', action: 'send', prompt: '列出我的组件' },
  { icon: '📋', label: '查询任务状态', desc: '查看最近任务', action: 'send', prompt: '查询任务状态' },
];

function onQuickAction(a) {
  if (a.action === 'send') {
    emit('quick-send', a.prompt);
  } else {
    emit('quick-focus', a.placeholder);
  }
}
</script>

<style scoped lang="less">
.chat-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: var(--wb-bg, #f7f8fa);

  .messages-wrapper {
    width: 90%;
    margin: 0 auto;
  }
}

/* 首屏引导（R8） */
.welcome {
  max-width: 620px;
  margin: 0 auto;
  padding: 48px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;

  .welcome-icon {
    font-size: 56px;
    margin-bottom: 16px;
  }

  h2 {
    font-size: 20px;
    font-weight: 600;
    color: var(--wb-text, #1a1a2e);
    margin: 0 0 8px;
  }

  p {
    font-size: 13px;
    color: var(--wb-text-muted, #9ca3af);
    margin: 0 0 28px;
  }

  .quick-actions {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    width: 100%;

    .quick-action {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: var(--wb-surface, #ffffff);
      border: 1px solid var(--wb-border, #e5e7eb);
      border-radius: var(--wb-radius, 10px);
      cursor: pointer;
      text-align: left;
      transition: all 0.15s;

      &:hover {
        border-color: var(--wb-primary, #4f46e5);
        background: var(--wb-primary-light, #eef2ff);
        transform: translateY(-1px);
      }

      .qa-icon {
        font-size: 24px;
        flex-shrink: 0;
      }

      .qa-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;

        .qa-label {
          font-size: 14px;
          font-weight: 600;
          color: var(--wb-text, #1a1a2e);
        }

        .qa-desc {
          font-size: 12px;
          color: var(--wb-text-muted, #9ca3af);
        }
      }
    }
  }
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 8px 0;
  max-width: 720px;
  margin: 0 auto;

  .typing-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--wb-text-muted, #9ca3af);
    animation: bounce 1.2s infinite;

    &:nth-child(2) {
      animation-delay: 0.2s;
    }

    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-6px);
  }
}

/* 滚动条样式 */
.chat-area::-webkit-scrollbar {
  width: 5px;
}

.chat-area::-webkit-scrollbar-track {
  background: transparent;
}

.chat-area::-webkit-scrollbar-thumb {
  background: var(--wb-border);
  border-radius: 3px;
}

.chat-area::-webkit-scrollbar-thumb:hover {
  background: var(--wb-text-muted);
}
</style>
