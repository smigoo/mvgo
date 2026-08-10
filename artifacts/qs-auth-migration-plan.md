# QS 门户鉴权改造实施方案

## 📊 门户数据结构

```javascript
// Token
window.parent.getToken() 
// => 'AT-20-lF1i2r1CRUmTRzLb1rfjDddHzvujMG-Z-78765ef96e33'

// 用户信息（JSON 字符串）
window.parent.getUserInfo()
// => {
//   uid: 'zhjie',
//   name: '周洁',
//   account: 'zhjie',
//   mobile: '13915990485',
//   workcode: '1616',
//   deptCode: '10212702',
//   deptName: '桥隧研发部',
//   orgCode: '1021',
//   orgName: '感动科技',
//   token: 'AT-20-...',
//   exprise: 28800  // 8小时
// }
```

**唯一标识**：`uid` 或 `account`（都是 "zhjie"）
**数据隔离字段**：使用 `uid` 作为用户标识

---

## 🎯 改造目标

1. ✅ 废弃本地登录页，使用门户 QS 鉴权
2. ✅ 从门户获取用户信息，自动注册/登录
3. ✅ 数据按用户隔离（生成记录归属个人）
4. ✅ 支持门户 token 过期处理

---

## 🔧 具体改造工作

### 阶段一：前端改造（4-6 小时）

#### F1: 用户 Store 改造
**文件**: `frontend/src/store/modules/user.js`

**改动点**:
```javascript
// 新增 action：从门户获取用户信息并初始化
async initFromPortal() {
  // 1. 检查是否在门户环境
  if (!window.parent?.getUserInfo) {
    throw new Error('非门户环境，无法获取用户信息')
  }

  // 2. 获取门户用户信息
  const portalUserInfo = JSON.parse(window.parent.getUserInfo())
  const portalToken = window.parent.getToken()

  // 3. 调用后端接口，同步用户信息并获取 session
  const response = await fetch('/api/auth/portal-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      uid: portalUserInfo.uid,
      name: portalUserInfo.name,
      account: portalUserInfo.account,
      mobile: portalUserInfo.mobile,
      deptName: portalUserInfo.deptName,
      orgName: portalUserInfo.orgName,
      portalToken: portalToken
    })
  })

  const data = await response.json()
  if (data.success) {
    // 4. 更新 store 状态
    this.userInfo = {
      id: data.user._id,
      uid: portalUserInfo.uid,
      username: portalUserInfo.name,
      name: portalUserInfo.name,
      dept: portalUserInfo.deptName,
      org: portalUserInfo.orgName
    }
    this.role = data.user.role || 'member'
    localStorage.setItem('user', JSON.stringify(this.userInfo))
  } else {
    throw new Error(data.message || '门户登录失败')
  }
}

// 修改原有 fetchCurrentUser()
async fetchCurrentUser() {
  // 如果已有用户信息，直接返回
  if (this.userInfo?.id) {
    return { success: true }
  }

  // 否则从门户初始化
  try {
    await this.initFromPortal()
    return { success: true }
  } catch (error) {
    console.error('门户登录失败:', error)
    return { success: false, message: error.message }
  }
}
```

#### F2: 路由守卫改造
**文件**: `frontend/src/router/permission.js`

**改动点**:
```javascript
router.beforeEach(async (to, from, next) => {
  // 1. 无需认证的页面直接放行
  if (to.meta?.noAuth) {
    return next()
  }

  // 2. 检查门户环境
  const userStore = useUserStore(pinia)
  
  // 3. 尝试从门户初始化用户
  const data = await userStore.fetchCurrentUser()
  
  if (!data.success) {
    message.error('登录失败：' + (data.message || '无法获取用户信息'))
    // 不在跳转门户，由门户处理
    return next(false)
  }

  // 4. 路由级权限检查（保留）
  const requiredPermission = to.meta?.permission
  if (requiredPermission && !userStore.hasPermission(requiredPermission)) {
    message.error('您没有访问该页面的权限')
    return next('/')
  }

  // 5. 功能开关检查（保留）
  const featureStore = useFeatureFlagsStore(pinia)
  const featureKey = ROUTE_FEATURE_MAP[to.path]
  if (featureKey && !featureStore.isEnabled(featureKey)) {
    message.warning('该功能暂未开放')
    return next('/')
  }

  next()
})
```

