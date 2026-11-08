/**
 * 🛡️ PATCH-CHAIN-ERROR 覆盖门禁（2026-11-03 S0.2 配套）
 *
 * 断言三个后处理链文件中的**每个 catch 块**都接入了 reportPatchChainError。
 * 新增 catch 未接入 ⇒ 本套件失败 —— 这是总纲 §4-6「新守卫入库门禁」的技术兜底之一
 * （计数口径：AST CatchClause 数，非 grep「catch」词数——后者含 .catch() Promise 链与注释）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@babel/parser';

const ROOT = process.cwd();
const FILES = [
  { rel: 'src/ai-engine/utils/pre-write-self-healing.js', expectCatches: 28 },
  // 67→68（2026-11-05 归因）：6b0d14b 之后某提交新增 G11a `catch (bgErr)`
  // （microcode-engineer.js:3110，背景 fallback 注入），当日未同步本门禁；
  // 已补接哨兵（S0.2 核对唯一漏网点），基线同步 +1。
  // 68→76（2026-11-06 归因，两次合并计数）：
  //   68→75：刀72-B（顶层并列同构段折叠）在 collapser 接入后于本文件新增 7 处 catch，
  //          当日未同步本门禁（该套件在本轮改动前即已失败，非本轮引入）。
  //   75→76：刀66-C「index 段级 v-for 改写」新增 `catch (_isoIdxErr)`
  //          （generateCode 内、包装写入之后），已接哨兵 pass='generateCode:iso-index'。
  // 78→80（2026-11-06 归因）：90eae287 内部子组件 props 契约注入新增 2 处 catch
  // （`catch (_insErr)` 接哨兵 pass=execute:chart-props；`catch (_chkErr)` 为同文件回滚兜底，
  //  同块内已由外层哨兵覆盖，计数 +2）。
  // 77→78（2026-11-06 归因）：a9364bd4 样式补缺新增 `catch (err)`（_completeMissingStyleClasses），
  // 已接 reportPatchChainError 哨兵（pass='generateCode:style-complete'）。
  // 76→77（2026-11-06 归因）：8cfbd218 属性内插值归一新增
  // `catch (_attrInterpErr)`（execute 落盘前出口），已接 reportPatchChainError
  // 哨兵（pass='execute:attr-interp'）；基线同步 +1。
  // 80→81（2026-11-08 归因）：402679ed 子组件覆盖度校验新增 `catch (e)`
  // （writeFiles 写盘唯一出口），已接 reportPatchChainError 哨兵
  // （pass='writeFiles:subcomponent-coverage'）；判据见 microcode/subcomponent-coverage.js。
  // R2（2026-11-08）：新增 readComponentVueFiles 两处读盘兜底 catch（均已接哨兵）→ 81→83
  { rel: 'src/ai-engine/roles/microcode-engineer.js', expectCatches: 83 },
  { rel: 'src/ai-engine/roles/vue3-engineer.js', expectCatches: 25 },
];

function walk(node: any, cb: (n: any) => void) {
  if (!node || typeof node.type !== 'string') return;
  cb(node);
  for (const key of Object.keys(node)) {
    if (
      key === 'loc' || key === 'start' || key === 'end' || key === 'extra' ||
      key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments'
    ) continue;
    const val = (node as any)[key];
    if (Array.isArray(val)) {
      for (const v of val) if (v && typeof v.type === 'string') walk(v, cb);
    } else if (val && typeof val.type === 'string') {
      walk(val, cb);
    }
  }
}

function bodyCallsReporter(catchNode: any): boolean {
  let found = false;
  walk(catchNode.body, (n) => {
    if (
      n.type === 'CallExpression' &&
      n.callee?.type === 'Identifier' &&
      n.callee.name === 'reportPatchChainError'
    ) {
      found = true;
    }
  });
  return found;
}

describe('PATCH-CHAIN-ERROR 覆盖门禁（每个 catch 必接哨兵）', () => {
  for (const { rel, expectCatches } of FILES) {
    it(`${rel}：${expectCatches} 处 catch 全部接入 reportPatchChainError`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      const ast = parse(src, {
        sourceType: 'module',
        errorRecovery: true,
        allowReturnOutsideFunction: true,
        plugins: [
          'classProperties',
          'classPrivateProperties',
          'classPrivateMethods',
          'objectRestSpread',
          'asyncGenerators',
          'dynamicImport',
          'topLevelAwait',
          'optionalCatchBinding',
        ],
      });
      const catches: any[] = [];
      walk(ast.program, (n) => {
        if (n.type === 'CatchClause') catches.push(n);
      });
      // catch 数只能随「登记+接哨兵」增长；减少须同步更新本门禁（并在 memory 归因）
      expect(catches.length).toBe(expectCatches);
      const missing = catches.filter((c) => !bodyCallsReporter(c));
      expect(
        missing.map((c) => `${rel}:${c.loc.start.line}`),
      ).toEqual([]);
    });
  }
});
