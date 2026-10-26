/**
 * plan-body-child-id-audit · P1-A（plan `body.children[].id` 一致性校验）单测
 * 2026-10-25 · mc-max-1792934367321-ab7bb76c 实锤
 *
 * 对照纪律：每条阳性判据必须配阴性，证明判据不是「见谁报谁」。
 * 本单真实取证（`.mc-gen/cache/debug-ai-response.txt` 即 LLM 原始 plan）：
 *   - `807:2` 的 3 个 body child 全是 `807:2`（真值 43:4869 / 43:4875 / 43:4878）
 *   - `807:3` 第 3 个 child = `807:3`（真值 43:4890），且 `43:4879` 被两个不同 name 复用
 *   - `43:4788` 的 body child 与内层 table-row 都复用 `43:4788`
 *   - `43:4893` 的 body children 塞进兄弟卡 `43:4898` / `43:4903`（⇒ 由上游
 *     `section-anchor-truth.js#auditSectionAnchors` 的 `anchor-not-ancestor` 认领，本模块**不做**）
 * 模块**只诊断不改数据**（理由见模块头注释）。
 */
import { auditPlanBodyChildIds, compactBodyChildIssues } from '../plan-body-child-id-audit.js';

/** section 构造器：body.children 是 LLM 自由发挥的产物 */
const sec = (id, bodyChildren, extra = {}) => ({
  id,
  type: 'container',
  body: { layout: 'vertical', children: bodyChildren },
  ...extra,
});

describe('auditPlanBodyChildIds · A1 self-reference', () => {
  it('阳性：body child 的 id 等于自身 section id ⇒ 命中', () => {
    const r = auditPlanBodyChildIds({
      sections: [
        sec('807:2', [
          { id: '807:2', name: '运行中图例' },
          { id: '807:2', name: '离线图例' },
          { id: '807:2', name: '查看详情链接' },
        ]),
      ],
    });
    expect(r.byCode['self-reference']).toBe(3);
    expect(r.bodySections).toBe(1);
    expect(r.evaluated).toBe(1);
  });

  it('阳性（一层深）：`43:4788` 的 body child 与 table-row 都复用父 id ⇒ 各计一条', () => {
    const r = auditPlanBodyChildIds({
      sections: [
        sec('43:4788', [
          {
            id: '43:4788',
            name: '表格区域',
            children: [{ type: 'table-header' }, { id: '43:4788', type: 'table-row' }],
          },
        ]),
      ],
    });
    expect(r.byCode['self-reference']).toBe(2);
    expect(r.entries).toBe(2);
  });

  it('阴性：body child 是自身后代（id 不同）⇒ 零命中', () => {
    const r = auditPlanBodyChildIds({
      sections: [
        sec('807:3', [
          { id: '43:4879', name: '标题装饰线' },
          { id: '43:4886', name: '菱形图标' },
          { id: '43:4890', name: '标题文字' },
        ]),
      ],
    });
    expect(r.byCode['self-reference']).toBe(0);
  });
});

describe('auditPlanBodyChildIds · A2 duplicate-sibling', () => {
  it('阳性：同 body 下同 id 但 name 不同 ⇒ 命中（至少一个 id 是错的）', () => {
    const r = auditPlanBodyChildIds({
      sections: [
        sec('807:3', [
          { id: '43:4879', name: '标题装饰线' },
          { id: '43:4879', name: '菱形图标' },
          { id: '43:4890', name: '标题文字' },
        ]),
      ],
    });
    expect(r.byCode['duplicate-sibling']).toBe(1);
    const dup = r.issues.find((i) => i.code === 'duplicate-sibling');
    expect(dup.childId).toBe('43:4879');
    expect(dup.occurrences).toBe(2);
    expect(dup.names.sort()).toEqual(['菱形图标', '标题装饰线'].sort());
  });

  it('阴性：同 id 且同名（LLM 复制同一模板项）⇒ 不报，避免噪声', () => {
    const r = auditPlanBodyChildIds({
      sections: [
        sec('807:2', [
          { id: '43:4878', name: '查看详情' },
          { id: '43:4878', name: '查看详情' },
        ]),
      ],
    });
    expect(r.byCode['duplicate-sibling']).toBe(0);
  });

  it('阴性：名字缺失（null）不构成「name 不同」⇒ 不报', () => {
    const r = auditPlanBodyChildIds({
      sections: [sec('807:2', [{ id: '43:4878' }, { id: '43:4878' }])],
    });
    expect(r.byCode['duplicate-sibling']).toBe(0);
  });
});

