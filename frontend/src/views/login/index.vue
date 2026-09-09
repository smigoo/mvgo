<template>
  <div class="login-page">
    <!-- 主题切换按钮 -->
    <button
      class="login-theme-toggle icon-tooltip"
      @click="toggleTheme"
      :data-tooltip="isDark ? '切换到亮色模式' : '切换到暗色模式'"
      :aria-label="isDark ? '切换到亮色模式' : '切换到暗色模式'"
    >
      <svg
        v-if="isDark"
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
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
      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
    <!-- 左半区：品牌展示 + 动态背景 -->
    <div class="login-visual" :class="{ 'is-dark': isDark }">
      <div class="visual-bg">
        <LoginAuroraCanvas :dark="isDark" />
        <div class="particle p1"></div>
        <div class="particle p2"></div>
        <div class="particle p3"></div>
        <div class="particle p4"></div>
        <div class="particle p5"></div>
        <div class="grid-overlay"></div>
        <div class="visual-vignette"></div>
      </div>
      <div class="visual-content">
        <div class="brand-area">
          <div class="brand-lockup">
            <img :src="brandSymbolSrc" alt="感智晓界 logo" class="brand-symbol" />
            <span class="brand-divider" aria-hidden="true"></span>
            <img :src="logoSrc" alt="Microvideo" class="brand-wordmark" />
          </div>
        </div>
        <div class="visual-tagline">
          <p class="tagline-eyebrow">感动科技 MICROVIDEO</p>
          <h1 class="tagline-main">感智晓界</h1>
          <p class="tagline-sub">智能体驱动的下一代开发平台</p>
        </div>
        <div class="visual-features">
          <div class="feature-item">
            <span class="feature-dot"></span>
            <span>AI 组件生成</span>
          </div>
          <div class="feature-item">
            <span class="feature-dot"></span>
            <span>多端微码适配</span>
          </div>
          <div class="feature-item">
            <span class="feature-dot"></span>
            <span>可视化数据大屏</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 右半区：表单卡片 -->
    <div class="login-panel">
      <div class="panel-card">
        <!-- 登录 -->
        <template v-if="mode === 'login'">
          <div class="panel-header">
            <h2>欢迎回来</h2>
            <p>登录您的账号以继续</p>
          </div>
          <a-form :model="loginForm" @finish="handleLogin" class="panel-form">
            <a-form-item name="username" :rules="[{ required: true, message: '请输入用户名' }]">
              <a-input
                v-model:value="loginForm.username"
                placeholder="用户名"
                size="large"
                :disabled="loading"
              />
            </a-form-item>
            <a-form-item name="password" :rules="[{ required: true, message: '请输入密码' }]">
              <a-input-password
                v-model:value="loginForm.password"
                placeholder="密码"
                size="large"
                :disabled="loading"
              />
            </a-form-item>
            <a-form-item>
              <a-button type="primary" html-type="submit" size="large" block :loading="loading">
                登录
              </a-button>
            </a-form-item>
          </a-form>
          <div class="panel-footer">
            <a-button
              type="link"
              size="small"
              :disabled="isProduction"
              @click="switchMode('register')"
            >
              注册新账号
            </a-button>
            <span class="split">·</span>
            <a-button
              type="link"
              size="small"
              :disabled="isProduction"
              @click="switchMode('changePassword')"
            >
              修改密码
            </a-button>
          </div>
          <div class="quick-login">
            <div class="quick-login-copy">
              <span class="quick-login-label">快速体验</span>
              <p class="hint">使用默认账号登录：admin / Admin123!</p>
            </div>
            <a-button
              class="btn-quick-login"
              size="small"
              :disabled="isProduction"
              @click="quickLogin"
            >
              使用默认账号
            </a-button>
          </div>
        </template>

        <!-- 注册 -->
        <template v-if="mode === 'register'">
          <div class="panel-header">
            <h2>创建账号</h2>
            <p>加入感智晓界开发平台</p>
          </div>
          <a-form :model="registerForm" @finish="handleRegister" class="panel-form">
            <a-form-item name="username" :rules="[{ required: true, message: '请输入用户名' }]">
              <a-input
                v-model:value="registerForm.username"
                placeholder="用户名"
                size="large"
                :disabled="loading"
              />
            </a-form-item>
            <a-form-item
              name="password"
              :rules="[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6位' }
              ]"
            >
              <a-input-password
                v-model:value="registerForm.password"
                placeholder="密码（至少6位）"
                size="large"
                :disabled="loading"
              />
            </a-form-item>
            <a-form-item
              name="confirmPassword"
              :rules="[
                { required: true, message: '请确认密码' },
                { validator: validateConfirmPassword, trigger: 'change' }
              ]"
            >
              <a-input-password
                v-model:value="registerForm.confirmPassword"
                placeholder="确认密码"
                size="large"
                :disabled="loading"
              />
            </a-form-item>
            <a-form-item>
              <a-button
                type="primary"
                html-type="submit"
                size="large"
                block
                :loading="loading"
                :disabled="isProduction"
              >
                注册
              </a-button>
            </a-form-item>
          </a-form>
          <div class="panel-footer">
            <a-button type="link" size="small" @click="switchMode('login')">返回登录</a-button>
          </div>
        </template>

        <!-- 修改密码 -->
        <template v-if="mode === 'changePassword'">
          <div class="panel-header">
            <h2>修改密码</h2>
            <p>更新您的登录凭据</p>
          </div>
          <a-form :model="passwordForm" @finish="handleChangePassword" class="panel-form">
            <a-form-item name="username" :rules="[{ required: true, message: '请输入用户名' }]">
              <a-input
                v-model:value="passwordForm.username"
                placeholder="用户名"
                size="large"
                :disabled="loading"
              />
            </a-form-item>
            <a-form-item name="oldPassword" :rules="[{ required: true, message: '请输入原密码' }]">
              <a-input-password
                v-model:value="passwordForm.oldPassword"
                placeholder="原密码"
                size="large"
                :disabled="loading"
              />
            </a-form-item>
            <a-form-item
              name="newPassword"
              :rules="[
                { required: true, message: '请输入新密码' },
                { min: 6, message: '密码至少6位' }
              ]"
            >
              <a-input-password
                v-model:value="passwordForm.newPassword"
                placeholder="新密码（至少6位）"
                size="large"
                :disabled="loading"
              />
            </a-form-item>
            <a-form-item
              name="confirmPassword"
              :rules="[
                { required: true, message: '请确认新密码' },
                { validator: validateConfirmPassword, trigger: 'change' }
              ]"
            >
              <a-input-password
                v-model:value="passwordForm.confirmPassword"
                placeholder="确认新密码"
                size="large"
                :disabled="loading"
              />
            </a-form-item>
            <a-form-item>
              <a-button
                type="primary"
                html-type="submit"
                size="large"
                block
                :loading="loading"
                :disabled="isProduction"
              >
                修改密码
              </a-button>
            </a-form-item>
          </a-form>
          <div class="panel-footer">
            <a-button type="link" size="small" @click="switchMode('login')">返回登录</a-button>
          </div>
        </template>
      </div>

      <div class="panel-copyright">© 2026 感智晓界工坊 · 感动科技｜智能体工作室</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import axios from 'axios'
