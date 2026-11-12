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
  // 28→30（2026-11-09 归因）：`2bdfaab`（R9/R10 轮）在 pre-write-self-healing.js 新增两处
  // catch——⑥-b R9-b `catch (r9bErr)`（pass='runPreWriteSelfHealing:r9b'）与
  // ⑥-c R10 `catch (r10Err)`（pass='runPreWriteSelfHealing:r10'），两处均已接哨兵，
  // 但当日未同步本门禁 ⇒ 该套件自 2bdfaab 起一直是红的，而 R9/R10 轮只跑了「家族 spec」
  // 未跑全量基线 diff，因此没被发现（第二轮评审 P0-1 的实证）。
  // 30→31（2026-11-09 归因）：R9-c（横排子项定宽真值 heal，fe2acd21/54f523ac）在
  //   pre-write-self-healing.js 新增一处 fail-open catch（runPreWriteSelfHealing:r9c），
  //   已接 reportPatchChainError；本门禁按「登记+接哨兵」同步。
  // 31→32（2026-11-09 归因）：G1（零样式容器布局真值注入，669d8bf8）在
  //   pre-write-self-healing.js 新增 ⑥-d fail-open catch（runPreWriteSelfHealing:g1），
  //   已接 reportPatchChainError；基线同步 +1。
  // 35→36（2026-11-10 归因）：悬空引用占位兜底新增 `catch (err)`（pass='runPreWriteSelfHealing:dangling-import'，
  //   index.vue import 的 .vue 缺失 ⇒ 补占位 SFC 缺段降级，cf2742b9/ContentSection26 实锤）；已接哨兵，基线同步 +1。
  // 36→37（2026-11-12 归因）：自愈链新增 ③-b「段内 items 级多图标补位」
  //   （e35971ca 实锤：stats 段两张真值前景图只消费一张 ⇒ E2-v3 硬拒，两轮修复轮改不掉）。
  //   新增 `catch (err)` 接 reportPatchChainError（pass='runPreWriteSelfHealing:item-icon-bind'），
  //   基线同步 +1；判据见 utils/section-item-icon-bind.js 头注释。
  // 37→39（2026-11-12 归因）：C 层两刀（mc-1794428749650-cc6334 实锤）在自愈链新增两处
  //   fail-open catch，均已接 reportPatchChainError 哨兵：① pass='runPreWriteSelfHealing:grid-columns'
  //   （plan.gridColumns 确定性落地）；② pass='runPreWriteSelfHealing:sibling-row'
  //   （并排段主轴方向 row 包裹）。基线同步 +2；判据见 utils/layout-truth-healer.js 头注释。
  // 39→41（2026-11-12 归因）：刀 23/24（mc-max-1791439072481-07b4d2a5 实锤：FLEX-003
  //   跨文件 flex 冲突 + TECHSTACK-NOT-RENDERED）在自愈链⑫⑬新增两处 fail-open catch，
  //   均已接 reportPatchChainError 哨兵：
  //   ① pass='runPreWriteSelfHealing:1049'（⑫ 刀 23：剥 shared 侧重复布局声明，
  //      治 FLEX-003 跨文件类索引读到矛盾 flex 值）；
  //   ② pass='runPreWriteSelfHealing:1081'（⑬ 刀 24：techstack 契约履行占位注入，
  //      治 TECHSTACK-NOT-RENDERED）。
  //   两者均只报不改/降级不阻断 ⇒ 异常必须留哨兵（否则「未命中」与「异常」不可归因）；
  //   基线同步 +2。判据见 utils/style-dedup-guard.js / utils/techstack-tag-enforcer.js 头注释。
  { rel: 'src/ai-engine/utils/pre-write-self-healing.js', expectCatches: 41 },
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
  // 84→87（2026-11-10 归因）：F1a/F1b/F2 观测三 catch（方案 v4）——
  //   F1a 段树对账 `catch (_f1aErr)`（pass='execute:seg-tree-integrity'）、
  //   F2 R11-B 追踪比对 `catch (_r11bTraceErr)`（pass='execute:r11b-trace'）、
  //   F1b headerSlots 落地审计 `catch (_f1bErr)`（pass='execute:header-slot-audit'），
  //   三处均 reportOnly/fail-open、均已接 reportPatchChainError；基线同步 +3。
  // 87→88（2026-11-10 归因）：④headerSlots 落地——T09 终写前补跑新增
  //   `catch (_t09FinalErr)`（pass='execute:t09-final-ensure'，chunk 层注入被 execute
  //   后段覆写冲掉的确定性兜底，设备 1d9bcc28 实锤）；已接哨兵，基线同步 +1。
  // 88→89（2026-11-12 归因）：刀 66 ISO-PROBE 入参指纹（mc/max）新增 1 处
  //   `catch (_isoProbeErr)`（pass='generateCode:iso-probe'）；探针只读、不参与决策，
  //   异常也必须留哨兵（否则 0 命中时再次不可归因）；已接 reportPatchChainError，基线同步 +1。
  // 89→90（2026-11-12 归因）：#19 同段交互接管（mc-max-1794456460380-1efe65a2 实锤，装配层覆盖
  //   丢弃 LLM 交互段组件 ⇒ 产物零 @click）在 `_applyDeterministicIndexTemplate` 接线处新增 1 处
  //   `catch (tkErr)`（pass='generateCode:#19-takeover'）——接管保产物写盘异常时回退 LLM 重生成路径，
  //   异常必须留哨兵（否则「接管 0 命中」与「接管异常」不可归因）；已接 reportPatchChainError，基线同步 +1。
  // 90→91（2026-11-12 归因）：panelKey 写盘兜底（mc-max-1790693261187-3426d7c3 实锤：
  //   aio-panel 产物仍是 <base-panel panelKey="default-panel">）新增 1 处
  //   `catch (_peErr)`（pass='writeFiles:5341'）——enforcePanelKeyInFiles
  //   替换异常时**非致命**（沿用原 files 继续写盘）；异常必须留哨兵（否则「未触发兜底」
  //   与「兜底执行但异常」不可归因）；已接 reportPatchChainError，基线同步 +1。
  { rel: 'src/ai-engine/roles/microcode-engineer.js', expectCatches: 91 },  // 25→26（2026-11-11 归因）：根因 G 第四道缺口——vue3 链路此前**从不**执行运行时标识符兜底
  //   （`validateAndFixGeneratedFiles` 只在 microcode-engineer 上），实测 `<script setup>` 顶层引用
  //   未声明 `runtimeBuilder` ⇒ onMounted ReferenceError ⇒ 白屏。治理落点 writeFiles 之前新增
  //   `catch (e)`（pass='execute:runtime-idents'），接 neutralizeFilesRuntimeIdents 异常；
  //   已接 reportPatchChainError（哨兵齐备，非裸吞），基线同步 +1。
  // 26→30（2026-11-12 归因）：刀 66-P2 vue3/max 同构段收敛接线新增 4 处 catch，
  //   全部接 reportPatchChainError（哨兵齐备，非裸吞），基线同步 +4：
  //   ① generateCode:iso-eval-vue3（同构评估）② generateCode:iso-plan-vue3（组→文件映射，失败即清空计划）
  //   ③ generateCode:iso-wrapper-vue3（薄包装写入，失败回退独立 chunk）④ generateCode:iso-index-vue3（index v-for 收编）
  // 30→31（2026-11-12 归因）：刀 66 ISO-PROBE 入参指纹（vue3/max）新增 1 处
  //   `catch (_isoProbeErr)`（pass='generateCode:iso-probe-vue3'）；与 mc/max 对称，
  //   已接 reportPatchChainError（哨兵齐备，非裸吞），基线同步 +1。
  { rel: 'src/ai-engine/roles/vue3-engineer.js', expectCatches: 31 },
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
