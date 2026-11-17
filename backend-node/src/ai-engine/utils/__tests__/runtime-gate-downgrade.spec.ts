/**
 * 🛡️ 2026-11-17 门禁二次评审 P0-2/P0-3：RUNTIME-018 / RUNTIME-013 降级契约防回退
 *
 * 背景：11-16 评审建议 018 降 WARN、013 放宽 static-fallback，但一直未落地。
 * 落地时若只把 id 从 RUNTIME_BLOCK_IDS 移出、不改 emit 的 severity，会掉进
 * classifyRuntimeGate 的 fallback（severity==='BLOCK' ⇒ action:'fail'）⇒ 降级无效且更隐蔽。
 * VISUAL-002（2026-11-05 C2）已有同一教训（screenshot-renderer.js:81-88）。
 *
 * 本 spec 沿用本仓惯例（screenshot-renderer 带 Puppeteer 重依赖，direct import 会挂）：
 * 只读源码文本，不加载依赖；剥离整行注释后断言可执行代码，避免注释里的旧符号造成假阳性。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RENDERER = readFileSync(
  join(__dirname, '../../roles/screenshot-renderer.js'),
  'utf8',
);
const CLASSIFIER = readFileSync(
  join(__dirname, '../runtime-error-classifier.js'),
  'utf8',
);
const PHASE2 = readFileSync(
  join(__dirname, '../../graphs/mc-component-graph-phase2.js'),
  'utf8',
);
/** 只留可执行代码（剥离整行 // 注释），避免注释里提到的旧 id 干扰断言 */
const code = (src: string) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const RENDERER_CODE = code(RENDERER);
const CLASSIFIER_CODE = code(CLASSIFIER);
const PHASE2_CODE = code(PHASE2);

