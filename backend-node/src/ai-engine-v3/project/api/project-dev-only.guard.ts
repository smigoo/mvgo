import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

/**
 * 项目级管线（ai-engine-v3/project）的暴露开关
 *
 * 产品约束：M1 只在 dev 可见，生产环境整个模块不注册、路由不存在。
 *
 * 🔴 为什么**不**复用 ai-engine-v2 的 DevOnlyGuard：
 *   DevOnlyGuard 读的是 `AI_ENGINE_V2_ENABLED`。若本管线用独立开关控制模块注册、
 *   却让守卫去读 v2 的开关，就会出现「模块已注册但守卫返回 404」的静默失效
 *   —— 表现为「改对了开关却怎么都 404」，且日志里没有任何提示。
 *   因此开关只有一份实现：模块注册与守卫都调本文件的 `isV3ProjectExposed()`。
 *
 * 判定顺序（与 v2 同构，便于运维心智一致）：
 *   1. `AI_ENGINE_V3_PROJECT_ENABLED` 显式声明（true/1 开，false/0 关）
 *   2. 未声明时按 NODE_ENV 推断：非 production 即开放
 */
export function isV3ProjectExposed(): boolean {
  const flag = process.env.AI_ENGINE_V3_PROJECT_ENABLED?.trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return process.env.NODE_ENV !== 'production';
}

/** 未开放时返回 404 而非 403 —— 不暴露「存在一个被保护的实验性管线」 */
@Injectable()
export class ProjectDevOnlyGuard implements CanActivate {
  canActivate(): boolean {
    if (isV3ProjectExposed()) return true;
    throw new NotFoundException('Cannot find endpoint');
  }
}
