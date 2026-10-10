/**
 * 离线验证：双主题评分聚合（R10）
 *
 * 目的：不调 LLM、不渲截图，纯函数级证明
 *   1. 分数归一化（0-1 小数 与 0-100 整数两种口径混用不失真）
 *   2. 平均分 + 最低分 + 分主题明细
 *   3. 🔴 平均分掩盖单侧灾难时仍标记 needsReview
 *   4. 缺一侧报告时降级而非报错
 *   5. attachDualThemeScores 保持既有单主题报告结构向后兼容
 *
 * 用法：node scripts/verify-dual-truth-score.mjs
 */
import {
  aggregateDualThemeScores,
  normalizeThemeScore,
  attachDualThemeScores,
} from '../src/ai-engine/utils/dual-truth-score.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const rpt = (score, issues = []) => ({ overallSimilarity: score, issues });

console.log('\n═══ 1. 分数归一化（两种口径混用）═══\n');
check('0.92 小数 → 92', normalizeThemeScore(rpt(0.92)).score === 92, `got ${normalizeThemeScore(rpt(0.92)).score}`);
check('92 整数 → 92', normalizeThemeScore(rpt(92)).score === 92);
check('0 保持 0（不被当成小数放大）', normalizeThemeScore(rpt(0)).score === 0, `got ${normalizeThemeScore(rpt(0)).score}`);
check('1 → 1（边界不当小数）', normalizeThemeScore(rpt(1)).score === 1, `got ${normalizeThemeScore(rpt(1)).score}`);
check('0.925 → 92.5（保留 1 位）', normalizeThemeScore(rpt(0.925)).score === 92.5, `got ${normalizeThemeScore(rpt(0.925)).score}`);
check('>100 截断到 100', normalizeThemeScore(rpt(120)).score === 100);
check('缺报告 → score null', normalizeThemeScore(undefined).score === null);
check('缺 overallSimilarity → null', normalizeThemeScore({}).score === null);
check('level 分档：92 → good', normalizeThemeScore(rpt(92)).level === 'good');
check('level 分档：75 → fair', normalizeThemeScore(rpt(75)).level === 'fair');
check('level 分档：50 → poor', normalizeThemeScore(rpt(50)).level === 'poor');
check('level 分档：20 → bad', normalizeThemeScore(rpt(20)).level === 'bad');

console.log('\n═══ 2. 聚合：正常双侧 ══\n');
const a1 = aggregateDualThemeScores({ lightReport: rpt(92), darkReport: rpt(88) });
check('overallScore = 90', a1.overallScore === 90, `got ${a1.overallScore}`);
check('minScore = 88', a1.minScore === 88);
check('needsReview = false', a1.needsReview === false);
check('perTheme 长度 = 2', a1.perTheme.length === 2);
check('perTheme[0] 是 light', a1.perTheme[0].theme === 'light');
check('perTheme[1] 是 dark', a1.perTheme[1].theme === 'dark');

console.log('\n═══ 3. 🔴 平均分掩盖单侧灾难（核心用例）═══\n');
const a2 = aggregateDualThemeScores({ lightReport: rpt(92), darkReport: rpt(55) });
check('平均分 = 73.5（看似还行）', a2.overallScore === 73.5, `got ${a2.overallScore}`);
check('minScore = 55（暴露问题侧）', a2.minScore === 55);
check('needsReview = true（深色低于阈值 60）', a2.needsReview === true);

const a3 = aggregateDualThemeScores({ lightReport: rpt(95), darkReport: rpt(59.9) });
check('59.9 也应触发复查（用未取整值判阈值）', a3.needsReview === true, `minScore=${a3.minScore} minRawScore=${a3.minRawScore}`);
check('minRawScore 保留未取整精度', a3.minRawScore === 59.9, `got ${a3.minRawScore}`);

console.log('\n═══ 4. 主副标注 ══\n');
const a4 = aggregateDualThemeScores({
  lightReport: rpt(90),
  darkReport: rpt(90),
  primaryBrightness: 'dark',
});
check('主稿为深色时 perTheme[dark].isPrimary = true', a4.perTheme[1].isPrimary === true);
check('主稿为深色时 perTheme[light].isPrimary = false', a4.perTheme[0].isPrimary === false);

console.log('\n═══ 5. 单侧缺报告 → 降级不报错 ══\n');
const a5 = aggregateDualThemeScores({ lightReport: rpt(92), darkReport: null });
check('overallScore = 92（只用有效侧）', a5.overallScore === 92, `got ${a5.overallScore}`);
check('minScore = 92', a5.minScore === 92);
check('dark 侧 score = null', a5.perTheme[1].score === null);
check('dark 侧 level = unknown', a5.perTheme[1].level === 'unknown');
check('needsReview = false（无有效低分侧）', a5.needsReview === false);

const a6 = aggregateDualThemeScores({});
check('两侧都缺 → overallScore null', a6.overallScore === null);
check('两侧都缺 → minScore null', a6.minScore === null);
check('两侧都缺 → needsReview false', a6.needsReview === false);
check('两侧都缺 → perTheme 仍长 2（结构稳定）', a6.perTheme.length === 2);

console.log('\n═══ 6. 阈值可配 ═══\n');
const a7 = aggregateDualThemeScores({ lightReport: rpt(95), darkReport: rpt(65), lowScoreThreshold: 60 });
check('阈值 60 → 65 不触发', a7.needsReview === false);
const a8 = aggregateDualThemeScores({ lightReport: rpt(95), darkReport: rpt(65), lowScoreThreshold: 70 });
check('阈值 70 → 65 触发', a8.needsReview === true);

console.log('\n═══ 7. 问题清单按主题分组 ══\n');
const issuesD = [
  { severity: 'high', comment: '图表副标题对比度不足' },
  { severity: 'medium', comment: '卡片底色偏差' },
];
const a9 = aggregateDualThemeScores({ lightReport: rpt(92, []), darkReport: rpt(88, issuesD) });
check('深色侧带 2 条问题', a9.perTheme[1].issues.length === 2);
check('浅色侧 0 条', a9.perTheme[0].issues.length === 0);
check('问题原样透传（不吞字段）', a9.perTheme[1].issues[0].comment === '图表副标题对比度不足');
check('issues 非数组 → 归一为空数组', normalizeThemeScore({ overallSimilarity: 90, issues: 'x' }).issues.length === 0);

console.log('\n═══ 8. 向后兼容：attach 不破坏既有单主题报告 ══\n');
const single = rpt(88, [{ severity: 'medium', comment: '原问题' }]);
const merged = attachDualThemeScores(single, a1);
check('原字段 overallSimilarity 保留', merged.overallSimilarity === 88);
check('原 issues 保留', merged.issues.length === 1);
check('_dualTruth = true', merged._dualTruth === true);
check('dualThemeScore 已挂载', !!merged.dualThemeScore?.perTheme);
check('dualThemeScore 指向传入结果', merged.dualThemeScore === a1);
const untouched = attachDualThemeScores(single, null);
check('dual 为 null 时原样返回', untouched === single);

console.log(`\n${failures === 0 ? '🎉 全部通过' : `💥 ${failures} 项失败`}\n`);
process.exit(failures === 0 ? 0 : 1);