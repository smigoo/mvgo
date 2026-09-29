/**
 * 任务号污染判定与 temp 目录名（2026-09-29 · mc-1790667029984-86d05609 实锤）
 *
 * 事故：AI WorkSpace 对话里 LLM 调 generate_from_figma 时，把**上一个任务的 sessionId**
 *   （`mc-max-1790666569567-ddbcf714`）当成 componentName 传了进来。后果：
 *   ① temp 目录名被拼成 `mc-1790667029984-86d05609-mc-max-1790666569567-ddbcf714`
 *      ⇒ 新任务被嵌套进旧任务目录，破坏断点恢复 / 资源归属 / 预览 URL；
 *   ② 脏名进 prompt ⇒ 产物根容器多写一个 `c-mc-max-1790666569567-ddbcf714` 脏 class。
 *
 * 本 spec 锁定 `isTaskIdLikeName` / `resolveTaskFolderName` 两个纯函数（单一事实源）。
 */
import {
  isTaskIdLikeName,
  resolveTaskFolderName,
} from '../component-naming.js';

describe('isTaskIdLikeName —— 任务号污染判定（与 semanticTokenFrom 的 /\\d{13}/ 同源）', () => {
  it('⭐ 本次事故真值：上一个任务的 sessionId 被当组件名 → true', () => {
    expect(isTaskIdLikeName('mc-max-1790666569567-ddbcf714')).toBe(true);
  });

  it('各类 sessionId 形态（max/lite/mv/doc/refine、以及嵌套污染名）→ true', () => {
    expect(isTaskIdLikeName('mc-lite-1788491328748-9abce496')).toBe(true);
    expect(isTaskIdLikeName('mv-1787729232629-abcdef12')).toBe(true);
    expect(isTaskIdLikeName('mc-doc-1789000000000-0a1b2c3d')).toBe(true);
    expect(isTaskIdLikeName('mc-refine-1789000000000-0a1b2c3d')).toBe(true);
    // 已被污染过的目录名（两段任务号）同样识别为污染
    expect(
      isTaskIdLikeName('mc-1790667029984-86d05609-mc-max-1790666569567-ddbcf714'),
    ).toBe(true);
  });

  it('🛡️ 正常语义名 → false（不得误伤）', () => {
    expect(isTaskIdLikeName('device-monitor')).toBe(false);
    expect(isTaskIdLikeName('env-overview')).toBe(false);
    expect(isTaskIdLikeName('sales-trend-2026')).toBe(false);
    expect(isTaskIdLikeName('设备监测')).toBe(false);
    expect(isTaskIdLikeName('monitor')).toBe(false);
    // componentId 形态（含 8hex 尾段但无 13 位时间戳）不是任务号
    expect(isTaskIdLikeName('c-device-monitor-86d05609')).toBe(false);
  });

  it('空 / 非字符串输入 → false（fail-open，不抛错）', () => {
    expect(isTaskIdLikeName('')).toBe(false);
    expect(isTaskIdLikeName('   ')).toBe(false);
    expect(isTaskIdLikeName(null)).toBe(false);
    expect(isTaskIdLikeName(undefined)).toBe(false);
  });
});

describe('resolveTaskFolderName —— temp 产物目录名单一事实源', () => {
  const SID = 'mc-max-1790667029984-86d05609';

  it('正常语义名 → `{sessionId}-{componentName}`（保留可读性后缀）', () => {
    expect(resolveTaskFolderName(SID, 'device-monitor')).toBe(
      'mc-max-1790667029984-86d05609-device-monitor',
    );
  });

  it('⭐ 回归锁：componentName 是任务号 → 目录名退化为纯 sessionId（不再嵌套）', () => {
    // 修复前会拼成 mc-1790667029984-86d05609-mc-max-1790666569567-ddbcf714
    expect(
      resolveTaskFolderName('mc-1790667029984-86d05609', 'mc-max-1790666569567-ddbcf714'),
    ).toBe('mc-1790667029984-86d05609');
  });

  it('未提供 / 空白 componentName → 纯 sessionId', () => {
    expect(resolveTaskFolderName(SID, '')).toBe(SID);
    expect(resolveTaskFolderName(SID, '   ')).toBe(SID);
    expect(resolveTaskFolderName(SID, undefined)).toBe(SID);
  });

  it('componentName === sessionId → 不重复拼接', () => {
    expect(resolveTaskFolderName(SID, SID)).toBe(SID);
  });

  it('目录名恒以 sessionId 开头（断点恢复依赖此前缀）', () => {
    for (const cn of ['device-monitor', '', 'mc-max-1790666569567-ddbcf714', SID]) {
      expect(resolveTaskFolderName(SID, cn).startsWith(SID)).toBe(true);
    }
  });

  it('sessionId 缺失 → 空串（不产出无主目录名）', () => {
    expect(resolveTaskFolderName('', 'device-monitor')).toBe('');
    expect(resolveTaskFolderName(undefined, 'device-monitor')).toBe('');
  });
});
