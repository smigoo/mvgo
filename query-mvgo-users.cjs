// 生产只读查询：哪些人配置了晓界 / 哪些人生成了组件
// 用法（ECS backend-node 目录下）：
//   export MONGODB_URI='mongodb://root:Microvideo%402026@dds-bp13ae3414783164.mongodb.rds.aliyuncs.com:3717/langgraph-server?replicaSet=mgset-102332332&authSource=admin'
//   node query-mvgo-users.cjs
const { MongoClient, ObjectId } = require('mongodb');

const URI = process.env.MONGODB_URI || 'mongodb://root:Microvideo%402026@dds-bp13ae3414783164.mongodb.rds.aliyuncs.com:3717/langgraph-server?replicaSet=mgset-102332332&authSource=admin';
const DB_NAME = (() => { try { return new URL(URI).pathname.replace(/^\//, '') || 'langgraph-server'; } catch { return 'langgraph-server'; } })();

const toStr = (v) => (v && typeof v === 'object' && typeof v.toString === 'function') ? v.toString() : String(v);
const toOid = (v) => { const s = toStr(v); return ObjectId.isValid(s) ? new ObjectId(s) : null; };

(async () => {
  const client = await MongoClient.connect(URI);
  const db = client.db(DB_NAME);

  // 配置了晓界：user_ai_configs.userId（ObjectId 或 string UID 双形态）
  const cfgIds = (await db.collection('user_ai_configs').distinct('userId'))
    .map(toStr).filter(id => id && id !== 'undefined' && id !== 'null');

  // 生成了组件：components.creatorId
  const genIds = (await db.collection('components').aggregate([{ $group: { _id: '$creatorId' } }]).toArray())
    .map(d => toStr(d._id)).filter(id => id && id !== 'undefined' && id !== 'null');

  const allIds = [...new Set([...cfgIds, ...genIds])];
  const oidSet = [...new Set(allIds.map(toOid).filter(Boolean))];
  const strSet = allIds.filter(id => !ObjectId.isValid(id));

  // 双形态关联 users：oid 查 _id，字符串查 uid
  const users = await db.collection('users').find({ $or: [
    { _id: { $in: oidSet } },
    { uid: { $in: strSet } }
  ] }).toArray();

  const userMap = new Map();
  for (const u of users) {
    if (u._id) userMap.set(u._id.toString(), u);
    if (u.uid) userMap.set(u.uid.toString(), u);
  }

  console.log('\n=== 晓界用户统计（库: ' + DB_NAME + '）===');
  console.log('配置了晓界: ' + cfgIds.length + ' 人 | 生成了组件: ' + genIds.length + ' 人 | 涉及用户: ' + allIds.length + ' 人\n');
  console.log('username / uid'.padEnd(30) + '| 配置晓界 | 生成组件');
  console.log('-'.repeat(64));
  for (const id of allIds) {
    const u = userMap.get(id) || {};
    const name = (u.username || u.uid || '(未匹配用户表, id=' + id.slice(0, 12) + ')');
    console.log(name.slice(0, 28).padEnd(30) + '|    ' + (cfgIds.includes(id) ? 'Y' : 'N') + '     |    ' + (genIds.includes(id) ? 'Y' : 'N'));
  }
  await client.close();
})().catch(e => { console.error(e); process.exit(1); });
