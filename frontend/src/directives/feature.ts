/**
 * v-feature 指令 — 模板级功能开关
 *
 * 用法：
 *   <button v-feature="'git.push'">保存到 Git</button>
 *   <div v-feature="'figma.integration'">Figma 输入框</div>
 *
 * 功能关闭时，元素保留但置灰，点击提示"暂不开放"。
 *
 * 也支持对象语法：
 *   <button v-feature="{ key: 'git.push', label: '推送到Git' }">
 *   <div v-feature="{ key: 'figma.integration', mode: 'hide' }">
 *
 * mode: 'disable'(默认，置灰+提示) | 'hide'(完全隐藏)
 *
 * 响应式：配置文件热更新后，watchEffect 自动重新检查并更新元素状态
 */
import type { Directive, DirectiveBinding } from 'vue'
import { watchEffect } from 'vue'
import { message } from 'ant-design-vue'
import { useFeatureFlagsStore } from '@/stores/feature-flags'

interface FeatureBinding {
  key: string
  label?: string
  mode?: 'hide' | 'disable'
}

interface FeatureElement extends HTMLElement {
  _featureStop?: () => void
  _featureClickHandler?: (e: Event) => void
}

function resolveBinding(value: unknown): FeatureBinding {
  if (typeof value === 'string') {
    return { key: value, mode: 'disable' }
  }
  if (value && typeof value === 'object' && 'key' in value) {
    return {
      key: (value as FeatureBinding).key,
      label: (value as FeatureBinding).label,
      mode: (value as FeatureBinding).mode || 'disable',
    }
  }
  return { key: '', mode: 'disable' }
}

/** 从 store 配置中查找 label */
function findLabel(store: ReturnType<typeof useFeatureFlagsStore>, key: string): string {
  const groups = ['routes', 'subRoutes', 'pages', 'workspace', 'features'] as const
  for (const group of groups) {
    const items = store.config[group] as Record<string, { label: string }> | undefined
    if (items && items[key]) {
      return items[key].label
    }
  }
  return key
}

function applyState(el: HTMLElement, enabled: boolean, mode: 'hide' | 'disable') {
  if (mode === 'hide') {
    el.style.display = enabled ? '' : 'none'
    if (enabled) {
      delete el.dataset.featureHidden
    } else {
      el.dataset.featureHidden = 'true'
    }
  } else {
    // disable 模式：置灰 + 不可点击
    if (enabled) {
      el.removeAttribute('data-feature-disabled')
      el.style.opacity = ''
      el.style.cursor = ''
    } else {
      el.dataset.featureDisabled = 'true'
      el.style.opacity = '0.5'
      el.style.cursor = 'not-allowed'
    }
  }
}

export const featureDirective: Directive = {
  mounted(el: FeatureElement, binding: DirectiveBinding) {
    const { key, label, mode } = resolveBinding(binding.value)
    if (!key) return

    const store = useFeatureFlagsStore()

    // watchEffect 创建响应式依赖：store 热更新时自动重新检查
    el._featureStop = watchEffect(() => {
      const enabled = store.isEnabled(key)
      applyState(el, enabled, mode)
    })

    // 点击拦截：功能关闭时阻止默认行为并提示
    el._featureClickHandler = (e: Event) => {
      if (!store.isEnabled(key)) {
        e.preventDefault()
        e.stopPropagation()
        const displayLabel = label || findLabel(store, key)
        message.warning(`「${displayLabel}」暂不开放`)
      }
    }
    el.addEventListener('click', el._featureClickHandler, true) // capture 优先拦截
  },

  unmounted(el: FeatureElement) {
    if (el._featureStop) {
      el._featureStop()
      el._featureStop = undefined
    }
    if (el._featureClickHandler) {
      el.removeEventListener('click', el._featureClickHandler, true)
      el._featureClickHandler = undefined
    }
  },
}

export default {
  install(app: { directive: (name: string, dir: Directive) => void }) {
    app.directive('feature', featureDirective)
  },
}
