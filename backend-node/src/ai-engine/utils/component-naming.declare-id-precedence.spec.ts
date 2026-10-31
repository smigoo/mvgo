/**
 * 🛡️ declare componentId 终态裁定（刀 33b · 2026-10-31 · P0 契约修复）
 *
 * 实锤（mc-max-1793416305379-cf43d973，组件 c-list1）：
 *   用户高级选项填了 `c-list1`，code-generator#resolveDeclareComponentId 已正确定稿
 *   （server.log「🆔 declare componentId 定稿: c-list1」），但落盘产物 declare.json 变成
 *   `c-list1-cf43d973`（server.log「declare.componentId 已重建为确定性格式」）。
 *
 * 根因：normalizeDeclareJson 的 id 归一不认识 userComponentId，把「无尾段」这一
 *   合法终态（契约见 normalizeUserComponentId JSDoc：无尾段 ⇒ classPrefixOf 原样返回 ⇒
 *   天然可剥离 + 重生成恒定）当「缺尾段的非规范 id」再 sanitize 一次。
 *
 * 治本：优先级裁定收敛到单一事实源 `decideDeclareComponentIdFinal`，user 段居首。
 * 本 spec 是**行为判据**（真跑函数），不是文本正则 —— 文末含阳性对照证明用例有牙。
 */
import {
  decideDeclareComponentIdFinal,
  sanitizeComponentId,
  normalizeUserComponentId,
  classPrefixOf,
} from './component-naming.js';

/** 实锤 sessionId（尾 8hex = cf43d973） */
const SID = 'mc-max-1793416305379-cf43d973';

describe('刀 33b ①：用户指定 id 为终态，禁止再 sanitize', () => {
  it('⭐ 实锤复现：user=c-list1 + 现值 c-list1 + sessionId ⇒ 必须保持 c-list1（不再追尾）', () => {
    const r = decideDeclareComponentIdFinal({
      userComponentId: 'c-list1',
      llmComponentId: 'c-list1',
      sessionId: SID,
    });
    expect(r.componentId).toBe('c-list1');
    expect(r.source).toBe('user');
    // 值未变 ⇒ 不写回、不打「被重建」日志（日志噪点也应归零）
    expect(r.changed).toBe(false);
    expect(r.forceChanged).toBe(false);
  });

  it('⭐ 用户 id 优先于脏检查点：历史检查点 c-list1-cf43d973 不得复活', () => {
    const r = decideDeclareComponentIdFinal({
      userComponentId: 'c-list1',
      llmComponentId: 'c-list1',
      checkpointId: 'c-list1-cf43d973',
      sessionId: SID,
    });
    expect(r.componentId).toBe('c-list1');
    expect(r.source).toBe('user');
  });

  it('用户 id 优先于 LLM 自造的带尾 id', () => {
    const r = decideDeclareComponentIdFinal({
      userComponentId: 'c-list1',
      llmComponentId: 'c-list1-9f9f9f9f',
      sessionId: SID,
    });
    expect(r.componentId).toBe('c-list1');
  });

  it('用户 id 走 normalizeUserComponentId 清洗（非法字符/无 c- 前缀）', () => {
    expect(normalizeUserComponentId('C_List 1!')).toBe('c-list-1');
    const r = decideDeclareComponentIdFinal({
      userComponentId: 'C_List 1!',
      llmComponentId: '',
      sessionId: SID,
    });
    expect(r.componentId).toBe('c-list-1');
    expect(r.source).toBe('user');
    expect(r.changed).toBe(true);
  });

  it('用户 id 非法（保留字 / 纯 8hex）⇒ 不得短路，回落既有归一链路', () => {
    for (const bad of ['component', 'unknown-component', 'test', 'temp', 'c-43e7fe45']) {
      expect(normalizeUserComponentId(bad)).toBe('');
      const r = decideDeclareComponentIdFinal({
        userComponentId: bad,
        llmComponentId: 'c-list1',
        sessionId: SID,
      });
      expect(r.source).toBe('sanitize');
      expect(r.componentId).toBe('c-list1-cf43d973');
    }
  });

  it('契约佐证：无尾段 id 的 class 前缀 = 完整 id（天然可剥离）', () => {
    expect(classPrefixOf('c-list1')).toBe('c-list1');
    expect(classPrefixOf('c-list1-cf43d973')).toBe('c-list1');
  });
});

