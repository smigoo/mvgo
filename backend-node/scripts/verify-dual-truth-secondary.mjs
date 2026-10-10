/**
 * 离线验证：副稿解析与错误归类（2026-10-10 D1/D3）
 *
 * 目的：不调 Figma API、不调 LLM，纯函数级证明：
 *   1. 主副角色解析（D1 默认预选第一个 / 显式选 second）
 *   2. 同节点拦截
 *   3. 副稿错误归类（403/429/404/消息特征）全覆盖
 *   4. 明暗矛盾拦截（D3）
 *   5. 双真值节点按**实测明暗归位**（不按主/副硬绑）
 *
 * 用法：node scripts/verify-dual-truth-secondary.mjs
 */
import {
  resolvePrimarySecondary,
  validatePrimarySecondary,
  validateSecondaryBrightness,
  classifySecondaryFigmaError,
  buildSecondaryFigmaError,
  assembleDualTruthNodes,
  SECONDARY_ERROR_CODES as C,
} from '../src/ai-engine/utils/dual-truth-figma.js';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const A = { fileKey: 'AAA', nodeId: '1:2' };
const B = { fileKey: 'BBB', nodeId: '3:4' };

console.log('\n═══ 1. 主副角色解析（D1）═══\n');
const r1 = resolvePrimarySecondary(A, null);
check('单稿：secondary 为 null', r1.secondary === null);
check('单稿：primary 即第一个', r1.primary.fileKey === 'AAA');

const r2 = resolvePrimarySecondary(A, B, 'first');
check('默认 first：primary=第一个', r2.primary.fileKey === 'AAA');
check('默认 first：secondary=第二个', r2.secondary.fileKey === 'BBB');

const r3 = resolvePrimarySecondary(A, B, 'second');
check('显式 second：primary=第二个', r3.primary.fileKey === 'BBB');
check('显式 second：secondary=第一个', r3.secondary.fileKey === 'AAA');

console.log('\n═══ 2. 同节点拦截 ═══\n');
check('同节点被拦', validatePrimarySecondary(A, { ...A }).ok === false);
check(
  '同节点错误指向 INVALID_URL',
  validatePrimarySecondary(A, { ...A }).code === C.INVALID_URL,
);
check('同 fileKey 不同 node 放行', validatePrimarySecondary(A, { fileKey: 'AAA', nodeId: '9:9' }).ok === true);
check('不同 fileKey 放行', validatePrimarySecondary(A, B).ok === true);
check('副稿缺 nodeId 被拦', validatePrimarySecondary(A, { fileKey: 'BBB' }).ok === false);
check(
  '副稿缺 nodeId 错误码正确',
  validatePrimarySecondary(A, { fileKey: 'BBB' }).code === C.MISSING_NODE_ID,
);
check('单稿校验恒通过', validatePrimarySecondary(A, null).ok === true);

console.log('\n═══ 3. 副稿错误归类（D3 fail-closed）═══\n');
const cases = [
  [403, C.FORBIDDEN, '403 → 无权限'],
  [401, C.FORBIDDEN, '401 → 无权限'],
  [429, C.RATE_LIMITED, '429 → 限流'],
  [404, C.NODE_NOT_FOUND, '404 → 节点不存在'],
  [undefined, C.NODE_NOT_FOUND, '消息含 not found → 节点不存在'],
  [undefined, C.RATE_LIMITED, '消息含 rate limit → 限流'],
  [undefined, C.FORBIDDEN, '消息含 permission → 无权限'],
  [undefined, C.FETCH_FAILED, '未知错误 → 拉取失败'],
];
for (const [status, expect, name] of cases) {
  const err = status
    ? Object.assign(new Error('boom'), { status })
    : { message: mapMsg(name) };
  const got = classifySecondaryFigmaError(err);
  check(name, got.code === expect, `got ${got.code}`);
}
// 响应体里的 status 也要能取到
const nested = classifySecondaryFigmaError({ message: 'x', response: { status: 429 } });
check('err.response.status 可识别', nested.code === C.RATE_LIMITED, `got ${nested.code}`);

function mapMsg(name) {
  if (name.includes('not found')) return 'Node not found';
  if (name.includes('rate limit')) return 'rate limit exceeded';
  if (name.includes('permission')) return 'permission denied';
  return 'something went wrong';
}

console.log('\n═══ 4. 错误信息完整性（须指明副稿+原因+处置）═══\n');
const e403 = buildSecondaryFigmaError(C.FORBIDDEN, 'fileKey=BBB');
check('403 标题指明深色设计稿', e403.title.includes('深色设计稿'), e403.title);
check('403 有处置建议', (e403.hint || '').length > 5, e403.hint);
check('403 带 code', e403.code === C.FORBIDDEN);
check('403 是 Error 实例', e403 instanceof Error);
check('403 带 detail', e403.message.includes('BBB'), e403.message);

console.log('\n═══ 5. 明暗矛盾拦截 ═══\n');
check('一致（dark/dark）放行', validateSecondaryBrightness('dark', 'dark').ok === true);
check('一致（light/light）放行', validateSecondaryBrightness('light', 'light').ok === true);
const mm = validateSecondaryBrightness('light', 'dark');
check('矛盾被拦', mm.ok === false);
check('矛盾错误码正确', mm.code === C.BRIGHTNESS_MISMATCH);
check('矛盾 detail 指明实测与标注', mm.detail.includes('浅色') && mm.detail.includes('深色'), mm.detail);
check('缺任一值放行（不误伤）', validateSecondaryBrightness(null, 'dark').ok === true);

console.log('\n═══ 6. 双真值节点按实测明暗归位 ═══\n');
const resolve = (node, fb) => (node && node._b ? node._b : fb);
const darkNode = { _b: 'dark', id: 'dark-node' };
const lightNode = { _b: 'light', id: 'light-node' };

const s1 = assembleDualTruthNodes(darkNode, lightNode, 'dark', 'light', resolve);
check('主稿深/副稿浅 → lightNodeData=副稿(浅)', s1.lightNodeData === lightNode);
check('主稿深/副稿浅 → darkNodeData=主稿(深)', s1.darkNodeData === darkNode);

const s2 = assembleDualTruthNodes(lightNode, darkNode, 'light', 'dark', resolve);
check('主稿浅/副稿深 → lightNodeData=主稿(浅)', s2.lightNodeData === lightNode);
check('主稿浅/副稿深 → darkNodeData=副稿(深)', s2.darkNodeData === darkNode);

const s3 = assembleDualTruthNodes(darkNode, lightNode, 'dark', 'dark', resolve);
check('两边都深 → 按实测仍归位正确', s3.darkNodeData === darkNode && s3.lightNodeData === lightNode);

console.log(`\n${failures === 0 ? '🎉 全部通过' : `💥 ${failures} 项失败`}\n`);
process.exit(failures === 0 ? 0 : 1);