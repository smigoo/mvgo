import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

/**
 * v2 可配管线的暴露开关
 *
 * 产品约束：配置页只在 dev 可见，生产环境不应存在这些端点。
 *
 * 判定顺序：
 *   1. AI_ENGINE_V2_ENABLED 显式声明（true/1 开，false/0 关）—— 便于预发环境单独放开
 *   2. 未声明时按 NODE_ENV 推断：非 production 即开放
 */
export function isV2Exposed(): boolean {
  const flag = process.env.AI_ENGINE_V2_ENABLED?.trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return process.env.NODE_ENV !== 'production';
}

/**
 * 未开放时返回 404 而非 403 —— 对外表现为「该端点不存在」，
 * 不暴露「存在一个被保护的实验性管线」这一事实。
 */
@Injectable()
export class DevOnlyGuard implements CanActivate {
  canActivate(): boolean {
    if (isV2Exposed()) return true;
    throw new NotFoundException('Cannot find endpoint');
  }
}
