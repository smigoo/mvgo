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
      <!-- 斜杠命令弹层（R14） -->
      <div v-if="slashOpen" class="slash-menu">
        <button
          v-for="(cmd, idx) in filteredSlashCommands"
          :key="cmd.cmd"
          class="slash-item"
          :class="{ active: idx === slashIndex }"
          @mousedown.prevent="applySlash(cmd)"
          @mouseenter="slashIndex = idx"
        >
          <span class="slash-cmd">{{ cmd.cmd }}</span>
          <span class="slash-desc">{{ cmd.desc }}</span>
        </button>
      </div>

      <textarea
        ref="textareaRef"
        v-model="inputText"
        :disabled="disabled"
        :placeholder="attachments.length ? '补充描述（可选），按 Enter 发送' : (placeholderOverride || '输入消息，按 Enter 发送，Shift+Enter 换行...')"
        @keydown="handleKeydown"
        @input="onInput"
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
import { ref, nextTick, computed } from 'vue';

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

/** R8 快捷入口覆盖的 placeholder（用户开始输入即清除） */
const placeholderOverride = ref('');

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
  // 斜杠命令弹层打开时：上下键导航、Enter 确认、Esc 关闭
  if (slashOpen.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      slashIndex.value = (slashIndex.value + 1) % filteredSlashCommands.value.length;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      slashIndex.value =
        (slashIndex.value - 1 + filteredSlashCommands.value.length) % filteredSlashCommands.value.length;
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const cmd = filteredSlashCommands.value[slashIndex.value];
      if (cmd) applySlash(cmd);
      return;
    }
    if (e.key === 'Escape') {
      slashOpen.value = false;
      return;
    }
  }

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

function onInput() {
  // 用户开始输入即清除快捷入口覆盖的 placeholder
  placeholderOverride.value = '';
  autoResize();
  detectSlash();
}

// ========== 斜杠命令（R14） ==========
const slashCommands = [
  { cmd: '/生成', desc: '从截图或 Figma 生成组件', fill: '生成组件：' },
  { cmd: '/统计', desc: '查看生成统计', fill: '查看生成统计' },
  { cmd: '/绑定', desc: '为组件绑定 API', fill: '绑定 API：' },
  { cmd: '/推送', desc: '推送到 GitLab', fill: '推送到 GitLab' },
  { cmd: '/工作流', desc: '执行工作流/配方', fill: '执行工作流：' },
  { cmd: '/批量', desc: '批量生成组件', fill: '批量生成：' },
];

const slashOpen = ref(false);
const slashIndex = ref(0);
const slashQuery = ref('');

const filteredSlashCommands = computed(() => {
  const q = slashQuery.value.trim().toLowerCase();
  if (!q) return slashCommands;
  return slashCommands.filter(
    (c) => c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)
  );
});

/** 检测输入末尾是否在敲斜杠命令（形如 /gen 或 中文/生成） */
function detectSlash() {
  const text = inputText.value;
  const m = text.match(/(?:^|\s)\/([\u4e00-\u9fa5a-zA-Z]*)$/);
  if (m) {
    slashQuery.value = m[1] || '';
    slashOpen.value = true;
    slashIndex.value = 0;
  } else {
    slashOpen.value = false;
  }
}

/** 选中斜杠命令：把末尾的 /xxx 替换为预设意图短语 */
function applySlash(cmd) {
  inputText.value = inputText.value.replace(/(?:^|\s)\/[\u4e00-\u9fa5a-zA-Z]*$/, (m) => {
    const lead = m.startsWith(' ') ? ' ' : '';
    return lead + cmd.fill + ' ';
  });
  slashOpen.value = false;
  nextTick(() => {
    textareaRef.value?.focus();
    autoResize();
  });
}

/**
 * R8 快捷入口调用：聚焦输入框并临时覆盖 placeholder，引导用户提供素材。
 */
function focusWithPlaceholder(placeholder) {
  placeholderOverride.value = placeholder || '';
  nextTick(() => {
    textareaRef.value?.focus();
  });
}

/**
 * R22 编辑重发：把用户旧消息文本回填输入框并聚焦，用户改完直接 Enter 重发。
 */
function focusWithText(text) {
  inputText.value = text || '';
  placeholderOverride.value = '';
  nextTick(() => {
    textareaRef.value?.focus();
    autoResize();
  });
}

defineExpose({ focusWithPlaceholder, focusWithText });
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
    position: relative;

    /* 斜杠命令弹层（R14） */
    .slash-menu {
      position: absolute;
      bottom: calc(100% + 6px);
      left: 0;
      width: 100%;
      max-width: 360px;
      background: var(--wb-surface, #ffffff);
      border: 1px solid var(--wb-border, #e5e7eb);
      border-radius: var(--wb-radius, 10px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      overflow: hidden;
      z-index: 30;

      .slash-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 10px 14px;
        border: none;
        background: transparent;
        cursor: pointer;
        text-align: left;
        font-family: inherit;
        transition: background 0.12s;

        &:hover,
        &.active {
          background: var(--wb-primary-light, #eef2ff);
        }

        .slash-cmd {
          font-size: 13px;
          font-weight: 600;
          color: var(--wb-primary, #4f46e5);
          flex-shrink: 0;
        }

        .slash-desc {
          font-size: 12px;
          color: var(--wb-text-muted, #9ca3af);
        }
      }
    }

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
