// 查询：已注册用户 / 已配置晓界 / 已使用(生成组件) / 最新注册的人
// ECS 用法（放在 backend-node 目录，那里有 node_modules/mongodb）：
//   export MONGODB_URI='mongodb://root:Microvideo%402026@dds-bp13ae3414783164.mongodb.rds.aliyuncs.com:3717/langgraph-server?replicaSet=mgset-102332332&authSource=admin'
//   node query-latest-users.cjs          # 默认最新 20 人
//   LIMIT=50 node query-latest-users.cjs # 改条数
const { MongoClient } = require('mongodb');

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/langgraph-server';
const DB = (() => { try { return new URL(URI).pathname.replace(/^\//, '') || 'langgraph-server'; } catch { return 'langgraph-server'; } })();
const LIMIT = parseInt(process.env.LIMIT || '20', 10);
const S = (v) => (v == null ? '' : (typeof v === 'object' && typeof v.toString === 'function' ? v.toString() : String(v)));

(async () => {
  const c = await MongoClient.connect(URI);
  const db = c.db(DB);

  // 已配置晓界 / 已生成组件 的 id 集合（双形态：ObjectId 或 门户 UID 字符串）
  const cfgIds = new Set((await db.collection('user_ai_configs').distinct('userId')).map(S));
  const genIds = new Set((await db.collection('components').aggregate([{ $group: { _id: '$creatorId' } }]).toArray()).map(d => S(d._id)));

  // 最新注册：按 createdAt 降序
  const users = await db.collection('users').find({}).sort({ createdAt: -1 }).limit(LIMIT).toArray();

  console.log(`\n=== 最新注册 ${users.length} 人（按 createdAt 降序）===`);
  console.log('注册时间'.padEnd(21) + '用户名'.padEnd(15) + '姓名'.padEnd(11) + '部门'.padEnd(20) + '配置 生成');
  console.log('-'.repeat(78));
  for (const u of users) {
    const id = S(u._id);
    const uid = u.uid || u.username || '';
    const cfg = (cfgIds.has(id) || cfgIds.has(uid)) ? 'Y' : '—';
    const gen = (genIds.has(id) || genIds.has(uid)) ? 'Y' : '—';
    const t = u.createdAt ? new Date(u.createdAt).toISOString().replace('T', ' ').slice(0, 19) : '—';
    const dept = u.deptName || u.dept || '—';
    console.log(t.padEnd(21) + String(u.username || uid || '—').slice(0, 13).padEnd(15)
      + String(u.name || '—').slice(0, 9).padEnd(11) + String(dept).slice(0, 18).padEnd(20) + cfg + '    ' + gen);
  }

  const total = await db.collection('users').countDocuments();
  console.log(`\n汇总: 已注册 ${total} 人 | 已配置晓界 ${cfgIds.size} 人 | 已生成组件 ${genIds.size} 人`);
  await c.close();
})().catch(e => { console.error(e); process.exit(1); });
