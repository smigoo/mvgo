/**
 * P0 修复探针：safeJsonStringify（循环安全序列化，单点兜底）
 * 口径：直接 require dist 真实导出（零源码改动、不调 LLM）
 */
const { safeJsonStringify, redactSecrets } = require('./dist/common/utils/redact.js');

let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) {
    pass++;
    console.log('✅', name);
  } else {
    fail++;
    console.log('❌', name, extra !== undefined ? `→ ${extra}` : '');
  }
};

// ── 0. 零行为变化：普通对象必须与原 JSON.stringify 逐字一致 ──
{
  const plain = { type: 'progress', stage: '生成', seq: 3, ts: 1790691053346 };
  const a = safeJsonStringify(plain);
  const b = JSON.stringify(plain);
  ok('普通对象与原 JSON.stringify 逐字一致', a === b, `\n   got=${a}\n   want=${b}`);
  ok('space 参数生效', safeJsonStringify({ a: 1 }, 2) === JSON.stringify({ a: 1 }, null, 2));
}

// ── 1. 自指循环 ──
{
  const o = { a: 1 };
  o.self = o;
  let s;
  let threw = false;
  try {
    s = safeJsonStringify(o);
  } catch (e) {
    threw = true;
    console.log('   错误:', e.message);
  }
  ok('自指循环不抛错', !threw);
  ok('自指循环 → [Circular]', String(s).includes('[Circular]'));
  ok(
    '自指循环结果可 JSON.parse 回读',
    (() => {
      try {
        JSON.parse(s);
        return true;
      } catch {
        return false;
      }
    })(),
  );
}

// ── 2. 真实形态：children × __parent（本次 P0 的原始载荷） ──
{
  const root = { name: 'root', children: [] };
  const child = { name: 'c1', children: [] };
  child.__parent = root; // 生成期 microcode-engineer.js:5578 注入的反链
  root.children.push(child);
  const payload = { type: 'complete', sessionId: 'mc-1', figmaNodeData: root, timestamp: 123 };

  let s;
  let threw = false;
  try {
    s = safeJsonStringify(payload);
  } catch (e) {
    threw = true;
    console.log('   错误:', e.message);
  }
  ok('__parent × children 环不抛错', !threw);
  ok('__parent 被占位为 [Circular]', String(s).includes('[Circular]'));
  ok('非循环数据保留（child.name）', String(s).includes('"c1"'));
  ok('type=complete 保留', String(s).includes('"type":"complete"'));
  // 对照：裸 JSON.stringify 必须抛错（证明该形态确实是原缺陷）
  let rawThrew = false;
  try {
    JSON.stringify(payload);
  } catch {
    rawThrew = true;
  }
  ok('对照：裸 JSON.stringify 对同载荷抛错（复现原缺陷）', rawThrew);
}

// ── 3. DAG 兄弟共享同一引用 → 不误判为循环 ──
{
  const shared = { v: 1 };
  const s = safeJsonStringify({ a: shared, b: shared });
  ok('DAG 不误判为循环', !String(s).includes('[Circular]'));
  ok('DAG 两处都完整展开', (String(s).match(/"v":1/g) || []).length === 2);
}

// ── 4. 原生语义保留（Date / RegExp / undefined） ──
{
  const d = new Date('2026-09-29T00:00:00.000Z');
  const s = safeJsonStringify({ when: d, re: /x/g, n: 3, b: true, u: undefined });
  ok('Date → ISO 字符串（未退化为 {}）', String(s).includes('2026-09-29T00:00:00.000Z'));
  ok('RegExp → {}（与原 JSON.stringify 一致）', String(s).includes('"re":{}'));
  ok('undefined 键被省略（与原行为一致）', !String(s).includes('"u"'));
}

// ── 5. 深嵌套不爆栈 ──
{
  let deep = { end: true };
  for (let i = 0; i < 2000; i++) deep = { child: deep };
  let threw = false;
  try {
    safeJsonStringify(deep);
  } catch (e) {
    threw = true;
    console.log('   错误:', e.message);
  }
  ok('2000 层深嵌套不爆栈', !threw);
}

// ── 6. 原始值 ──
ok('null → "null"', safeJsonStringify(null) === 'null');
ok('undefined → ""（模板串中写出空而非 "undefined"）', safeJsonStringify(undefined) === '');
ok('数字', safeJsonStringify(3) === '3');
ok('字符串', safeJsonStringify('s') === '"s"');

// ── 7. 与 redactSecrets 循环判定口径一致（都只判祖先回指） ──
{
  const item = { stage: 'x' };
  const task = { progress: [item] };
  item.details = { task };
  const a = safeJsonStringify(task);
  const b = JSON.stringify(redactSecrets(task));
  ok('两者对同一环都产出 [Circular]', a.includes('[Circular]') && b.includes('[Circular]'));
}

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
