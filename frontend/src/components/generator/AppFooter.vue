<template>
  <footer class="app-footer">
    <span class="af-copy">© 2026 感智晓界工坊 · 感动科技 | 智能体工作室</span>

    <!-- 低频入口放页脚：架构介绍（原在头部次导航）、页面开发、工作流编排（原在头部主导航）
         均受各自功能开关控制，关闭时置灰并给出提示。
         注：「大屏布局」2026-09-30 移回头部主导航，2026-11-12 又按要求从头部导航移除，
         目前页脚与头部均无该入口；页面与路由保留（直连 /screen 仍可访问）。 -->
    <nav class="af-links">
      <template v-if="introEnabled">
        <router-link to="/generator/intro" class="af-link" active-class="active">
          架构介绍
        </router-link>
      </template>
      <span v-else class="af-link af-link-disabled" @click="showDisabledHint('架构介绍')"> 架构介绍 </span>

      <template v-if="pageSkeletonEnabled">
        <router-link to="/generator/page-skeleton" class="af-link" active-class="active">
          页面开发
        </router-link>
      </template>
      <span v-else class="af-link af-link-disabled" @click="showDisabledHint('页面开发')"> 页面开发 </span>

      <template v-if="workflowEnabled">
        <router-link to="/generator/workflow" class="af-link" active-class="active">
          工作流编排
        </router-link>
      </template>
      <span v-else class="af-link af-link-disabled" @click="showDisabledHint('工作流编排')"> 工作流编排 </span>

      <!-- 实验室：一级入口 + 下拉展开（2026-11-12 恢复 go-dev 形态：会议工作台重新
           开放全环境入口；components-test / project-lab 沿用 devOnly 约定仅 dev 可见 ——
           它们依赖的 /api/v2/pipeline、/api/v3/project 在生产由门禁拦为 404，
           暴露入口只会让用户点进报错页）。
           条目全空时整组下拉隐藏，避免生产露出空菜单。 -->
      <div
        v-if="labLinks.length"
        ref="labRootRef"
        class="af-dropdown"
        @mouseenter="onLabEnter"
        @mouseleave="onLabLeave"
        @keydown.esc="closeLab"
      >
        <span
          class="af-link af-dropdown-trigger"
          role="button"
          tabindex="0"
          aria-haspopup="menu"
          :aria-expanded="labOpen ? 'true' : 'false'"
          @click="openLab"
          @keydown.enter.prevent="openLab"
          @keydown.space.prevent="openLab"
        >
          实验室
          <span class="af-caret" :class="{ open: labOpen }">▾</span>
        </span>
        <div v-show="labOpen" class="af-dropdown-menu" role="menu">
          <router-link
            v-for="lab in labLinks"
            :key="lab.path"
            :to="lab.path"
            class="af-dropdown-item"
            active-class="active"
            @click="closeLab"
          >
            {{ lab.label }}
          </router-link>
        </div>
      </div>

      <!-- 更新日志：面向全体用户公开，不参与功能开关 -->
      <router-link to="/help/changelog" class="af-link" active-class="active">
        更新日志
      </router-link>

      <!-- 系统公告：面向全体用户公开 -->
      <router-link to="/announcements" class="af-link" active-class="active">
        系统公告
      </router-link>

      <!-- 建议反馈：跳转公司统一反馈表单（外部地址，新窗口打开） -->
      <a
        class="af-link"
        href="https://aio.microvideo.cn/tzy/biz/formCustSql/formCustSqlView/njgd_yjfk"
        target="_blank"
        rel="noopener noreferrer"
      >
        建议反馈
      </a>
    </nav>
  </footer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { useFeatureFlagsStore } from '@/stores/feature-flags'

const featureStore = useFeatureFlagsStore()
const introEnabled = computed(() => featureStore.isEnabled('generator.intro'))
const pageSkeletonEnabled = computed(() => featureStore.isEnabled('generator.pageSkeleton'))
const workflowEnabled = computed(() => featureStore.isEnabled('generator.workflow'))
// 「大屏布局」2026-09-30 移入头部主导航、2026-11-12 又从头部导航移除，现两处均无入口；
// 页面与路由保留（直连 /screen 仍可访问）

// 实验室链接组：门控在条目级（2026-11-12 从 go-dev 移植回 main，补齐合并时遗漏的移植项）。
// meeting 为纯前端 mock 页（dev-data + mock/**，无后端依赖）⇒ 全环境可见；
// components-test / project-lab 仅 dev（生产接口由 DevOnlyGuard / isV3ProjectExposed 拦为 404）。
// 条目全空时整组下拉隐藏，避免生产露出空菜单。
const isDev = import.meta.env.DEV
const labOpen = ref(false)
const labRootRef = ref<HTMLElement | null>(null)
const labLinks = computed(() =>
  [
    { path: '/meeting', label: '会议工作台', devOnly: false },
    { path: '/generator/components-test', label: '组件生成测试', devOnly: true },
    { path: '/project-lab', label: '项目管线实验室', devOnly: true },
  ].filter((link) => !link.devOnly || isDev),
)

