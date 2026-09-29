<template>
  <div class="message-bubble" :class="[message.role]">
    <div class="bubble-content">
      <!-- 用户粘贴/拖拽的图片 -->
      <div v-if="imageAttachments.length" class="message-images">
        <img
          v-for="(att, idx) in imageAttachments"
          :key="idx"
          :src="att.dataUrl"
          :alt="att.name"
          class="msg-image"
          @click="openImage(att.dataUrl)"
        />
      </div>

      <div class="message-text" v-if="message.content">{{ message.content }}</div>
      
      <div v-if="message.cards && message.cards.length > 0" class="message-cards">
        <RichCard
          v-for="(card, idx) in message.cards"
          :key="idx"
          :card="card"
          @confirm="emit('confirm', { message, card, data: $event })"
          @cancel="emit('cancel', { message, card, data: $event })"
        />
      </div>
    </div>

    <!-- 图片放大预览 -->
    <teleport to="body">
      <div v-if="previewSrc" class="img-lightbox" @click="closePreview">
        <button class="lb-close" @click.stop="closePreview" title="关闭">✕</button>
        <img :src="previewSrc" class="lb-img" @click.stop />
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import RichCard from './RichCard.vue';

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['confirm', 'cancel']);

/**
 * 从消息 metadata 中取出图片附件。
 * 后端把粘贴/拖拽的截图存为 metadata.attachments[].dataUrl（base64），
 * 此前前端只渲染 content 与 cards，图片从未显示。
 */
const imageAttachments = computed(() => {
  const atts = props.message?.metadata?.attachments;
  if (!Array.isArray(atts)) return [];
  return atts.filter(a => a && typeof a.dataUrl === 'string' && a.dataUrl.startsWith('data:image/'));
});

/**
 * 放大预览。
 * ⚠️ 不能用 window.open(dataUrl)：现代浏览器禁止顶层导航到 `data:` URL
 * （Chrome 自 60 起），会打开一个空白页。改用内联灯箱渲染同一个 dataURL。
 */
const previewSrc = ref('');

function openImage(dataUrl) {
  previewSrc.value = dataUrl;
}

function closePreview() {
  previewSrc.value = '';
}

// ESC 关闭
function onKeydown(e) {
  if (e.key === 'Escape' && previewSrc.value) closePreview();
}
onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<style scoped lang="less">
.message-bubble {
  margin-bottom: 20px;
  margin-left: auto;
  margin-right: auto;

  &.user {
    display: flex;
    justify-content: flex-end;

    .bubble-content {
      background: var(--wb-primary, #4f46e5);
      color: #fff;
      padding: 10px 14px;
      border-radius: var(--wb-radius, 10px) var(--wb-radius, 10px) 2px var(--wb-radius, 10px);
      max-width: 480px;
      font-size: 13px;
    }
  }

  &.assistant {
    display: flex;
    flex-direction: column;
    gap: 10px;

    .bubble-content {
      .message-text {
        background: var(--wb-surface, #ffffff);
        border: 1px solid var(--wb-border, #e5e7eb);
        padding: 12px 16px;
        border-radius: var(--wb-radius, 10px);
        font-size: 13px;
        line-height: 1.65;
        max-width: 640px;
        margin-bottom: 10px;
      }

      .message-cards {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
    }
  }

  .bubble-content {
    .message-text {
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* 用户粘贴/拖拽的图片缩略图 */
    .message-images {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;

      .msg-image {
        max-width: 180px;
        max-height: 160px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.35);
        object-fit: cover;
        cursor: zoom-in;
        display: block;
        transition: opacity 0.15s;

        &:hover {
          opacity: 0.88;
        }
      }
    }
  }
}
</style>

<!-- 灯箱 teleport 到 body，故不能用 scoped（scoped 属性挂不到 teleport 内容） -->
<style lang="less">
.img-lightbox {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;

  .lb-img {
    max-width: 92vw;
    max-height: 88vh;
    object-fit: contain;
    border-radius: 6px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
  }

  .lb-close {
    position: absolute;
    top: 18px;
    right: 22px;
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
    font-size: 17px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  }
}
</style>