import LoginAuroraCanvas from '@/components/LoginAuroraCanvas.vue'
import { useTheme } from '@/composables/useTheme'
import http from '@/core/http'

const route = useRoute()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()
const withBaseAsset = (assetPath) => `${import.meta.env.BASE_URL}${assetPath}`
const isProduction = import.meta.env.PROD

const brandSymbolSrc = withBaseAsset('favicon.png')
const logoSrc = computed(() => withBaseAsset(isDark.value ? 'logo-thin-dark.png' : 'logo-thin.png'))

const mode = ref('login')
const loading = ref(false)

const loginForm = ref({ username: '', password: '' })
const registerForm = ref({ username: '', password: '', confirmPassword: '' })
const passwordForm = ref({ username: '', oldPassword: '', newPassword: '', confirmPassword: '' })

const switchMode = (target) => {
  if (isProduction && ['register', 'changePassword'].includes(target)) return
  mode.value = target
}

const validateConfirmPassword = async (_rule, value) => {
  const target = mode.value === 'register' ? registerForm.value : passwordForm.value
  const compareField = mode.value === 'register' ? 'password' : 'newPassword'
  if (value && value !== target[compareField]) {
    return Promise.reject('两次输入的密码不一致')
  }
  return Promise.resolve()
}

const quickLogin = async () => {
  if (isProduction) return
  loginForm.value.username = 'admin'
  loginForm.value.password = 'Admin123!'
  await handleLogin()
}

