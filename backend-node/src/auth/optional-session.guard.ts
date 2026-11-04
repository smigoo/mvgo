import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import { resolveSessionFromRequest } from './session.guard';

/**
 * 可选会话守卫：**解析身份但永不阻断**。
 *
 * 适用场景：既要「登录用户能读到自己的配置」，又要「未登录也能自检 / curl 冒烟」的
 * 只读元数据端点。当前用于 ai-engine-v2 的 catalog / health / preview / specs-upload。
 *
 * 🔴 为什么必须有它（2026-11-04 实锤）：
 *   health/preview 只读 `req.session?.userId`，而 `req.session` **仅由 SessionGuard 建立**
 *   （本仓无全局 session 中间件）。这两个端点此前不带任何会话守卫 ⇒ userId 恒为 undefined
 *   ⇒ `getMergedAiConfig(undefined)` 返回 `{}` ⇒ 引擎永远看不到用户已保存的模型配置
 *   ⇒ 用户「已配置统一模型」却仍报「凭证缺失 / 未配置模型」（误报，且与配置无关）。
 *
 * 与 SessionGuard 的分工（语义边界，勿混用）：
 *   - SessionGuard        → 有副作用 / 必须归属用户的端点（如 generate）：缺 token **抛 401**
 *   - OptionalSessionGuard → 只读元数据端点：缺 token **匿名放行**，带 token 则装载身份
 *   两者共用 `resolveSessionFromRequest`，身份解析只有一份实现。
 */
@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // 返回值刻意忽略：解析失败 = 匿名请求，由下游按「无用户配置」处理，不阻断请求。
    await resolveSessionFromRequest(request, this.authService);
    return true;
  }
}
