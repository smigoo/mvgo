/**
 * 🛡️ 2026-11-11 · 「非声明残留行」自愈与判据（阳性 / 阴性对照）
 *
 * 事故背景（真机 464 个含样式产物中 16 个不可编译，3.4%）：
 *   · `}============== 左侧垂直 Tab ============`（横幅注释丢 `//` 后与 `}` 粘连）
 *   · `</style>` 混进独立 .less
 *   · 悬空声明 `color:`（分块输出被截断的残片）
 *   · 根级裸属性 `color: @color-bg-container;`
 *   · 值内嵌套声明 `font-size: calc( color: line-height: 16px);`
 *   · 模型「回答正文」被追加到样式文件尾部
 * 既有 `healLessSource` 与 `scanStandaloneLessDefects`(001-007) 对这些**全部透明**，
 * `gateStandaloneLessWrite` 返回 ok:true（假绿）⇒ 坏文本落盘 ⇒ 预览红卡。
 *
 * 本 spec 钉住：
 *   ① 六类形态必须被确定性修好（阳性）；
 *   ② 合法多行值 / 合法旧语法 / 自定义属性**不得**被误删（阴性，防把手写正确的东西删掉）；
 *   ③ 未修好的形态必须被 scan 判出来（不再假绿）。
 */
import { gateStandaloneLessWrite, healStrayLessArtifacts, healLessFull, scanStandaloneLessDefects } from './less-compile-gate.js';

const IDS = (src: string) => scanStandaloneLessDefects(src).map((d) => d.id);

describe('healStrayLessArtifacts（非声明残留行清理）', () => {
  it('阳性：横幅残片 `}====` ⇒ 保留 `}` 并把残串转块注释', () => {
    const src = `.c-a {
  color: #fff;
}============== 左侧垂直 Tab ====================

.c-b {
  color: #000;
}
`;
    const out = healStrayLessArtifacts(src, { sourceType: 'style' });
    expect(out.changed).toBe(true);
    expect(out.keptBraces).toBe(1);
    // `}` 必须保留（否则块结构被破坏），残串必须被注释掉
    expect(out.source).toContain('} /*============== 左侧垂直 Tab ==================== */');
    // 编译级证明：作为 LESS 至少不再出现裸 `=`
    expect(gateStandaloneLessWrite(out.source).ok).toBe(true);
  });

  it('阳性：`</style>` 混入 .less 与裸 `undefined` 行被删除', () => {
    const src = `.c-a {
  color: #fff;
}
</style>
undefined
`;
    const out = healStrayLessArtifacts(src, { sourceType: 'style' });
    expect(out.removedLines).toBe(2);
    expect(out.source).not.toContain('</style>');
    expect(out.source).not.toContain('undefined');
  });

  it('阳性：悬空声明 `color:`（截断残片）被删除', () => {
    const src = `.c-a {
  color: #fff;
  color: 

/* ===== [样式补缺] 缺失类定向补齐 ===== */

.c-b {
  height: 100%;
}
`;
    const out = healStrayLessArtifacts(src, { sourceType: 'style' });
    expect(out.removedLines).toBe(1);
    expect(out.source).not.toMatch(/^\s*color:\s*$/m);
  });

  it('阳性：根级裸属性被删除', () => {
    const src = `.c-a { color: #fff; }

color: @color-bg-container;

.c-b { height: 100%; }
`;
    const out = healStrayLessArtifacts(src, { sourceType: 'style' });
    expect(out.removedLines).toBe(1);
    expect(out.source).not.toContain('@color-bg-container');
  });

  it('阳性：值内嵌套声明 `calc( color: line-height: 16px)` 整条被删除', () => {
    const src = `.c-a {
  font-size: calc( color: line-height: 16px);
  white-space: nowrap;
}
`;
    const out = healStrayLessArtifacts(src, { sourceType: 'style' });
    expect(out.removedLines).toBe(1);
    expect(out.source).not.toContain('calc( color:');
    expect(out.source).toContain('white-space: nowrap;');
  });

  it('阳性：文件尾部「模型回答正文」被裁剪，但真实语句保留', () => {
    const src = `.theme-light();

已生成环境监测组件的样式文件，严格遵循以下规范：
**✅ 命名规范**
- 所有 class 使用 \`.c-环境监测-\` 前缀
`;
    const healed = healLessFull(src, { sourceType: 'style' });
    expect(healed.changed).toBe(true);
    expect(healed.source).toContain('.theme-light();');
    expect(healed.source).not.toContain('已生成环境监测组件');
  });

  it('阴性：合法多行值 `grid-template-areas:` 不得被当成悬空声明删除', () => {
    const src = `.c-grid {
  grid-template-areas:
    "head head"
    "side main";
}
`;
    const out = healStrayLessArtifacts(src, { sourceType: 'style' });
    expect(out.changed).toBe(false);
    expect(out.source).toContain('grid-template-areas:');
  });

  it('阴性：合法旧语法 `filter: progid:...gradient(...)` 不得被判成嵌套声明', () => {
    const src = `.c-a {
  filter: progid:DXImageTransform.Microsoft.gradient(startColorstr='#fff', endColorstr='#000');
}
`;
    const out = healStrayLessArtifacts(src, { sourceType: 'style' });
    expect(out.changed).toBe(false);
    expect(IDS(src)).toEqual([]);
  });

  it('阴性：根级自定义属性 `--x: v;` 不得被删除（承载主题色板，删了会静默丢主题）', () => {
    const src = `--em-bg-color: #edf4fb;
--em-text-primary: #333333;
`;
    const out = healStrayLessArtifacts(src, { sourceType: 'style' });
    expect(out.changed).toBe(false);
    expect(out.source).toContain('--em-bg-color');
    // 但它确实是非法根级声明 ⇒ scan 必须报出来（诚实暴露，而不是删掉装没事）
    expect(IDS(src)).toContain('LESS-WRITE-007');
  });

  it('阴性：健康样式零副作用', () => {
    const src = `.c-a {
  display: flex;
  color: #fff;
}
`;
    const out = healStrayLessArtifacts(src, { sourceType: 'style' });
    expect(out.changed).toBe(false);
    expect(out.source).toBe(src);
  });
});

