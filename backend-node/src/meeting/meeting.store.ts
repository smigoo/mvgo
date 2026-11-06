import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { dataDir } from '../config/backend-root';

/**
 * meeting 管线的文件态存储（v1）
 *
 * 🔴 为什么用文件而不是 Mongo：本仓虽然全局连了 Mongoose（`database.module.ts`），
 *    但 `src/` 下**没有任何 `@Schema` / Model**（全仓零命中）——既有功能（apifox-tasks.json、
 *    tasks.json、project-runs/）一律走 `data/` 下的 JSON 文件。本模块沿用同一范式，
 *    避免为「依赖未就绪、尚不能上生产」的功能引入第二套持久化真相。
 *
 * 与 apifox 的差异：apifox 用裸 `writeFileSync`；这里同样**不**用 tmp+rename 原子替换——
 * memory 记载沙箱态 spawn 的进程对工作区 `rename` 必 EPERM（且 spawn 时定型、终身不愈），
 * 本模块在 :13030 常驻服务里跑，引入 rename 会平白多一类持久化冻结事故。
 *
 * 目录可用 `MEETING_DATA_DIR` 覆盖（测试与多环境隔离用）。
 */
export class MeetingStore {
  readonly root: string;

  constructor(root?: string) {
    this.root = root || process.env.MEETING_DATA_DIR?.trim() || join(dataDir, 'meeting');
  }

  path(name: string): string {
    return join(this.root, name);
  }

  read<T>(name: string, fallback: T): T {
    const p = this.path(name);
    if (!existsSync(p)) return fallback;
    try {
      const raw = readFileSync(p, 'utf-8');
      if (!raw.trim()) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      // 坏 JSON **不静默重写**：返回 fallback 让调用方看到「空」，
      // 而不是把用户的会议记录覆盖成空数组（覆盖即不可逆）。
      return fallback;
    }
  }

  write<T>(name: string, value: T): void {
    if (!existsSync(this.root)) mkdirSync(this.root, { recursive: true });
    writeFileSync(this.path(name), JSON.stringify(value, null, 2), 'utf-8');
  }
}