const handleLogin = async () => {
  loading.value = true
  try {
    const res = await axios.post('/api/auth/login', loginForm.value, { withCredentials: true })
    if (res.data.success) {
      message.success('登录成功')
      localStorage.setItem('user', JSON.stringify(res.data.user))
      try {
        const groupData = await http.get('/api/auth/current')
        if (groupData.success && groupData.data.group?.id) {
          localStorage.setItem('currentGroupId', groupData.data.group.id)
        }
      } catch (e) {
        console.warn('获取群组信息失败:', e)
      }
      sessionStorage.removeItem('currentSessionId')
      const redirectPath =
        typeof route.query.redirect === 'string' ? route.query.redirect : '/generator/components'
      router.replace(redirectPath)
    } else {
      message.error(res.data.error || '登录失败')
    }
  } catch (error) {
    message.error(error.response?.data?.error || '登录失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

const handleRegister = async () => {
  if (isProduction) return
  loading.value = true
  try {
    const res = await axios.post(
      '/api/auth/register',
      {
        username: registerForm.value.username,
        password: registerForm.value.password
      },
      { withCredentials: true }
    )
    if (res.data.success) {
      message.success('注册成功，请登录')
      loginForm.value.username = registerForm.value.username
      loginForm.value.password = ''
      registerForm.value = { username: '', password: '', confirmPassword: '' }
      mode.value = 'login'
    } else {
      message.error(res.data.message || '注册失败')
    }
  } catch (error) {
    message.error(error.response?.data?.message || '注册失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

const handleChangePassword = async () => {
  if (isProduction) return
  loading.value = true
  try {
    const res = await axios.post(
      '/api/auth/change-password',
      {
        username: passwordForm.value.username,
        oldPassword: passwordForm.value.oldPassword,
        newPassword: passwordForm.value.newPassword
      },
      { withCredentials: true }
    )
    if (res.data.success) {
      message.success('密码修改成功，请用新密码登录')
      loginForm.value.username = passwordForm.value.username
      loginForm.value.password = ''
      passwordForm.value = { username: '', oldPassword: '', newPassword: '', confirmPassword: '' }
      mode.value = 'login'
    } else {
      message.error(res.data.message || '密码修改失败')
    }
  } catch (error) {
    message.error(error.response?.data?.message || '密码修改失败，请稍后重试')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* ========================================
   登录页 — 分屏布局 + 科技感动效
   ======================================== */

/* ── 主题切换按钮 ── */
.login-theme-toggle {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 100;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary, #1f2937);
  transition: all 0.3s ease;
  box-shadow: var(--shadow-md);
}

.login-theme-toggle:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(1.08);
  box-shadow: var(--shadow-md);
}

.login-theme-toggle:active {
  transform: scale(0.95);
}

html[data-theme='dark'] .login-theme-toggle {
  background: rgba(0, 0, 0, 0.2);
  border-color: rgba(255, 255, 255, 0.15);
  color: var(--text-primary, #f3f4f6);
}

html[data-theme='dark'] .login-theme-toggle:hover {
  background: rgba(0, 0, 0, 0.3);
}

.login-page {
  display: flex;
  min-height: 100vh;
  overflow: hidden;
}

/* ── 左半区：品牌视觉 ── */
.login-visual {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 16% 18%, rgba(203, 213, 225, 0.32) 0%, transparent 28%),
    radial-gradient(circle at 78% 20%, rgba(209, 213, 219, 0.28) 0%, transparent 26%),
    radial-gradient(circle at 58% 72%, rgba(226, 232, 240, 0.26) 0%, transparent 24%),
    linear-gradient(160deg, #f7f8fa 0%, #f1f3f5 42%, #eef0f3 100%);
  overflow: hidden;
}

.login-visual.is-dark {
  background: radial-gradient(
      circle at 12% 12%,
      color-mix(in srgb, var(--brand) 22%, transparent) 0%,
      transparent 30%
    ),
    radial-gradient(
      circle at 82% 22%,
      color-mix(in srgb, var(--feature) 16%, transparent) 0%,
      transparent 28%
    ),
    linear-gradient(
      160deg,
      color-mix(in srgb, var(--bg-page) 94%, black) 0%,
      color-mix(in srgb, var(--bg-card) 88%, black) 52%,
      color-mix(in srgb, var(--bg-page) 90%, black) 100%
    );
}

.visual-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  isolation: isolate;
  overflow: hidden;
  pointer-events: none;
}

.visual-bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 22% 28%, rgba(209, 213, 219, 0.22) 0%, transparent 18%),
    linear-gradient(
      120deg,
      rgba(255, 255, 255, 0.18) 0%,
      transparent 44%,
      rgba(203, 213, 225, 0.1) 100%
    );
  pointer-events: none;
  z-index: 0;
}

.visual-bg :deep(.aurora-canvas) {
  z-index: 1;
}

.visual-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(
      circle at center,
      transparent 28%,
      color-mix(in srgb, var(--bg-page) 10%, transparent) 62%,
      color-mix(in srgb, var(--bg-page) 82%, transparent) 100%
    ),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--bg-page) 8%, transparent) 0%,
      transparent 16%,
      transparent 78%,
      color-mix(in srgb, var(--bg-page) 18%, transparent) 100%
    );
  pointer-events: none;
  z-index: 3;
}

.login-visual:not(.is-dark) .visual-vignette {
  background: radial-gradient(
      circle at center,
      transparent 24%,
      rgba(255, 255, 255, 0.06) 60%,
      rgba(238, 240, 243, 0.68) 100%
    ),
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.1) 0%,
      transparent 16%,
      transparent 78%,
      rgba(238, 240, 243, 0.32) 100%
    );
}