describe('auditPlanBodyChildIds · 锚点解析优先级（figmaAnchorId → figmaNodeId → id）', () => {
  it('`figmaAnchorId` 优先于 `id`：上游锚点守卫修复后按修好的锚点判定', () => {
    const r = auditPlanBodyChildIds({
      sections: [
        // 真值：LLM 写了 43:4893 当容器，上游守卫把它修到 43:4892
        sec('43:4893', [{ id: '43:4892', name: '卡片组容器' }], { figmaAnchorId: '43:4892' }),
      ],
    });
    expect(r.byCode['self-reference']).toBe(1);
    expect(r.issues[0].anchorId).toBe('43:4892');
  });

  it('`figmaAnchorId` 非法（合成段 id）⇒ 退回 `figmaNodeId`', () => {
    const r = auditPlanBodyChildIds({
      sections: [
        sec('43:4893-list', [{ id: '43:4893', name: '同步自引用' }], { figmaNodeId: '43:4893' }),
      ],
    });
    expect(r.byCode['self-reference']).toBe(1);
    expect(r.issues[0].anchorId).toBe('43:4893');
  });

  it('三个候选全非合法 Figma id ⇒ 锚点 null ⇒ A1 不判（零命中，不是假绿）', () => {
    const r = auditPlanBodyChildIds({
      sections: [sec('807:2-tail-text', [{ id: '807:2-tail-text', name: '尾巴' }])],
    });
    expect(r.bodySections).toBe(1);
    expect(r.byCode['self-reference']).toBe(0);
  });

  it('合成 id 条目（`-list` 后缀）不参与判定 ⇒ entries=0', () => {
    const r = auditPlanBodyChildIds({
      sections: [
        sec('43:4784', [
          { id: '43:4791-list', name: 'Frame 2136639914' },
          { id: '43:4812-list', name: '列表' },
        ]),
      ],
    });
    expect(r.entries).toBe(0);
    expect(r.byCode['self-reference']).toBe(0);
    expect(r.byCode['duplicate-sibling']).toBe(0);
  });
});

describe('auditPlanBodyChildIds · 健壮性与计数行', () => {
  it('空 sections ⇒ evaluated=0，不抛', () => {
    expect(auditPlanBodyChildIds({}).evaluated).toBe(0);
    expect(auditPlanBodyChildIds({ sections: null }).evaluated).toBe(0);
  });

  it('递归子树：嵌套 section 的 body.children 也被审计', () => {
    const r = auditPlanBodyChildIds({
      sections: [
        {
          id: '807:2',
          children: [sec('807:2', [{ id: '807:2', name: '子层自引用' }])],
        },
      ],
    });
    expect(r.evaluated).toBe(2);
    expect(r.byCode['self-reference']).toBe(1);
  });

  it('非数组 body.children 不参与（不计入 bodySections）', () => {
    const r = auditPlanBodyChildIds({
      sections: [{ id: '807:3', body: { children: 'oops' } }],
    });
    expect(r.bodySections).toBe(0);
    expect(r.issues).toHaveLength(0);
  });

  it('计数行齐备：evaluated / bodySections / entries / byCode', () => {
    const r = auditPlanBodyChildIds({
      sections: [sec('807:2', [{ id: '807:2', name: 'a' }]), { id: '43:4892' }],
    });
    expect(r).toMatchObject({ evaluated: 2, bodySections: 1, entries: 1 });
    expect(Object.keys(r.byCode).sort()).toEqual(['duplicate-sibling', 'self-reference']);
  });

  it('compactBodyChildIssues 只保留日志需要的字段并截断', () => {
    const r = auditPlanBodyChildIds({
      sections: [
        sec('807:2', [
          { id: '807:2', name: 'a' },
          { id: '807:2', name: 'b' },
        ]),
      ],
    });
    const compact = compactBodyChildIssues(r.issues, 1);
    expect(compact).toHaveLength(1);
    expect(Object.keys(compact[0])).not.toContain('message');
    expect(compact[0].sectionId).toBe('807:2');
  });
});
