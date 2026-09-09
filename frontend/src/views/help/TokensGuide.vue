<template>
  <div class="tokens-guide">
    <header class="tg-header">
      <div class="tg-header-inner">
        <button class="tg-back" type="button" @click="goBack">‹ 返回</button>
        <h1 class="tg-title">密钥接入指南</h1>
        <p class="tg-sub">
          配置外部服务前，按以下步骤获取对应密钥，再粘贴回配置面板的输入框。
          在「外部服务」Tab 中点击「获取教程 ›」可直达本章。
        </p>
      </div>
    </header>

    <div class="tg-body">
      <!-- 左侧目录（锚点导航） -->
      <nav class="tg-toc">
        <div class="tg-toc-title">目录</div>
        <a
          v-for="g in guides"
          :key="g.key"
          class="tg-toc-item"
          :class="{ active: activeKey === g.key }"
          @click="scrollTo(g.key)"
        >
          <span class="tg-toc-icon">{{ g.icon }}</span>
          <span class="tg-toc-text">{{ g.title }}</span>
        </a>
      </nav>

      <!-- 右侧内容 -->
      <main class="tg-content">
        <section
          v-for="g in guides"
          :key="g.key"
          :id="g.key"
          class="tg-section"
        >
          <div class="tg-section-head">
            <span class="tg-section-icon">{{ g.icon }}</span>
            <div class="tg-section-head-text">
              <h2 class="tg-section-title">{{ g.title }}</h2>
              <span class="tg-purpose">{{ g.purpose }}</span>
            </div>
          </div>

          <!-- 分步获取 -->
          <div class="tg-steps">
            <div v-for="(step, i) in g.steps" :key="i" class="tg-step">
              <div class="tg-step-no">{{ i + 1 }}</div>
              <div class="tg-step-body">
                <div class="tg-step-title">{{ step.title }}</div>
                <div class="tg-step-desc">{{ step.desc }}</div>
                <div class="shot-placeholder">
                  <span class="shot-text">截图待补充：{{ step.screenshot }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 所需权限 -->
          <div v-if="g.scopeNote" class="tg-callout tg-callout--scope">
            <span class="tg-callout-label">所需权限</span>
            <span class="tg-callout-text">{{ g.scopeNote }}</span>
          </div>

          <!-- 粘贴位置 -->
          <div class="tg-callout tg-callout--paste">
            <span class="tg-callout-label">粘贴到</span>
            <span class="tg-callout-text">{{ g.pasteTo }}</span>
          </div>

          <!-- 官方文档 -->
          <a class="tg-doc-link" :href="g.docUrl" target="_blank" rel="noopener noreferrer">
            查看官方文档 ›
          </a>

          <!-- 常见问题 -->
          <div v-if="g.faqs && g.faqs.length" class="tg-faqs">
            <div class="tg-faqs-title">常见问题</div>
            <details v-for="(f, i) in g.faqs" :key="i" class="tg-faq">
              <summary>{{ f.q }}</summary>
              <div class="tg-faq-a">{{ f.a }}</div>
            </details>
          </div>
        </section>

        <footer class="tg-footer">
          仍有疑问？在配置面板的「外部服务」Tab 中点击「获取教程 ›」可随时回到本页。
        </footer>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'

interface GuideStep {
  title: string
  desc: string
  screenshot: string
}
interface GuideFaq {
  q: string
  a: string
}
interface Guide {
  key: 'figma' | 'apifox' | 'gitlab'
  icon: string
  title: string
  purpose: string
  steps: GuideStep[]
  scopeNote: string
  pasteTo: string
  docUrl: string
  faqs: GuideFaq[]
}

const route = useRoute()
const router = useRouter()
const activeKey = ref<'figma' | 'apifox' | 'gitlab'>('figma')

const guides: Guide[] = [
  {
    key: 'figma',
    icon: '🎨',
    title: 'Figma Access Token',
    purpose: '用于从 Figma 读取设计稿，驱动「Figma 组件生成」流程',
    steps: [
      {
        title: '打开 Figma 设置',
        desc: '登录 Figma 网页版，点击左上角头像 → Settings（设置）。',
        screenshot: 'Figma 头像菜单中的 Settings 入口'
      },
      {
        title: '进入 Personal access tokens',
        desc: '在左侧菜单找到 Personal access tokens，点击右侧「Generate new token」。',
        screenshot: 'Settings 页 Personal access tokens 区域'
      },
      {
        title: '生成并复制 Token',
        desc: '输入 Token 名称（任意），点击 Generate token，复制生成的以 figd_ 开头的令牌并妥善保存（仅显示一次）。',
        screenshot: 'Generate new token 弹窗与生成的 figd_ 令牌'
      }
    ],
    scopeNote: 'Figma 个人访问令牌默认具备文件读取权限；免费版对部分企业功能受限，但基础组件生成所需权限可用。',
    pasteTo: '配置面板 → 外部服务 Tab → Figma Access Token 输入框',
    docUrl: 'https://help.figma.com/hc/en-us/articles/8085703772559-Use-Personal-Access-Tokens',
    faqs: [
      { q: 'Token 在哪填？', a: '在配置面板的「外部服务」Tab 中，找到 Figma Access Token 输入框粘贴即可，保存后状态总览会显示「已配置」。' },
      { q: '免费版能否使用？', a: '可以生成个人访问令牌用于读取文件，部分企业级功能受限，但影响基础组件生成。' }
    ]
  },
  {
    key: 'apifox',
    icon: '📘',
    title: 'Apifox Access Token',
    purpose: '用于 API 生成与接口绑定（GenerateApi / ApiBindingWizard）',
    steps: [
      {
        title: '打开账号设置',
        desc: '登录 Apifox，点击右上角头像 → 账号设置。',
        screenshot: 'Apifox 头像菜单 → 账号设置'
      },
      {
        title: '找到 API Access Token',
        desc: '在账号设置页左侧找到 API Access Token（开放 API），点击「生成 Token」。',
        screenshot: '账号设置页 API Access Token 区域'
      },
      {
        title: '生成并复制',
        desc: '填写名称与过期时间，生成后复制令牌（注意区分个人令牌与项目令牌，本项目用个人令牌即可）。',
        screenshot: '生成 Token 弹窗与令牌结果'
      }
    ],
    scopeNote: '使用个人访问令牌（Personal Access Token）即可，无需项目令牌；请确认令牌在有效期内。',
    pasteTo: '配置面板 → 外部服务 Tab → Apifox Access Token 输入框',
    docUrl: 'https://www.apifox.cn/help/apidocs/token/',
    faqs: [
      { q: '个人令牌还是项目令牌？', a: '本项目使用个人访问令牌（Personal Access Token）即可；项目令牌用于团队级开放 API 场景。' }
    ]
  },
  {
    key: 'gitlab',
    icon: '🦊',
    title: 'GitLab Access Token',
    purpose: '用于将生成的组件一键推送到公司 GitLab 组件库（scm.microvideo.cn）',
    steps: [
      {
        title: '打开 Preferences',
        desc: '登录公司 GitLab（scm.microvideo.cn），点击右上角头像 → Preferences（偏好设置）。',
        screenshot: 'GitLab 头像菜单 → Preferences'
      },
      {
        title: '进入 Access Tokens',
        desc: '在左侧菜单找到 Access Tokens，点击「Add new token」。',
        screenshot: 'Preferences → Access Tokens 页面'
      },
      {
        title: '配置权限并生成',
        desc: '填写名称与过期日，在 scopes 中勾选 api（本项目推送需要 api 权限），点击 Create personal access token，复制生成的令牌（仅显示一次）。',
        screenshot: 'Add new token 表单，勾选 api scope'
      }
    ],
    scopeNote: '必须勾选 api scope，否则推送组件到 GitLab 会因权限不足失败。',
    pasteTo: '配置面板 → 外部服务 Tab → GitLab Access Token 输入框（或设置页「文档推送」Personal Access Token）',
    docUrl: 'https://docs.gitlab.cn/ee/user/profile/personal_access_tokens.html',
    faqs: [
      { q: '推送失败提示 401/403？', a: '通常是 Token 缺少 api scope 或已过期，重新生成并勾选 api 后重试。' },
      { q: '公司 GitLab 地址？', a: '组件库推送目标为 scm.microvideo.cn（项目 opensource/mvgo/components）。' }
    ]
  }
]

function scrollTo(key: Guide['key']) {
  activeKey.value = key
  const el = document.getElementById(key)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (route.hash !== '#' + key) {
    router.replace({ hash: '#' + key })
  }
}

function onScroll() {
  let current = guides[0].key
  for (const g of guides) {
    const el = document.getElementById(g.key)
    if (el && el.getBoundingClientRect().top <= 140) current = g.key
  }
  activeKey.value = current
}

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/generator/components')
}

