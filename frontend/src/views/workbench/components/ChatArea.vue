<template>
  <div class="chat-area" ref="chatContainer">
    <div class="messages-wrapper">
      <MessageBubble
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        @confirm="emit('confirm', $event)"
        @cancel="emit('cancel', $event)"
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

const emit = defineEmits(['confirm', 'cancel']);

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
