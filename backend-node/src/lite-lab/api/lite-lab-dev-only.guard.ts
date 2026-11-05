import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

/**
 * lite-lab 真值回填实验管线的暴露开关
 *
 * 与 ai-engine-v2 / ai-engine-v3 project 同一套模式：
 *   1. LITE_LAB_ENABLED 显式声明（true/1 开，false/0 关）
 *   2. 未声明时按 NODE_ENV 推断：非 production 即开放
 *
 * 🔴 单一来源：app.module.ts 条件注册与控制器 DevOnlyGuard 必须同调本函数，
 * 否则会出现「已注册但守卫 404」的静默失效。
 */
export function isLiteLabExposed(): boolean {
  const flag = process.env.LITE_LAB_ENABLED?.trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return process.env.NODE_ENV !== 'production';
}

@Injectable()
export class LiteLabDevOnlyGuard implements CanActivate {
  canActivate(): boolean {
    if (isLiteLabExposed()) return true;
    throw new NotFoundException('Cannot find endpoint');
  }
}