#### F3: 请求拦截器改造
**文件**: `frontend/src/core/request.js`

**改动点**:
```javascript
// 修改 token 注入逻辑
before: (res, resolve, reject) => {
  // 从门户获取最新 token
  if (window.parent?.getToken) {
    const portalToken = window.parent.getToken()
    res.headers['X-Portal-Token'] = portalToken
  }

  // 原有 token 逻辑保留（兼容开发环境）
  res.headers[$processEnv.tokenKey] = useUserStore().token
  
  // ... 其他 header 设置
}

// 修改 401 处理
case 401:
  // 门户环境下，通知门户刷新
  if (window.parent?.location) {
    message.error('登录已过期，请刷新页面')
    window.parent.location.reload()
  } else {
    // 开发环境：跳转登录页
    $message.error(msg || '授权未通过')
  }
  break
```

#### F4: 登录页改造
**文件**: `frontend/src/views/login/index.vue`

**改动点**:
```vue
<template>
  <div class="login-page">
    <div class="loading-container">
      <a-spin size="large" />
      <p>正在登录...</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/modules/user'
import { message } from 'ant-design-vue'

const router = useRouter()
const userStore = useUserStore()

onMounted(async () => {
  // 自动尝试门户登录
  try {
    await userStore.initFromPortal()
    router.replace('/')
  } catch (error) {
    message.error('登录失败：' + error.message)
  }
})
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.loading-container {
  text-align: center;
}
</style>
```

#### F5: 移除 localStorage 清理
**全局搜索**: `localStorage.setItem('user',`

**保留**: 只在 `user.js` 的 `initFromPortal()` 中设置
**移除**: 其他地方的手动设置

---

### 阶段二：后端改造（6-8 小时）

#### B1: 新增门户登录接口
**文件**: `backend-node/src/auth/auth.controller.ts`

**新增**:
```typescript
@Post('portal-login')
async portalLogin(
  @Body() portalDto: PortalLoginDto,
  @Session() session: Record<string, any>
) {
  // 1. 验证门户 token（可选：调用门户验证接口）
  // const isValid = await this.authService.verifyPortalToken(portalDto.portalToken)
  // if (!isValid) {
  //   throw new UnauthorizedException('门户 token 无效')
  // }

  // 2. 查找或创建用户
  const user = await this.authService.findOrCreateByPortalUser(portalDto)

  // 3. 设置 session
  session.userId = user._id.toString()
  session.uid = user.uid
  session.username = user.username
  session.role = user.role

  return new Promise((resolve, reject) => {
    session.save((err) => {
      if (err) {
        reject(err)
      } else {
        resolve({
          success: true,
          message: '门户登录成功',
          user: {
            _id: user._id,
            uid: user.uid,
            username: user.username,
            role: user.role
          }
        })
      }
    })
  })
}
```

#### B2: 新增 DTO
**文件**: `backend-node/src/auth/dto/portal-login.dto.ts`

```typescript
import { IsNotEmpty, IsString, IsOptional } from 'class-validator'

export class PortalLoginDto {
  @IsString()
  @IsNotEmpty()
  uid: string

  @IsString()
  @IsNotEmpty()
  name: string

  @IsString()
  @IsNotEmpty()
  account: string

  @IsString()
  @IsOptional()
  mobile?: string

  @IsString()
  @IsOptional()
  deptName?: string

  @IsString()
  @IsOptional()
  orgName?: string

  @IsString()
  @IsNotEmpty()
  portalToken: string
}
```

#### B3: User Schema 扩展
**文件**: `backend-node/src/schemas/user.schema.ts`

**新增字段**:
```typescript
@Prop({ required: true, unique: true, sparse: true })
uid: string  // 门户 uid

@Prop()
portalInfo: {
  account?: string
  mobile?: string
  deptName?: string
  orgName?: string
  lastLogin?: Date
}
```

#### B4: AuthService 新增方法
**文件**: `backend-node/src/auth/auth.service.ts`