/**
 * 「实验室」下拉的开关时序（2026-11-05 修复「二级链接点不到、鼠标一移动就消失」）
 *
 * 原实现两个缺陷：
 *   1) 菜单 bottom: calc(100% + 8px)，与触发器之间有 8px 视觉间隙，而这 8px 不属于
 *      .af-dropdown（它的高度只有触发器那么高），鼠标从「实验室」向上移到菜单的途中
 *      会触发 mouseleave → v-show 立刻 display:none，二级链接来不及点。
 *      对策：CSS 里用 .af-dropdown-menu::after 把 8px 间隙桥接进菜单自身命中区。
 *   2) 触发器 @click="labOpen = !labOpen"：hover 已把菜单打开，再点击反而 toggle 成关闭，
 *      表现为「点一下菜单就消失」。
 *      对策：点击改为幂等「打开」，关闭交给 mouseleave / 点击菜单项 / 点击外部 / Esc。
 *
 * 这里的 LAB_CLOSE_DELAY 是第二道保险：即使光标斜向快速移动擦出边界，也留 140ms 缓冲。
 */
const LAB_CLOSE_DELAY = 140
let labCloseTimer: ReturnType<typeof setTimeout> | null = null

function clearLabTimer() {
  if (labCloseTimer !== null) {
    clearTimeout(labCloseTimer)
    labCloseTimer = null
  }
}

function openLab() {
  clearLabTimer()
  labOpen.value = true
}

function closeLab() {
  clearLabTimer()
  labOpen.value = false
}

function onLabEnter() {
  openLab()
}

function onLabLeave() {
  clearLabTimer()
  labCloseTimer = setTimeout(() => {
    labOpen.value = false
    labCloseTimer = null
  }, LAB_CLOSE_DELAY)
}

// 点击菜单外部关闭：不然菜单会一直悬在页脚上方（点击被 .app-layout__inner 的 overflow 边界挡住时尤其明显）
function onDocumentPointerDown(event: MouseEvent) {
  if (!labOpen.value) return
  const root = labRootRef.value
  if (root && !root.contains(event.target as Node)) closeLab()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentPointerDown)
  clearLabTimer()
})

function showDisabledHint(label: string) {
  message.warning(`「${label}」暂不开放`)
}
</script>

<style scoped>
.app-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 24px;
  background: var(--bg-elevated);
  border-top: 1px solid var(--border-default);
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
  letter-spacing: 0.3px;
  flex-shrink: 0;
  height: 39px;
  box-sizing: border-box;
}

.af-copy {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.af-links {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}

.af-dropdown {
  position: relative;
  display: flex;
  align-items: center;
}

.af-dropdown-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  user-select: none;
}

.af-caret {
  font-size: 10px;
  line-height: 1;
  transition: transform 0.15s ease;
}

.af-caret.open {
  transform: rotate(180deg);
}

/* 页脚贴视口底部 → 菜单向上弹出 */
.af-dropdown-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 148px;
  display: flex;
  flex-direction: column;
  padding: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md, 8px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  z-index: 1100;
}

/* 命中区桥接（2026-11-05）：
   菜单与触发器之间的 8px 是「视觉间隙」，但 .af-dropdown 的高度只等于触发器，
   这段空隙落在父元素之外 → 鼠标上移途中触发 mouseleave → 菜单瞬间收起，二级链接点不到。
   用菜单自身的透明伪元素把这 8px 补回来（宽度随菜单 148px，覆盖斜向移动路径），
   间隙仍在视觉上存在，但已属于菜单的命中区。 */
.af-dropdown-menu::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: 8px;
}

.af-dropdown-item {
  color: var(--text-secondary);
  text-decoration: none;
  padding: 6px 10px;
  border-radius: var(--radius-sm, 4px);
  white-space: nowrap;
  transition: color 0.15s ease, background 0.15s ease;
}

.af-dropdown-item:hover {
  color: var(--brand);
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
}

.af-dropdown-item.active {
  color: var(--brand);
}

.af-link {
  color: var(--text-secondary);
  text-decoration: none;
  padding: 3px 8px;
  border-radius: var(--radius-sm, 4px);
  transition: color 0.15s ease, background 0.15s ease;
  cursor: pointer;
}

.af-link:hover {
  color: var(--brand);
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
}

.af-link.active {
  color: var(--brand);
}

.af-link-disabled {
  color: var(--text-tertiary);
  cursor: not-allowed;
  opacity: 0.6;
}

.af-link-disabled:hover {
  background: transparent;
}

@media (max-width: 640px) {
  .app-footer {
    padding: 0 12px;
  }
  .af-copy {
    font-size: 11px;
  }
}
</style>
