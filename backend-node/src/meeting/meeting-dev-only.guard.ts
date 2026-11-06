import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

/**
 * meeting 会议纪要管线的暴露开关（2026-11-06 用户裁决「补在 Node 含 ownerId」后新建）
 *
 * 与 ai-engine-v2 / ai-engine-v3 project / lite-lab 同一套模式：
 *   1. MEETING_ENABLED 显式声明（true/1 开，false/0 关）
 *   2. 未声明时按 NODE_ENV 推断：非 production 即开放
 *
 * 🔴 为什么默认在生产关闭：契约 `frontend/src/views/meeting/contracts/api-contract.js`
 *    的 BACKEND_DEPENDENCIES 五项（D-01 云 ASR/LLM 密钥、T-013 音频上传、SEC-05 委托处理
 *    协议、SEC-01 告知文案法务审定、Q-04 留存天数）**全部 ready:false 且级别「阻塞」**。
 *    依赖未就绪时对外暴露端点等于宣称「已接通」，与契约第 64 行「不得对外宣称已接通」冲突。
 *
 * 🔴 单一来源：app.module.ts 的条件注册与控制器上的 MeetingDevOnlyGuard 必须同调本函数，
 *    否则会出现「已注册但守卫 404」的静默失效（v3/lite-lab 踩过的同一坑）。
 */
export function isMeetingExposed(): boolean {
  const flag = process.env.MEETING_ENABLED?.trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return process.env.NODE_ENV !== 'production';
}

@Injectable()
export class MeetingDevOnlyGuard implements CanActivate {
  canActivate(): boolean {
    if (isMeetingExposed()) return true;
    throw new NotFoundException('Cannot find endpoint');
  }
}
