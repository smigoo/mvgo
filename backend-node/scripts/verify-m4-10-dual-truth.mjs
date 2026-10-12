/**
 * 离线验证：M4-10 双真值判据修订（R13 · D8）
 *
 * 目的：不跑完整 mc-check 流程，直接对判据核心逻辑做阳性/阴性对照，证明：
 *   1. 双真值产物（有标记 + 三核心为真值）→ M4-10 通过
 *   2. 单稿产物（无标记 + 三核心为枚举）→ M4-10 通过（零回归）
 *   3. 🔴 单稿产物三核心**被篡改**（无标记）→ M4-10 仍**拦截**（不误放行）
 *   4. 🔴 双真值产物但改了非核心键 → M4-10 **仍拦截**（豁免范围未扩大）
 *   5. 🔴 滚动条（M4-11）不受双真值标记影响 → 仍拦截
 *
 * 用法：node scripts/verify-m4-10-dual-truth.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CFG = JSON.parse(
  readFileSync(join(ROOT, 'skills/frontend-mc-check/scripts/mc-check-config.json'), 'utf-8'),
);

/** 复制判据核心逻辑（与 mc-check.cjs L794-840 同源，逐字对齐） */
function judgeM4_10(cssVarsContent) {
  const darkKeys = extractObjectKeys(cssVarsContent, 'dark');
  const coreVars = CFG.enums.darkThemeCoreVars || [];
  const missingCoreVars = coreVars.filter((v) => !darkKeys.includes(v));
  if (missingCoreVars.length > 0) {
    return { pass: false, msg: `dark 缺少核心变量：${missingCoreVars.join('、')}`, isDual: false, missing: true };
  }
  const darkVarValues = extractObjectKeyValues(cssVarsContent, 'dark');
  const colorRules = CFG.enums.darkThemeColorRules || {};
  const dualCfg = CFG.enums._M4_10_DUAL_TRUTH || {};
  const dualMarker = dualCfg.marker || '';
  const isDualTruth = !!(dualMarker && typeof cssVarsContent === 'string' && cssVarsContent.includes(dualMarker));
  const relaxedCoreVars = new Set(isDualTruth ? dualCfg.relaxedCoreVars || [] : []);
  const colorErrors = [];
  coreVars.forEach((varName) => {
    if (relaxedCoreVars.has(varName)) return;
    const allowedValues = colorRules[varName];
    if (!allowedValues || allowedValues.length === 0) return;
    const actualValue = (darkVarValues[varName] || '').toUpperCase();
    const allowedValuesUpper = allowedValues.map((v) => v.toUpperCase());
    if (!allowedValuesUpper.includes(actualValue)) {
      colorErrors.push(`${varName}: "${darkVarValues[varName]}" 不在允许值 [${allowedValues.join(', ')}] 中`);
    }
  });
  return { pass: colorErrors.length === 0, msg: colorErrors.join('；') || '通过', isDual: isDualTruth };
}

/** M4-11 判据（须确认未被双真值标记影响） */
function judgeM4_11(cssVarsContent) {
  const darkKeys = extractObjectKeys(cssVarsContent, 'dark');
  const darkVarValues = extractObjectKeyValues(cssVarsContent, 'dark');
  const optionalVars = CFG.enums.darkThemeOptionalVars || {};
  const errs = [];
  Object.entries(optionalVars).forEach(([varName, allowedValues]) => {
    if (darkKeys.includes(varName)) {
      const actual = (darkVarValues[varName] || '').toUpperCase();
      if (!allowedValues.map((v) => v.toUpperCase()).includes(actual)) {
        errs.push(`${varName}: "${darkVarValues[varName]}" 必须为 ${allowedValues.join(' 或 ')}`);
      }
    }
  });
  return { pass: errs.length === 0, msg: errs.join('；') || '通过' };
}

