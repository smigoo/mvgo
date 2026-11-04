import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * 从请求中解析用户身份并写入 session（**永不抛异常**）。
 *
 * 🔴 单一来源：SessionGuard（必需身份）与 OptionalSessionGuard（可选身份）共用本函数。
 *    为什么必须共用：`req.session` **只**由守卫建立（无全局 session 中间件），
 *    而 demo / tasks / phase2 / ai-engine-v2 等控制器都只读 `req.session?.userId`。
 *    历史上每处各写一份 token→userId 解析 ⇒ 一旦某端点漏挂守卫就静默拿到 undefined 用户，
 *    表现为「读不到用户配置」——ai-engine-v2 health/preview 的凭证误报正是这一类
 *    （用户已保存统一模型，端点却因 userId 为空而看到空配置）。
 *
 * 解析顺序（与 SessionGuard 原实现逐字一致）：
 *   ① 已有 session.userId → 直接复用，不再验证门户 token
 *   ② headers['token'] 或 query.token → findOrCreateByPortalToken（门户 token）
 *   ③ 开发态兜底 → findOrCreateDevUser（生产环境内部 fail-closed 返回 null）
 *
 * @returns 是否已存在 / 成功建立身份
 */
export async function resolveSessionFromRequest(
  request: any,
  authService: AuthService,
): Promise<boolean> {
  // 1. 优先检查 session 中是否有 userId（已登录用户）
  //    门户 token 只在首次登录时用于身份建立，之后 session 有效性由自身 cookie maxAge 控制，
  //    不再依赖门户 token 的过期时间判断（门户 token 有效期可能很短，导致频繁 401）。
  if (request.session?.userId) {
    return true;
  }

  // 2. 兜底：从 header 的 Token 字段自动建立身份（门户 token）
  //    SSE 场景下浏览器原生 EventSource 不能自定义 Header，因此兼容 query token。
  const token = request.headers['token'] || request.query?.token;
  const tokenValue = Array.isArray(token) ? token[0] : token;
  if (!tokenValue) {
    return false;
  }

  try {
    let result = await authService.findOrCreateByPortalToken(String(tokenValue));
    // 开发态兜底：非生产 + DEV_AUTO_LOGIN 开启时，用开发假 token 自动建本地身份。
    // 生产环境 findOrCreateDevUser 内部 fail-closed 返回 null，不会生效。
    if (!result?.user) {
      result = await authService.findOrCreateDevUser(String(tokenValue));
    }
    if (result?.user) {
      // 写入 session，后续请求不再重复验证
      request.session.userId = result.user._id.toString();
      request.session.username = result.user.username;
      // 设置管理员标志（从数据库用户记录中获取）
      request.session.isAdmin = result.user.isAdmin || false;
      return true;
    }
  } catch (err) {
    // token 验证失败：交由调用方决定（必需身份 → 401 / 可选身份 → 匿名放行）
  }
  return false;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 0. raw=1 静态资源请求放行（图片/CSS 等，已有路径穿越保护）
    //    新标签页打开图片 URL 不会携带 Token header，且内存 session 重启后失效，
    //    静态资源无需登录即可访问。
    const raw = request.query?.raw;
    if (raw === '1') {
      return true;
    }

    // 1~2. 复用统一身份解析（session 复用 / 门户 token / 开发态兜底）
    if (await resolveSessionFromRequest(request, this.authService)) {
      return true;
    }

    throw new UnauthorizedException('未登录或登录已过期');
  }
}