onMounted(async () => {
  await nextTick()
  const hash = (route.hash || '').replace('#', '')
  if (hash && guides.some((g) => g.key === hash)) {
    scrollTo(hash as Guide['key'])
  }
  window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<style scoped>
.tokens-guide {
  min-height: 100vh;
  background: var(--bg-page, #f5f7fa);
  color: var(--text-primary, #1f2937);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
}

.tg-header {
  background: var(--bg-card, #fff);
  border-bottom: 1px solid var(--border-light, #e8edf2);
}
.tg-header-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 28px 32px 22px;
}
.tg-back {
  background: transparent;
  border: 0;
  color: var(--text-tertiary, #94a3b8);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 10px;
  font-family: inherit;
}
.tg-back:hover {
  color: var(--brand, #1990ff);
}
.tg-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 8px;
  color: var(--text-primary, #1f2937);
}
.tg-sub {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary, #64748b);
  margin: 0;
  max-width: 720px;
}

.tg-body {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 32px;
  display: flex;
  gap: 28px;
  align-items: flex-start;
}

/* 目录 */
.tg-toc {
  position: sticky;
  top: 24px;
  flex: 0 0 220px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-light, #e8edf2);
  border-radius: 12px;
  padding: 14px 12px;
}
.tg-toc-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 8px 10px;
}
.tg-toc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  transition: all 0.18s;
  text-decoration: none;
}
.tg-toc-item:hover {
  background: var(--bg-hover, #f1f5f9);
  color: var(--text-primary, #1f2937);
}
.tg-toc-item.active {
  background: var(--brand-bg, #e8f3ff);
  color: var(--brand, #1990ff);
  font-weight: 600;
}
.tg-toc-icon {
  font-size: 15px;
}

/* 内容 */
.tg-content {
  flex: 1 1 auto;
  min-width: 0;
}
.tg-section {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-light, #e8edf2);
  border-radius: 14px;
  padding: 24px;
  margin-bottom: 22px;
  scroll-margin-top: 20px;
}
.tg-section-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 16px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--border-light, #e8edf2);
}
.tg-section-icon {
  font-size: 28px;
  line-height: 1;
}
.tg-section-head-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.tg-section-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary, #1f2937);
}
.tg-purpose {
  font-size: 13px;
  color: var(--text-tertiary, #94a3b8);
  line-height: 1.5;
}

.tg-steps {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.tg-step {
  display: flex;
  gap: 14px;
}
.tg-step-no {
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--brand-bg, #e8f3ff);
  color: var(--brand, #1990ff);
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tg-step-body {
  flex: 1 1 auto;
  min-width: 0;
}
.tg-step-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1f2937);
  margin-bottom: 4px;
}
.tg-step-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary, #64748b);
  margin-bottom: 10px;
}

/* 截图占位 */
.shot-placeholder {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 64px;
  padding: 12px 16px;
  background: repeating-linear-gradient(
    45deg,
    var(--bg-hover, #f1f5f9),
    var(--bg-hover, #f1f5f9) 10px,
    var(--bg-card, #fff) 10px,
    var(--bg-card, #fff) 20px
  );
  border: 1px dashed var(--border-default, #cbd5e1);
  border-radius: 10px;
  color: var(--text-tertiary, #94a3b8);
  font-size: 12px;
}
.shot-icon {
  font-size: 18px;
}
.shot-text {
  line-height: 1.4;
}

/* 提示条 */
.tg-callout {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
}
.tg-callout--scope {
  background: var(--warning-bg, #fff7ed);
  border: 1px solid var(--warning-border, #fed7aa);
  color: var(--warning-text, #9a3412);
}
.tg-callout--paste {
  background: var(--brand-bg, #e8f3ff);
  border: 1px solid var(--brand-border, #b3d8ff);
  color: var(--brand, #1990ff);
}
.tg-callout-label {
  flex: 0 0 auto;
  font-weight: 700;
}
.tg-callout-text {
  flex: 1 1 auto;
  min-width: 0;
}

.tg-doc-link {
  display: inline-block;
  margin-top: 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--brand, #1990ff);
  text-decoration: none;
}
.tg-doc-link:hover {
  text-decoration: underline;
}

/* 常见问题 */
.tg-faqs {
  margin-top: 18px;
  border-top: 1px solid var(--border-light, #e8edf2);
  padding-top: 14px;
}
.tg-faqs-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary, #1f2937);
  margin-bottom: 8px;
}
.tg-faq {
  border: 1px solid var(--border-light, #e8edf2);
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
}
.tg-faq summary {
  cursor: pointer;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #1f2937);
  background: var(--bg-hover, #f8fafc);
  list-style: none;
}
.tg-faq summary::-webkit-details-marker {
  display: none;
}
.tg-faq-a {
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary, #64748b);
}

.tg-footer {
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary, #94a3b8);
  padding: 8px 0 16px;
}

@media (max-width: 720px) {
  .tg-body {
    flex-direction: column;
    gap: 16px;
  }
  .tg-toc {
    position: static;
    flex: 1 1 auto;
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .tg-toc-title {
    width: 100%;
    padding-bottom: 4px;
  }
  .tg-toc-item {
    flex: 0 0 auto;
  }
}
</style>