/* 渐变光晕粒子 */
.particle {
  position: absolute;
  border-radius: var(--radius-full);
  filter: blur(84px);
  opacity: 0.08;
  pointer-events: none;
  z-index: 2;
}

.login-visual:not(.is-dark) .particle {
  opacity: 0.14;
  filter: blur(70px);
}
.p1 {
  width: 320px;
  height: 320px;
  background: color-mix(in srgb, var(--brand) 78%, transparent);
  left: -12%;
  top: 18%;
}
.p2 {
  width: 240px;
  height: 240px;
  background: color-mix(in srgb, var(--feature) 72%, transparent);
  right: -5%;
  bottom: 12%;
}
.p3 {
  width: 180px;
  height: 180px;
  background: color-mix(in srgb, var(--brand-light) 66%, transparent);
  left: 42%;
  top: 62%;
}
.p4 {
  width: 140px;
  height: 140px;
  background: color-mix(in srgb, var(--success) 64%, transparent);
  right: 28%;
  top: 8%;
}
.p5 {
  width: 100px;
  height: 100px;
  background: color-mix(in srgb, var(--warning) 58%, transparent);
  left: 22%;
  bottom: 12%;
}

/* 浅色主题：粒子改为银灰低饱和 */
.login-visual:not(.is-dark) .p1 {
  background: rgba(209, 213, 219, 0.55);
}
.login-visual:not(.is-dark) .p2 {
  background: rgba(191, 199, 213, 0.5);
}
.login-visual:not(.is-dark) .p3 {
  background: rgba(226, 232, 240, 0.46);
}
.login-visual:not(.is-dark) .p4 {
  background: rgba(203, 213, 225, 0.4);
}
.login-visual:not(.is-dark) .p5 {
  background: rgba(209, 213, 219, 0.34);
}