/** 截取 `const NAME = new Set([...])` 块 */
function setBlock(src: string, name: string): string {
  const start = src.indexOf(`const ${name} = new Set([`);
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('])', start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('P0-2 RUNTIME-018 降级契约（标题几何欠佳 → incremental/WARN）', () => {
  const blockIds = setBlock(RENDERER_CODE, 'RUNTIME_BLOCK_IDS');
  const incIds = setBlock(RENDERER_CODE, 'RUNTIME_INCREMENTAL_IDS');

  it('阳性：018 已移出 BLOCK 集合', () => {
    expect(blockIds).not.toContain("'RUNTIME-018'");
  });

  it('阳性：018 已加入 INCREMENTAL 集合', () => {
    expect(incIds).toContain("'RUNTIME-018'");
  });

  it('阳性：018 emit 走 addWarn（severity WARN），不再用写死 BLOCK 的 addBlock', () => {
    // 精确匹配 emit 调用形态（多行：addWarn(\n  'RUNTIME-018',），避免命中集合定义里的 id
    expect(RENDERER_CODE).toMatch(/addWarn\(\s*\n\s*'RUNTIME-018',/);
    expect(RENDERER_CODE).not.toMatch(/addBlock\(\s*\n\s*'RUNTIME-018',/);
  });

  it('防回退：renderViaPreviewPage 存在 addWarn helper 且写 severity WARN', () => {
    expect(RENDERER_CODE).toMatch(/const addWarn = \(id, category, message, evidence = \{\}\) => \{/);
    expect(RENDERER_CODE).toMatch(/issues\.push\(\{ id, severity: 'WARN', category, message, evidence \}\)/);
  });
});

describe('P0-3 RUNTIME-013 降级契约（static-fallback → incremental/WARN）', () => {
  const blockIds = setBlock(RENDERER_CODE, 'RUNTIME_BLOCK_IDS');
  const incIds = setBlock(RENDERER_CODE, 'RUNTIME_INCREMENTAL_IDS');
  const defectIds = setBlock(CLASSIFIER_CODE, 'PRODUCT_DEFECT_RUNTIME_IDS');

  it('阳性：013 三处同步移出/降级（BLOCK 集合 / PRODUCT_DEFECT），并加入 INCREMENTAL', () => {
    expect(blockIds).not.toContain("'RUNTIME-013'");
    expect(defectIds).not.toContain("'RUNTIME-013'");
    expect(incIds).toContain("'RUNTIME-013'");
  });

  it('阳性：013 emit 的 status + severity 均为 WARN（phase2.js:6769 不再按 BLOCK 阻断）', () => {
    const emitAt = RENDERER_CODE.indexOf("id: 'RUNTIME-013',");
    expect(emitAt).toBeGreaterThan(-1);
    const slice = RENDERER_CODE.slice(emitAt - 200, emitAt + 400);
    expect(slice).toMatch(/status: 'WARN'/);
    expect(slice).toMatch(/severity: 'WARN'/);
    expect(slice).toMatch(/warning: \{/);
  });
});

describe('P0-2 边界：RUNTIME-017 不受 018 降级影响', () => {
  it('017 仍在 BLOCK 集合、emit 仍用 addBlock（独立判据、独立 emit）', () => {
    const blockIds = setBlock(RENDERER_CODE, 'RUNTIME_BLOCK_IDS');
    expect(blockIds).toContain("'RUNTIME-017'");
    expect(RENDERER_CODE).toMatch(/addBlock\(\s*\n\s*'RUNTIME-017',/);
  });
});

describe('2026-11-17 用户授权 RUNTIME-016 降级（文本重叠 → incremental/WARN）', () => {
  const blockIds = setBlock(RENDERER_CODE, 'RUNTIME_BLOCK_IDS');
  const incIds = setBlock(RENDERER_CODE, 'RUNTIME_INCREMENTAL_IDS');

  it('阳性：016 已移出 BLOCK 集合', () => {
    expect(blockIds).not.toContain("'RUNTIME-016'");
  });

  it('阳性：016 已加入 INCREMENTAL 集合', () => {
    expect(incIds).toContain("'RUNTIME-016'");
  });

  it('阳性：016 emit 走 addWarn（severity WARN），不再用写死 BLOCK 的 addBlock', () => {
    // 016 emit 是单行形态：addWarn('RUNTIME-016', 'text-overlap', ...)
    expect(RENDERER_CODE).toMatch(/addWarn\('RUNTIME-016', 'text-overlap'/);
    expect(RENDERER_CODE).not.toMatch(/addBlock\('RUNTIME-016'/);
  });

  it('防回退：判据仍检出（text-overlap category + collectTextOverlaps 保留），不是删规则', () => {
    const emitAt = RENDERER_CODE.indexOf("addWarn('RUNTIME-016', 'text-overlap'");
    expect(emitAt).toBeGreaterThan(-1);
    const slice = RENDERER_CODE.slice(emitAt, emitAt + 400);
    expect(slice).toMatch(/overlaps:/);
    expect(RENDERER_CODE).toMatch(/collectTextOverlaps\(previewState\.textNodes\)/);
  });

  it('🔴 关键防回退：phase2 textOverlapBlocked 必须认 severity===BLOCK（否则 WARN 仍 fail-closed）', () => {
    // 旧写法只认 id ⇒ WARN 的 016 仍被判 blocked ⇒ 白烧 3 轮 D2 + fail-closed。
    // 这是本次降级唯一「改了 emit/集合但降级仍无效」的隐藏陷阱，必须锁死。
    const m = PHASE2_CODE.match(/const textOverlapBlocked = \(runtimeGate\?\.issues \|\| \[\]\)\.some\([\s\S]{0,160}?\);/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/i\.id === 'RUNTIME-016'/);
    expect(m[0]).toMatch(/i\.severity === 'BLOCK'/);
  });

  it('边界：真白屏类硬 BLOCK 未受降级影响（006/012 仍在 BLOCK 集合，012 在 PRODUCT_DEFECT）', () => {
    expect(blockIds).toContain("'RUNTIME-006'");
    expect(blockIds).toContain("'RUNTIME-012'");
    const defectIds = setBlock(CLASSIFIER_CODE, 'PRODUCT_DEFECT_RUNTIME_IDS');
    expect(defectIds).toContain("'RUNTIME-012'");
  });
});