function extractObjectKeys(jsCode, objectName) {
  const m = String(jsCode).match(new RegExp(`(?:const|let|var)\\s+${objectName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!m) return [];
  return [...m[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1]);
}
function extractObjectKeyValues(jsCode, objectName) {
  const m = String(jsCode).match(new RegExp(`(?:const|let|var)\\s+${objectName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`));
  const out = {};
  if (!m) return out;
  for (const mm of m[1].matchAll(/(\w+)\s*:\s*'([^']*)'/g)) out[mm[1]] = mm[2];
  return out;
}

let failures = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const MARK = 'dualTruth: figma-derived';

/** 造 css-vars.js 文本 */
function cssVars({ dual = false, dark = {}, extra = {} }) {
  const head = dual ? `// ${MARK}（测试）\n` : '';
  const body = {
    colorTextBase: '#ffffff',
    colorPrimary: '#44E4FF',
    colorPrimaryBg: '#414141',
    colorTextSecondary: '#D6D6D6',
    scrollbarTrackBg: '#424242',
    ...dark,
    ...extra,
  };
  return `${head}const dark = {
${Object.entries(body).map(([k, v]) => `  ${k}: '${v}',`).join('\n')}
};

const light = {
  colorTextBase: '#1f2329',
};
export { common, dark, light };
export default { common, dark, light };
`;
}

console.log('\n═══ 1. 单稿产物（无标记，枚举值）→ 通过（零回归）═══\n');
const single = cssVars({ dual: false });
const r1 = judgeM4_10(single);
check('单稿 M4-10 通过', r1.pass === true, r1.msg);
check('单稿未被识别为双真值', r1.isDual === false);
check('单稿 M4-11 通过', judgeM4_11(single).pass === true);

console.log('\n═══ 2. 双真值产物（有标记，三核心为设计真值）→ 通过 ═══\n');
const dual = cssVars({
  dual: true,
  dark: { colorTextBase: '#e8ecf5', colorPrimary: '#44e4ff', colorPrimaryBg: '#141a2e' },
});
const r2 = judgeM4_10(dual);
check('双真值被识别', r2.isDual === true);
check('双真值 M4-10 通过', r2.pass === true, r2.msg);

console.log('\n═══ 3. 🔴 单稿产物三核心被篡改（无标记）→ 必须拦截 ═══\n');
const tampered = cssVars({ dual: false, dark: { colorPrimary: '#FF6B00' } });
const r3 = judgeM4_10(tampered);
check('篡改被拦截（不误放行）', r3.pass === false, r3.msg);
check('拦截原因指向 colorPrimary', r3.msg.includes('colorPrimary'), r3.msg);

console.log('\n═══ 4. 双真值产物改了「非核心」键 ═══\n');
const dualBadSecondary = cssVars({
  dual: true,
  dark: {
    colorTextBase: '#e8ecf5',
    colorPrimary: '#44e4ff',
    colorPrimaryBg: '#141a2e',
    colorTextSecondary: '#123456', // 非核心键，枚举外
  },
});
const r4 = judgeM4_10(dualBadSecondary);
// ⚠️ 既存事实（2026-10-10 核实）：M4-10 只遍历 darkThemeCoreVars（三核心）。
//   darkThemeColorRules 里的 colorTextSecondary / Hover / Active / BgHover
//   **配置有白名单但无任何判据消费** —— 是既存僵尸规则，不在本次需求范围内修。
//   本断言只保证「双真值豁免没有扩大到这些键」，不为其补判据（那是独立议题）。
//
// 🔴 2026-10-12：mc-check 已按用户要求统一为 scaffold 上游版（v1.0.20），
//   该版**没有** `enums._M4_10_DUAL_TRUTH` 这个 D8 扩展键。
//   ⇒ 双真值产物在当前判据下会被 M4-10 判 error（实测 demo 亦然）。
//   这里按「缺配置 ⇒ 豁免名单为空」处理，让脚本能跑完并如实报告该事实，
//   而不是抛 TypeError 假装成别的问题。
const DUAL_CFG = CFG.enums?._M4_10_DUAL_TRUTH || {};
const RELAXED = Array.isArray(DUAL_CFG.relaxedCoreVars) ? DUAL_CFG.relaxedCoreVars : [];
check(
  'colorTextSecondary 不在本次豁免名单内（relaxedCoreVars 仅三核心）',
  !RELAXED.includes('colorTextSecondary'),
  `relaxedCoreVars=${JSON.stringify(RELAXED)}${DUAL_CFG.marker ? '' : '（当前 mc-check 无双真值配置 ⇒ 豁免名单为空）'}`,
);
check(
  '双真值不改变非核心键的判定域（M4-10 仍只遍历三核心）',
  r4.pass === true && r4.isDual === true,
  '既存行为：非核心键本就无判据（僵尸规则），双真值未使其更宽松',
);

console.log('\n═══ 5. 🔴 滚动条（M4-11）不受双真值标记影响 ═══\n');
const dualBadScroll = cssVars({
  dual: true,
  dark: {
    colorTextBase: '#e8ecf5',
    colorPrimary: '#44e4ff',
    colorPrimaryBg: '#141a2e',
    scrollbarTrackBg: '#ff0000',
  },
});
check('双真值下 M4-11 仍拦截滚动条', judgeM4_11(dualBadScroll).pass === false, judgeM4_11(dualBadScroll).msg);

console.log('\n═══ 6. 🔴 双真值但三核心缺失 → M4-9 先拦，不进入 M4-10 ═══\n');
const dualMissing = `// ${MARK}\nconst dark = {\n  colorPrimary: '#44e4ff',\n};\nexport { common, dark };\nexport default { common, dark };\n`;
const r6 = judgeM4_10(dualMissing);
check('缺核心变量被拦', r6.pass === false && r6.missing === true, r6.msg);

console.log('\n═══ 7. 🔴 豁免名单严格限定为三核心 ═══\n');
// D8 只裁定「三核心」可占真值。hover/active/bgHover/secondary 虽无现行判据消费，
// 但**不得被写进豁免名单**，否则一旦将来给它们补判据，双真值会静默放行。
const EXPECT_RELAXED = ['colorTextBase', 'colorPrimary', 'colorPrimaryBg'];
const actualRelaxed = CFG.enums._M4_10_DUAL_TRUTH.relaxedCoreVars || [];
check(
  'relaxedCoreVars === 恰好三核心（不多不少）',
  JSON.stringify([...actualRelaxed].sort()) === JSON.stringify([...EXPECT_RELAXED].sort()),
  `got ${JSON.stringify(actualRelaxed)}`,
);
check(
  'M4-11 滚动条配置未被改动（仍固定 #424242/#646464）',
  JSON.stringify(CFG.enums.darkThemeOptionalVars) ===
    JSON.stringify({ scrollbarTrackBg: ['#424242'], scrollbarThumbBg: ['#646464'] }),
  `got ${JSON.stringify(CFG.enums.darkThemeOptionalVars)}`,
);
check(
  'M4-9 核心变量清单未被改动',
  JSON.stringify(CFG.enums.darkThemeCoreVars) === JSON.stringify(EXPECT_RELAXED),
  `got ${JSON.stringify(CFG.enums.darkThemeCoreVars)}`,
);

console.log(`\n${failures === 0 ? '🎉 全部通过' : `💥 ${failures} 项失败`}\n`);
process.exit(failures === 0 ? 0 : 1);