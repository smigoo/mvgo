// 生产只读：按部门总览聚合（部门 / 已注册 / 已配置 / 已生成）
// 用法：
//   export MONGODB_URI='mongodb://root:Microvideo%402026@dds-bp13ae3414783164.mongodb.rds.aliyuncs.com:3717/langgraph-server?replicaSet=mgset-102332332&authSource=admin'
//   node query-dept-overview.cjs
const { MongoClient } = require('mongodb');
const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/langgraph-server';
const DB = (URI.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'langgraph-server';
const S = (v) => (v == null ? '' : (typeof v === 'object' && typeof v.toString === 'function' ? v.toString() : String(v)));

(async () => {
  const cli = await MongoClient.connect(URI, { serverSelectionTimeoutMS: 15000 });
  const db = cli.db(DB);

  const cfgSet = new Set((await db.collection('user_ai_configs').distinct('userId')).map(S));
  const genRaw = await db.collection('components').aggregate([{ $group: { _id: '$creatorId' } }]).toArray();
  const genSet = new Set(genRaw.map((d) => S(d._id)).filter(Boolean));

  const users = await db.collection('users').find({}).toArray();
  const total = users.length;
  const cfgTotal = new Set();
  const genTotal = new Set();

  const map = new Map();
  const bump = (m, k) => { if (!m.has(k)) m.set(k, { reg: 0, cfg: 0, gen: 0 }); return m.get(k); };

  for (const u of users) {
    const dept = u.deptName || (u.portalInfo && u.portalInfo.deptName) || '未分配部门';
    const keys = [S(u._id), u.uid || '', u.username || ''].filter(Boolean);
    const cfg = keys.some((k) => cfgSet.has(k));
    const gen = keys.some((k) => genSet.has(k));
    const row = bump(map, dept);
    row.reg += 1;
    if (cfg) { row.cfg += 1; keys.forEach((k) => cfgTotal.add(k)); }
    if (gen) { row.gen += 1; keys.forEach((k) => genTotal.add(k)); }
  }

  const rows = [...map.entries()]
    .map(([dept, v]) => ({ dept, ...v }))
    .sort((a, b) => b.reg - a.reg);

  const sum = rows.reduce((a, r) => ({ reg: a.reg + r.reg, cfg: a.cfg + r.cfg, gen: a.gen + r.gen }), { reg: 0, cfg: 0, gen: 0 });

  console.log('=== 按部门总览（库: ' + DB + '，注册 ' + total + ' 人）===');
  console.log('部门'.padEnd(20) + '已注册'.padEnd(10) + '已配置'.padEnd(10) + '已测试生成');
  console.log('-'.repeat(50));
  for (const r of rows) {
    console.log(String(r.dept).slice(0, 18).padEnd(20) + String(r.reg).padEnd(10) + String(r.cfg).padEnd(10) + String(r.gen));
  }
  console.log('-'.repeat(50));
  console.log('合计'.padEnd(20) + String(sum.reg).padEnd(10) + String(sum.cfg).padEnd(10) + String(sum.gen));
  console.log('\nJSON=> ' + JSON.stringify(rows.map((r) => [r.dept, r.reg, r.cfg, r.gen]).concat([['合计', sum.reg, sum.cfg, sum.gen]])));

  await cli.close();
})().catch((e) => { console.error('失败:', e.message); process.exit(1); });
