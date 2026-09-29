<template>
  <div
    class="chat-input"
    :class="{ 'drag-over': isDragOver }"
    @dragover.prevent="isDragOver = true"
    @dragleave.prevent="isDragOver = false"
    @drop.prevent="handleDrop"
  >
    <!-- 已附加图片的预览 -->
    <div v-if="attachments.length" class="attachment-preview">
      <div v-for="(att, idx) in attachments" :key="idx" class="att-item">
        <img :src="att.dataUrl" :alt="att.name" />
        <button class="att-remove" @click="removeAttachment(idx)" title="移除">✕</button>
      </div>
    </div>

    <div class="input-wrapper">
      <textarea
        ref="textareaRef"
        v-model="inputText"
        :disabled="disabled"
        :placeholder="attachments.length ? '补充描述（可选），按 Enter 发送' : '输入消息，按 Enter 发送，Shift+Enter 换行...'"
        @keydown="handleKeydown"
        @input="autoResize"
        @paste="handlePaste"
        rows="1"
      ></textarea>
      <button
        class="send-btn"
        :disabled="disabled || (!inputText.trim() && !attachments.length)"
        @click="handleSend"
      >
        发送
      </button>
    </div>
    <div class="input-hints">
      <span>支持拖拽图片、粘贴截图</span>
      <span v-if="attachments.length" class="att-hint">已附加 {{ attachments.length }} 张图</span>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue';

const props = defineProps({
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['send']);

const inputText = ref('');
const textareaRef = ref(null);
const attachments = ref([]);
const isDragOver = ref(false);

/** 单张大小上限（后端走 JSON body，过大易超时） */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * 把 File 读成 dataURL 并加入附件列表。
 * 用 FileReader 而非 URL.createObjectURL：dataURL 自包含，
 * 可直接随消息体传给后端（LiteService 期望 imageBase64）。
 */
function addFiles(fileList) {
  const files = Array.from(fileList || []).filter(f => f && f.type?.startsWith('image/'));
  if (!files.length) return;

  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      alert(`「${file.name}」超过 8MB，请压缩后再试`);
      continue;
    }
    const reader = new FileReader();
    reader.onload = () => {
      attachments.value.push({
        name: file.name || `pasted-${Date.now()}.png`,
        type: file.type,
        size: file.size,
        dataUrl: reader.result,
      });
    };
    reader.readAsDataURL(file);
  }
}

function handlePaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length) {
    // 阻止默认（否则截图会被当作不可见字符塞进 textarea）
    e.preventDefault();
    addFiles(files);
  }
}

function handleDrop(e) {
  isDragOver.value = false;
  addFiles(e.dataTransfer?.files);
}

function removeAttachment(idx) {
  attachments.value.splice(idx, 1);
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

function handleSend() {
  const text = inputText.value.trim();
  if (props.disabled) return;
  if (!text && !attachments.value.length) return;

  // 无文字但有图时补一句默认描述，保证后端意图匹配能命中「截图」
  const payload = {
    text: text || '根据这张截图生成组件',
    attachments: [...attachments.value],
  };

  emit('send', payload);
  inputText.value = '';
  attachments.value = [];
  
  // 重置高度
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto';
    }
  });
}

function autoResize() {
  const textarea = textareaRef.value;
  if (!textarea) return;

  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}
</script>

<style scoped lang="less">
.chat-input {
  padding: 14px 20px;
  border-top: 1px solid var(--wb-border, #e5e7eb);
  background: var(--wb-surface, #ffffff);
  transition: background 0.15s;

  &.drag-over {
    background: var(--wb-primary-light, #eef2ff);
  }

  .attachment-preview {
    max-width: 720px;
    margin: 0 auto 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    .att-item {
      position: relative;
      width: 72px;
      height: 72px;
      border: 1px solid var(--wb-border, #e5e7eb);
      border-radius: var(--wb-radius-sm, 6px);
      overflow: hidden;
      background: var(--wb-surface-alt, #f2f3f5);

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .att-remove {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 18px;
        height: 18px;
        border: none;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        font-size: 11px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          background: rgba(0, 0, 0, 0.75);
        }
      }
    }
  }

  .input-wrapper {
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    gap: 10px;
    align-items: flex-end;

    textarea {
      flex: 1;
      border: 1px solid var(--wb-border, #e5e7eb);
      border-radius: var(--wb-radius, 10px);
      padding: 10px 14px;
      font-size: 13px;
      resize: none;
      min-height: 40px;
      max-height: 120px;
      outline: none;
      font-family: inherit;
      line-height: 1.5;
      background: var(--wb-surface, #ffffff);
      transition: border-color 0.15s;

      &:focus {
        border-color: var(--wb-primary, #4f46e5);
      }

      &:disabled {
        background: var(--wb-surface-alt, #f2f3f5);
        cursor: not-allowed;
      }

      &::placeholder {
        color: var(--wb-text-muted, #9ca3af);
      }
    }

    .send-btn {
      width: 40px;
      height: 40px;
      border-radius: var(--wb-radius-sm, 6px);
      background: var(--wb-primary, #4f46e5);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 16px;
      flex-shrink: 0;
      transition: opacity 0.15s;

      &:hover:not(:disabled) {
        opacity: 0.88;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }

  .input-hints {
    max-width: 720px;
    margin: 6px auto 0;
    display: flex;
    gap: 12px;
    font-size: 10px;
    color: var(--wb-text-muted, #9ca3af);

    span {
      display: flex;
      align-items: center;
      gap: 3px;
    }

    .att-hint {
      color: var(--wb-primary, #4f46e5);
    }
  }
}
</style>
