import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

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
    if (tokenValue) {
      try {
        let result = await this.authService.findOrCreateByPortalToken(String(tokenValue));
        // 开发态兜底：非生产 + DEV_AUTO_LOGIN 开启时，用开发假 token 自动建本地身份。
        // 生产环境 findOrCreateDevUser 内部 fail-closed 返回 null，不会生效。
        if (!result?.user) {
          result = await this.authService.findOrCreateDevUser(String(tokenValue));
        }
        if (result?.user) {
          // 写入 session，后续请求不再重复验证
          request.session.userId = result.user._id.toString();
          request.session.username = result.user.username;
          return true;
        }
      } catch (err) {
        // token 验证失败，继续走下面的异常
      }
    }

    throw new UnauthorizedException('未登录或登录已过期');
  }
}