/* 网格覆盖层 */
.grid-overlay {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(
      color-mix(in srgb, var(--border-default) 64%, transparent) 1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--border-default) 64%, transparent) 1px,
      transparent 1px
    );
  background-size: 64px 64px;
  opacity: 0.14;
  mask-image: radial-gradient(ellipse at center, black 28%, transparent 76%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 28%, transparent 76%);
  z-index: 3;
}

.login-visual:not(.is-dark) .grid-overlay {
  opacity: 0.08;
}

.visual-content {
  position: relative;
  z-index: 4;
  width: min(100%, 720px);
  text-align: center;
  padding: 56px 48px;
}

.brand-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.brand-area,
.visual-tagline,
.visual-features {
  text-shadow: 0 8px 30px color-mix(in srgb, var(--bg-page) 55%, transparent);
}

.login-visual:not(.is-dark) .brand-area,
.login-visual:not(.is-dark) .visual-tagline,
.login-visual:not(.is-dark) .visual-features {
  text-shadow: 0 10px 28px rgba(255, 255, 255, 0.68);
}

.brand-lockup {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 12px 18px;
  border: 1px solid color-mix(in srgb, var(--border-light) 48%, transparent);
  background: color-mix(in srgb, var(--bg-card) 18%, transparent);
  backdrop-filter: blur(14px);
  border-radius: var(--radius-full);
}

.login-visual:not(.is-dark) .brand-lockup {
  border-color: rgba(255, 255, 255, 0.62);
  background: rgba(255, 255, 255, 0.34);
}

.brand-symbol {
  width: 34px;
  height: 34px;
  object-fit: contain;
  filter: drop-shadow(0 0 10px color-mix(in srgb, var(--brand) 22%, transparent));
  flex-shrink: 0;
}

.brand-divider {
  width: 1px;
  height: 24px;
  background: linear-gradient(
    180deg,
    transparent,
    color-mix(in srgb, var(--brand) 68%, white) 50%,
    transparent
  );
  opacity: 0.7;
}

.brand-wordmark {
  height: 36px;
  width: auto;
  object-fit: contain;
  opacity: 0.92;
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--brand) 16%, transparent));
  flex-shrink: 0;
}

.visual-tagline {
  margin-bottom: 24px;
}

.tagline-eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 2.6px;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--text-secondary) 72%, var(--brand) 28%);
}

.tagline-main {
  margin: 0;
  font-size: 42px;
  font-weight: 700;
  line-height: 1.08;
  letter-spacing: 0;
  color: var(--text-primary);
}

.tagline-sub {
  max-width: 460px;
  margin: 10px auto 0;
  font-size: 15px;
  line-height: 1.65;
  color: color-mix(in srgb, var(--text-secondary) 82%, white);
  letter-spacing: 0;
}

.login-visual:not(.is-dark) .tagline-eyebrow {
  color: rgba(99, 102, 241, 0.72);
}

.login-visual:not(.is-dark) .tagline-main {
  color: #1f2a44;
}

.login-visual:not(.is-dark) .tagline-sub {
  color: rgba(55, 65, 81, 0.88);
}

.visual-features {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 188px));
  justify-content: center;
  gap: 12px;
  margin-top: 4px;
}

.feature-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  color: color-mix(in srgb, var(--text-secondary) 90%, var(--text-primary) 10%);
  border: 1px solid color-mix(in srgb, var(--border-light) 42%, transparent);
  background: color-mix(in srgb, var(--bg-card) 10%, transparent);
  border-radius: var(--radius-md);
}

