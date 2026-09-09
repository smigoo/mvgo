<!--
 * @Description: 单个微码组件加载地址
 * @Author: 朱琦 1972662943@qq.com
 * @Date: 2025-04-30 15:58:51
 * @LastEditors: 朱琦 1972662943@qq.com
 * @LastEditTime: 2025-06-07 21:23:47
 * @FilePath: /src/views/mc-component/index.vue
-->
<template>
  <div class="mc-component-wrapper" :style="wrapperStyle">
    <ErrorBoundary ref="errorBoundaryRef" :onRetry="loadComponent">
      <component
        :is="asyncComponent"
        v-if="asyncComponent"
        :componentId="componentId"
        v-bind="$attrs"
      />
      <div v-else-if="error" class="mc-component-error">
        <p>{{ error }}</p>
      </div>
      <div v-else class="mc-component-loading">
        <span class="mc-spinner"></span>
        <span>正在加载组件...</span>
      </div>
    </ErrorBoundary>
  </div>
</template>

<script setup>
import { ref, shallowRef, onMounted, getCurrentInstance, useAttrs, computed } from 'vue'
import { useRoute } from 'vue-router'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import { loadVue3FromWorkspace } from '@/utils/loadVue3Runtime'
import { resolveComponentType } from '@/utils/task-actions'

defineOptions({ inheritAttrs: false })

const route = useRoute()
const attrs = useAttrs()
const instance = getCurrentInstance()

const componentId = attrs.componentId || route.params.componentId

function normalizeComponentType(value) {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'vue3' || raw === 'microcode' ? raw : ''
}

// 组件类型优先由调用方显式传入；前缀仅作为历史链接兜底。
const explicitType = normalizeComponentType(
  attrs.type || attrs.target || route.query.type || route.query.target,
)
// 组件所属群组，默认 default-group（prod 预览从 query 传入）
const groupId = route.query.groupId || 'default-group'

// 📐 容器尺寸：统一由外层 iframe 的 previewIframeStyle 控制比例，
// 内部只需 100% 填满即可（iframe 已有 aspectRatio 约束）
const wrapperStyle = computed(() => {
  const w = Number(route.query.w)
  const h = Number(route.query.h)
  if (w > 0 && h > 0) {
    return { width: '100%', height: '100%' }
  }
  // 未知尺寸：占满视口（CSS 已有 height:100%）
  return {}
})

const asyncComponent = shallowRef(null)
const error = ref('')
const errorBoundaryRef = ref(null)

async function loadMicrocodeComponent() {
  // 微码组件：与 Vue3 同等待遇 —— /__raw + vue3-sfc-loader 运行时编译沙箱
  // loadVue3FromWorkspace 内部已处理 $mcComponentBuilder / base-panel / ant-design-vue 注册
  asyncComponent.value = await loadVue3FromWorkspace(componentId, {
    isProd: !import.meta.env.DEV,
    workspacePath: 'custom-components',
    explicitGroupId: groupId,
    instance,
  })
}

async function loadVue3Component() {
  // 🔧 改用 vue3-sfc-loader 运行时编译（浏览器内），源码从 Vite /__raw（dev）
  // 或后端 /api/preview（prod）拉取「原始 .vue」，Vite 永远不对 workspace 的 .vue
  // 做 transform —— 因此组件语法错误不会触发 HMR 错误广播外溢到父窗口。
  // 运行时编译的错误只在当前沙箱内以异常抛出，被 ErrorBoundary 捕获。
  if (import.meta.env.DEV) {
    asyncComponent.value = await loadVue3FromWorkspace(componentId, {
      isProd: false,
      instance,
    })
  } else {
    asyncComponent.value = await loadVue3FromWorkspace(componentId, {
      isProd: true,
      explicitGroupId: groupId,
      instance,
    })
  }
}

async function loadComponent() {
  if (!componentId) {
    error.value = '缺少组件 ID'
    return
  }

  const isVue3 = resolveComponentType(String(componentId), explicitType) === 'vue3'

  try {
    if (isVue3) {
      await loadVue3Component()
    } else {
      await loadMicrocodeComponent()
    }
  } catch (e) {
    console.error('[mc-component] 加载失败:', componentId, e)
    errorBoundaryRef.value?.setError(e)
  }
}

onMounted(() => {
  loadComponent()
})
</script>

<style scoped>
.mc-component-wrapper {
  width: 100%;
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

.mc-component-loading,
.mc-component-error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  gap: 12px;
  color: var(--text-tertiary);
  font-size: 14px;
}

.mc-component-error {
  color: #f56c6c;
  flex-direction: column;
  text-align: center;
  padding: 24px;
  overflow: auto;
  max-height: 100%;
  white-space: pre-wrap;
  word-break: break-word;
}
.mc-component-error .mc-spinner {
  display: none;
}

.mc-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #f3f3f3;
  border-top: 2px solid var(--brand);
  border-radius: var(--radius-full);
  animation: mc-spin 1s linear infinite;
}

@keyframes mc-spin {
  to { transform: rotate(360deg); }
}
</style>