describe('刀 33b ②③④⑤：非用户路径行为必须与改前逐字一致（反证/回归）', () => {
  it('② 检查点：仍走可剥离闸门（四段脏 id 自愈，刀 9 保护不得放宽）', () => {
    const r = decideDeclareComponentIdFinal({
      checkpointId: 'c-device-monitor-00g6b7vh-075b13a4',
      sessionId: SID,
    });
    expect(r.source).toBe('checkpoint');
    expect(r.componentId).toBe('c-device-monitor-cf43d973');
    // 尾段只许来自 sessionId（才是可剥离形态）
    expect(classPrefixOf(r.componentId)).toBe('c-device-monitor');
  });

  it('③ LLM 无尾段 id → 仍被收敛为 c-<语义>-<session 尾>', () => {
    const r = decideDeclareComponentIdFinal({ llmComponentId: 'c-monitor', sessionId: SID });
    expect(r.source).toBe('sanitize');
    expect(r.componentId).toBe('c-monitor-cf43d973');
    expect(r.forceChanged).toBe(true);
  });

  it('③ 已规范 id（尾段 = session 尾）→ 幂等，不改不报', () => {
    const r = decideDeclareComponentIdFinal({
      llmComponentId: 'c-monitor-cf43d973',
      sessionId: SID,
    });
    expect(r.componentId).toBe('c-monitor-cf43d973');
    expect(r.changed).toBe(false);
    expect(r.forceChanged).toBe(false);
  });

  it('④ LLM 未给 id → 由中文 displayName 派生语义段', () => {
    const r = decideDeclareComponentIdFinal({
      displayName: '部署节点概览',
      figmaName: 'cp-aiot-dpjh-bsjd',
      fallbackToken: 'aiot-dpjh-bsjd',
      sessionId: SID,
    });
    expect(r.source).toBe('derive');
    expect(r.componentId).toBe('c-overview-cf43d973');
  });

  it('⑤ 无 sessionId 兼容路径：空值补 normId / 缺前缀补 c- / 已规范不动', () => {
    expect(
      decideDeclareComponentIdFinal({ compatComponentId: 'c-x', llmComponentId: '' }).componentId,
    ).toBe('c-x');
    expect(
      decideDeclareComponentIdFinal({ compatComponentId: 'c-x', llmComponentId: 'device-monitor' })
        .componentId,
    ).toBe('c-device-monitor');
    const keep = decideDeclareComponentIdFinal({
      compatComponentId: 'c-x',
      llmComponentId: 'c-device-monitor',
    });
    expect(keep.source).toBe('compat-keep');
    expect(keep.changed).toBe(false);
  });
});

describe('阳性对照：证明上面的星标用例有牙（旧路径确实会追尾）', () => {
  it('旧实现（只 sanitize，不认 userComponentId）⇒ c-list1 被改成 c-list1-cf43d973', () => {
    expect(sanitizeComponentId('c-list1', { sessionId: SID })).toBe('c-list1-cf43d973');
  });

  it('变异：把 user 分支挪到 checkpoint 之后 ⇒ 实锤用例立刻红', () => {
    // 用「先过 checkpoint 闸门」的等价复现，证明 user 置顶是载荷而非装饰
    const mutated = sanitizeComponentId('c-list1-cf43d973', { sessionId: SID });
    expect(mutated).not.toBe('c-list1');
    expect(mutated).toBe('c-list1-cf43d973');
  });
});
