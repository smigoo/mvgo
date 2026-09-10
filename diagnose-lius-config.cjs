/**
 * 诊断 lius（刘爽）的「已配置」状态真相。
 *
 * 背景：报表把 lius 标为「已配置+已生成」，但 Mongo 直查 user_ai_configs 的
 * distinct('userId') 里没有能匹配上他 users._id 的键。怀疑与 components.creatorId
 * 同款「双形态存储」问题：老流程以门户 UID 字符串写 userId，新版才写 ObjectId。
 *
 * 而 admin.service.ts:183 的 configMap 只按 u._id.toString() 查（无 uid 兜底），
 * 所以老形态的配置文档会被静默判为「未配置」。
 *
 * 用法（ECS 上，有 mongodb 驱动的目录）：
 *   export MONGODB_URI='mongodb://root:Microvideo%402026@dds-bp13ae3414783164.mongodb.rds.aliyuncs.com:3717/langgraph-server?authSource=admin'
 *   node diagnose-lius-config.cjs
 *
 * 只读，不写任何数据。
 */
const { MongoClient, ObjectId } = require('mongodb');

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('缺少 MONGODB_URI 环境变量');
  process.exit(1);
}
const DB = (URI.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'langgraph-server';
const TARGET = process.env.TARGET || 'lius';

(async () => {
  const cli = new MongoClient(URI, { serverSelectionTimeoutMS: 15000 });
  await cli.connect();
  const db = cli.db(DB);
  console.log('库:', DB);

  // 1) 定位目标用户
  const users = await db
    .collection('users')
    .find({
      $or: [
        { username: TARGET },
        { uid: TARGET },
        { name: new RegExp(TARGET, 'i') },
      ],
    })
    .toArray();

  console.log('\n=== 1. 目标用户 ===');
  if (!users.length) {
    console.log('未找到用户:', TARGET);
  }
  for (const u of users) {
    console.log(
      '  _id=%s  uid=%s  username=%s  name=%s  dept=%s',
      String(u._id),
      u.uid,
      u.username,
      u.name || (u.portalInfo && u.portalInfo.name) || '-',
      (u.portalInfo && u.portalInfo.deptName) || u.deptName || '-',
    );
  }

  // 2) user_ai_configs 全量形态盘点
  const configs = await db.collection('user_ai_configs').find({}).toArray();
  console.log('\n=== 2. user_ai_configs 共 %d 条 ===', configs.length);

  const userIds = new Set(users.map((u) => String(u._id)));
  const userUids = new Set(
    users.map((u) => u.uid).concat(users.map((u) => u.username)).filter(Boolean),
  );

  let oidCount = 0;
  let strCount = 0;
  const strSamples = [];

  for (const c of configs) {
    const raw = c.userId;
    const isOid = raw instanceof ObjectId || (raw && raw._bsontype === 'ObjectId');
    if (isOid) oidCount++;
    else {
      strCount++;
      if (strSamples.length < 30) strSamples.push(String(raw));
    }
    const key = String(raw);
    if (userIds.has(key) || userUids.has(key)) {
      console.log('  ✅ 命中目标: userId=%s (类型=%s) configEnc=%s',
        key, isOid ? 'ObjectId' : typeof raw, c.configEnc ? '有密文' : 'null');
    }
  }
  console.log('  形态分布: ObjectId %d 条 / 字符串 %d 条', oidCount, strCount);
  if (strSamples.length) {
    console.log('  字符串样本:', strSamples.join(', '));
  }

  // 3) 反查：字符串形态的 userId 里有没有目标
  console.log('\n=== 3. 目标是否被字符串形态命中 ===');
  for (const u of users) {
    const byOid = configs.find((c) => String(c.userId) === String(u._id));
    const byUid = configs.find((c) => String(c.userId) === String(u.uid));
    const byName = configs.find((c) => String(c.userId) === String(u.username));
    console.log('  用户 %s (_id=%s, uid=%s)', u.username, String(u._id), u.uid);
    console.log('    按 ObjectId 查: %s', byOid ? '有' : '无');
    console.log('    按 uid     查: %s', byUid ? '有' : '无');
    console.log('    按 username查: %s', byName ? '有' : '无');
  }

  // 4) 全局：有多少配置文档的 userId 匹配不上任何 user._id（幽灵/老形态）
  const allUsers = await db.collection('users').find({}, { projection: { _id: 1, uid: 1, username: 1 } }).toArray();
  const allIds = new Set(allUsers.map((u) => String(u._id)));
  const allUids = new Set(
    allUsers.map((u) => u.uid).concat(allUsers.map((u) => u.username)).filter(Boolean),
  );
  const orphanById = configs.filter((c) => !allIds.has(String(c.userId)));
  const matchByUid = orphanById.filter((c) => allUids.has(String(c.userId)));
  console.log('\n=== 4. 匹配不上 user._id 的配置文档 ===');
  console.log('  总数: %d / %d', orphanById.length, configs.length);
  console.log('  其中能用 uid/username 对上的（老形态，可被修复）: %d', matchByUid.length);
  matchByUid.forEach((c) => {
    const u = allUsers.find((x) => x.uid === String(c.userId) || x.username === String(c.userId));
    console.log('    %s -> 用户 %s (_id=%s)', String(c.userId), u && u.username, u && String(u._id));
  });
  const trulyOrphan = orphanById.filter((c) => !allUids.has(String(c.userId)));
  if (trulyOrphan.length) {
    console.log('  完全无主（用户已不存在）: %d', trulyOrphan.length);
    trulyOrphan.forEach((c) => console.log('    %s', String(c.userId)));
  }

  await cli.close();
})().catch((e) => {
  console.error('失败:', e.message);
  process.exit(1);
});
