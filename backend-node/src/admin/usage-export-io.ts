import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { dataDir } from '../config/backend-root';

export interface SlimComponentTask {
  userId?: string;
  taskType?: string;
  target?: string;
  status?: string;
  startTime?: number;
  duration?: number;
  textModel?: string;
  visionModel?: string;
}

export interface SlimApiTask {
  ownerId?: string;
  createdAt?: string;
  apiCount?: number;
}

function firstModel(raw: any): string | undefined {
  const parts = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[0];
}

/** 实际调用优先 completionModels，旧任务回退 configSnapshot。不保留整包 snapshot。 */
export function slimTaskModels(obj: any): { textModel?: string; visionModel?: string } {
  const cm = obj?.completionModels || {};
  const cs = obj?.configSnapshot || {};
  const unified = cs.modelMode === 'unified';
  const textModel =
    firstModel(cm.textModel) || firstModel(unified ? cs.unifiedModel : cs.textModel);
  const visionModel =
    firstModel(cm.visionModel) || firstModel(unified ? cs.unifiedModel : cs.visionModel);
  return { textModel, visionModel };
}

export function slimDuration(obj: any): number | undefined {
  const stored = Number(obj?.duration);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const start = Number(obj?.startTime);
  const end = Number(obj?.endTime);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return end - start;
  return undefined;
}

function slimComponent(obj: any): SlimComponentTask {
  const models = slimTaskModels(obj);
  return {
    userId: obj?.userId,
    taskType: obj?.taskType,
    target: obj?.target,
    status: obj?.status,
    startTime: obj?.startTime,
    duration: slimDuration(obj),
    textModel: models.textModel,
    visionModel: models.visionModel,
  };
}

/**
 * 读取 JSON 数组的顶层对象并映射为 slim 结构。
 *
 * 性能结论（2026-09-17 实测，tasks.json 227MB / 423 对象）：
 * - 全量 `readFileSync` + `JSON.parse` = 744ms，峰值堆 592MB（1.5GB 堆内安全）。
 * - 旧「逐字符流式」实现反而 22~73s（字符串反复拼接 O(n²)），且多段 slice 易错。
 * - 故放弃流式，回归全量解析：简单、正确、快 ~100 倍。内存开销可接受。
 */
export async function readJsonArrayObjects<T>(
  filePath: string,
  map: (obj: any) => T,
): Promise<T[]> {
  if (!existsSync(filePath)) return [];
  try {
    const list = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(list)) return [];
    return list.map(map);
  } catch {
    return [];
  }
}

export async function loadSlimComponentTasks(): Promise<SlimComponentTask[]> {
  const p = join(dataDir, 'tasks.json');
  return readJsonArrayObjects(p, slimComponent);
}

export function loadSlimApiTasks(): SlimApiTask[] {
  const p = join(dataDir, 'apifox-tasks.json');
  if (!existsSync(p)) return [];
  try {
    const list = JSON.parse(readFileSync(p, 'utf-8'));
    if (!Array.isArray(list)) return [];
    return list.map((t) => ({
      ownerId: t?.ownerId,
      createdAt: t?.createdAt,
      apiCount: t?.apiCount,
    }));
  } catch {
    return [];
  }
}