.login-visual:not(.is-dark) .feature-item {
  color: rgba(55, 65, 81, 0.86);
  border-color: rgba(255, 255, 255, 0.42);
  background: rgba(255, 255, 255, 0.22);
}

.feature-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--brand);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 10%, transparent);
  flex-shrink: 0;
  opacity: 0.95;
}

.login-visual:not(.is-dark) .feature-dot {
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
}

/* ── 右半区：表单面板 ── */
.login-panel {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  padding: 40px;
  max-width: 520px;
  /* 与左半渐变区分：左侧整体抬高（向上柔光阴影），让"边栏"和"右半"明显分层 */
  box-shadow: -16px 0 40px -8px rgba(15, 23, 42, 0.06);
}

/* 左分割线加粗 + 整段实线可见，不再渐隐（避免中段清楚头尾像断掉）*/
.login-panel::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 1px;
  background: var(--border-default);
}

.panel-card {
  width: 100%;
  max-width: 400px;
  padding: 36px 32px 28px;
  border-radius: var(--radius-lg);
  border: none;
  background: color-mix(in srgb, var(--bg-card) 97%, var(--bg-elevated) 3%);
  box-shadow: var(--shadow-sm);
}

.panel-header {
  text-align: center;
  margin-bottom: 26px;
}

.panel-header h2 {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 10px;
  letter-spacing: 0;
}

.panel-header p {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-tertiary);
  margin: 0;
}

.panel-form {
  margin-bottom: 0;
}

.panel-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-top: 6px;
}

.split {
  color: color-mix(in srgb, var(--text-quaternary) 82%, transparent);
  font-size: 12px;
}

:deep(.ant-btn-link) {
  color: color-mix(in srgb, var(--text-tertiary) 92%, var(--text-secondary) 8%);
  font-size: 13px;
  font-weight: 500;
  padding: 0 6px;
}
:deep(.ant-btn-link:hover) {
  color: var(--brand);
}

.quick-login {
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--border-light) 64%, transparent);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.quick-login-copy {
  min-width: 0;
  text-align: left;
}

.quick-login-label {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: color-mix(in srgb, var(--text-tertiary) 92%, var(--brand) 8%);
}

.hint {
  font-size: 11px;
  line-height: 1.45;
  color: color-mix(in srgb, var(--text-quaternary) 92%, var(--text-tertiary) 8%);
  margin: 4px 0 0;
}

.btn-quick-login {
  height: 32px;
  padding: 0 8px;
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: color-mix(in srgb, var(--text-secondary) 90%, var(--brand) 10%);
  font-size: 12px;
  font-weight: 600;
  box-shadow: none;
}

.btn-quick-login:hover,
.btn-quick-login:focus {
  color: var(--brand);
  background: color-mix(in srgb, var(--brand-bg) 40%, transparent);
}

.panel-copyright {
  position: absolute;
  bottom: 24px;
  font-size: 12px;
  color: var(--text-tertiary);
  letter-spacing: 0.3px;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
  width: calc(100% - 80px);
  text-align: center;
}