describe('scanStandaloneLessDefects（不再假绿）', () => {
  const CASES: Array<[string, string, string]> = [
    ['LESS-WRITE-008', '横幅残片', '}============== 标题 ==========\n.c-a { color: #fff; }\n'],
    ['LESS-WRITE-009', '混入标签', '.c-a { color: #fff; }\n</style>\n'],
    ['LESS-WRITE-009', '裸 undefined', '.c-a { color: #fff; }\nundefined\n'],
    ['LESS-WRITE-010', '悬空声明', '.c-a { color: #fff; }\ncolor:\n\n.c-b { height: 1px; }\n'],
    ['LESS-WRITE-011', '值内嵌套声明', '.c-a {\n  font-size: calc( color: line-height: 16px);\n}\n'],
  ];

  it.each(CASES)('%s 必须被 scan 判出（%s）', (id, _name, src) => {
    expect(IDS(src)).toContain(id);
  });

  it('合法内容不产生任何缺陷（阴性）', () => {
    const src = `.c-a {
  display: flex;
  color: #fff;
}
`;
    expect(IDS(src)).toEqual([]);
  });
});

describe('gateStandaloneLessWrite（写盘门禁）', () => {
  it('六类形态合并的坏文本：修复后 ok=true 且修复项可审计', () => {
    const src = `.c-a {
  color: #fff;
}============== 左侧垂直 Tab ====================

color: @color-bg-container;

.c-b {
  font-size: calc( color: line-height: 16px);
  height: 100%;
}
</style>
`;
    const out = gateStandaloneLessWrite(src, 'resources/styles/common.less');
    expect(out.ok).toBe(true);
    expect(out.fixes.length).toBeGreaterThan(0);
    expect(out.content).not.toContain('</style>');
    expect(out.content).not.toContain('calc( color:');
  });

  it('不可修复形态（根级自定义属性）必须 ok=false，不得假绿放行', () => {
    const src = `--em-bg-color: #edf4fb;
`;
    const out = gateStandaloneLessWrite(src, 'resources/styles/themes/theme-vars.less');
    expect(out.ok).toBe(false);
    expect(out.defects.map((d: any) => d.id)).toContain('LESS-WRITE-007');
  });
});