```typescript
async findOrCreateByPortalUser(portalDto: PortalLoginDto): Promise<User> {
  // 1. 尝试通过 uid 查找
  let user = await this.userModel.findOne({ uid: portalDto.uid })

  if (!user) {
    // 2. 自动注册
    user = await this.userModel.create({
      uid: portalDto.uid,
      username: portalDto.name,
      portalInfo: {
        account: portalDto.account,
        mobile: portalDto.mobile,
        deptName: portalDto.deptName,
        orgName: portalDto.orgName,
        lastLogin: new Date()
      },
      role: 'member'  // 默认角色
    })
  } else {
    // 3. 更新门户信息
    user.portalInfo = {
      ...user.portalInfo,
      account: portalDto.account,
      mobile: portalDto.mobile,
      deptName: portalDto.deptName,
      orgName: portalDto.orgName,
      lastLogin: new Date()
    }
    await user.save()
  }

  return user
}
```

#### B5: 数据隔离检查
**文件**: `backend-node/src/tasks/tasks.service.ts` 及其他资源 Service

**检查点**:
```typescript
// 确保所有资源查询都带上 userId 过滤
async findAll(userId: string) {
  return this.taskModel.find({ creator: userId })
}

async create(createTaskDto: any, userId: string) {
  return this.taskModel.create({
    ...createTaskDto,
    creator: userId  // 确保记录归属
  })
}
```

---

### 阶段三：联调与测试（4-6 小时）

#### T1: 本地开发模拟
**文件**: `frontend/src/config/dev-config.js`

```javascript
export default {
  token: 'AT-20-mock-token',
  getUserInfo: () => JSON.stringify({
    uid: 'dev-user',
    name: '开发用户',
    account: 'dev',
    mobile: '13800138000',
    deptName: '研发部',
    orgName: '感动科技'
  })
}
```

#### T2: 门户环境联调
- 部署到测试环境
- 在门户 iframe 中测试
- 验证用户信息获取
- 验证 session 创建
- 验证数据隔离

#### T3: Token 过期处理
- 门户 token 过期时间：8 小时（exprise: 28800）
- 前端：401 时刷新门户
- 后端：可选验证 token 有效性

#### T4: 现有用户数据迁移（可选）
如果已有用户数据需要关联门户 uid：
```javascript
// MongoDB 脚本
db.users.updateOne(
  { username: '周洁' },
  { $set: { uid: 'zhjie' } }
)
```

---

## 📋 改造清单 Checklist

### 前端
- [ ] F1: user.js - 新增 initFromPortal()
- [ ] F2: permission.js - 改造路由守卫
- [ ] F3: request.js - 改造请求拦截器
- [ ] F4: login/index.vue - 改造为自动登录页
- [ ] F5: 清理 localStorage 设置

### 后端
- [ ] B1: auth.controller.ts - 新增 portal-login 接口
- [ ] B2: 新增 portal-login.dto.ts
- [ ] B3: user.schema.ts - 新增 uid 和 portalInfo 字段
- [ ] B4: auth.service.ts - 新增 findOrCreateByPortalUser()
- [ ] B5: 检查所有资源 Service 的数据隔离

### 测试
- [ ] T1: 本地开发环境模拟
- [ ] T2: 门户环境联调
- [ ] T3: Token 过期处理测试
- [ ] T4: 数据隔离验证
- [ ] T5: 现有用户数据迁移（可选）

---

## ⚠️ 注意事项

1. **门户 token 验证**：当前方案假设门户 token 可信，如需验证需联系门户提供验证接口
2. **用户唯一性**：使用 `uid` 作为唯一标识，确保不与现有用户冲突
3. **数据隔离**：所有资源查询必须带上 `creator: userId` 过滤
4. **本地开发**：需要 mock 门户数据，避免开发时无法获取用户信息
5. **错误处理**：门户环境异常时的降级方案（显示错误提示而非跳转登录页）

---

## 🚀 实施建议

**推荐顺序**：
1. 先做后端（B1-B5），确保接口可用
2. 再做前端（F1-F5），对接后端接口
3. 最后联调测试（T1-T5）

**预计工时**：2-3 天
**风险点**：门户 token 验证机制未确认