/* ── 输入框与按钮主题适配 ── */
:deep(.ant-input),
:deep(.ant-input-password) {
  background: color-mix(in srgb, var(--bg-hover) 58%, var(--bg-card) 42%);
  border: 1px solid transparent;
  color: var(--text-primary);
  border-radius: var(--radius-md);
  height: 48px;
  font-size: 15px;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

:deep(.ant-input:hover),
:deep(.ant-input-password:hover),
:deep(.ant-input-affix-wrapper:hover) {
  border-color: color-mix(in srgb, var(--brand-light) 26%, transparent);
  background: color-mix(in srgb, var(--bg-hover) 50%, var(--bg-card) 50%);
}

:deep(.ant-input:focus),
:deep(.ant-input-password:focus),
:deep(.ant-input-affix-wrapper-focused) {
  border-color: color-mix(in srgb, var(--brand) 48%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 8%, transparent);
  background: var(--bg-card);
}

:deep(.ant-input::placeholder),
:deep(.ant-input-password input::placeholder) {
  color: color-mix(in srgb, var(--text-quaternary) 62%, transparent);
  font-size: 14px;
}

:deep(.ant-input-affix-wrapper) {
  background: color-mix(in srgb, var(--bg-hover) 58%, var(--bg-card) 42%);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  padding: 0 16px;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

:deep(.ant-input-affix-wrapper .ant-input) {
  background: transparent;
  border: none !important;
  box-shadow: none !important;
  height: 46px;
}

:deep(.ant-input-password) {
  padding: 0;
}

:deep(.ant-btn-primary) {
  background: var(--brand);
  border: 1px solid var(--brand);
  font-weight: 600;
  border-radius: var(--radius-md);
  height: 46px;
  font-size: 15px;
  letter-spacing: 0;
  box-shadow: none;
}

:deep(.ant-btn-primary:hover) {
  background: var(--brand-hover);
  border-color: var(--brand-hover);
}

:deep(.ant-btn-dashed) {
  color: var(--text-secondary);
  border-color: color-mix(in srgb, var(--border-strong) 82%, transparent);
  border-radius: var(--radius-md);
  height: 40px;
  font-size: 15px;
  font-weight: 600;
  background: color-mix(in srgb, var(--bg-card) 88%, var(--bg-hover) 12%);
}

:deep(.ant-btn-dashed:hover) {
  color: var(--brand);
  border-color: color-mix(in srgb, var(--brand) 72%, var(--border-strong));
  background: color-mix(in srgb, var(--brand-bg) 62%, var(--bg-card));
}

:deep(.ant-form-item) {
  margin-bottom: 18px;
}

:deep(.ant-form-item-explain-error) {
  font-size: 12px;
  line-height: 1.45;
  padding-top: 6px;
  color: color-mix(in srgb, var(--error) 88%, #ff8a8a);
}

:deep(.ant-form-item-has-error .ant-input),
:deep(.ant-form-item-has-error .ant-input-affix-wrapper),
:deep(.ant-form-item-has-error .ant-input-password) {
  border-color: color-mix(in srgb, var(--error) 48%, transparent) !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--error) 7%, transparent) !important;
  background: color-mix(in srgb, var(--error-bg) 18%, var(--bg-card)) !important;
}

/* ── 响应式：小屏堆叠 ── */
@media (max-width: 960px) {
  .visual-content {
    width: min(100%, 640px);
    padding: 44px 32px;
  }

  .visual-features {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .login-page {
    flex-direction: column;
  }
  .login-visual {
    flex: 0 0 auto;
    padding: 40px 24px;
    min-height: auto;
  }
  .login-panel {
    max-width: 100%;
    padding: 24px;
  }
  .panel-card {
    padding: 28px 22px 24px;
    border-radius: var(--radius-xl);
  }
  .panel-header {
    margin-bottom: 22px;
  }
  .panel-header h2 {
    font-size: 24px;
  }
  .panel-header p {
    font-size: 13px;
  }
  .quick-login {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .quick-login-copy {
    text-align: center;
  }
  .btn-quick-login {
    width: 100%;
    justify-content: center;
  }
  .brand-area {
    margin-bottom: 18px;
  }
  .brand-lockup {
    gap: 12px;
    padding: 10px 14px;
  }
  .brand-symbol {
    width: 28px;
    height: 28px;
  }
  .brand-divider {
    height: 20px;
  }
  .brand-wordmark {
    height: 20px;
  }
  .visual-tagline {
    margin-bottom: 20px;
  }
  .tagline-eyebrow {
    margin-bottom: 8px;
    font-size: 11px;
    letter-spacing: 2px;
  }
  .tagline-main {
    font-size: 30px;
    line-height: 1.08;
  }
  .tagline-sub {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.65;
  }
  .visual-features {
    display: none;
  }
  .grid-overlay {
    background-size: 40px 40px;
  }
  .panel-copyright {
    position: static;
    margin-top: 24px;
  }
}
</style>
