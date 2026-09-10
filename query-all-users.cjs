/**
 * 输出【全部】注册用户：_id / uid / username / 姓名 / 部门 / 注册时间 / 已配置 / 已生成
 *
 * 用法（ECS 上，backend-node 目录）：
 *   export MONGODB_URI='mongodb://root:Microvideo%402026@dds-bp13ae3414783164.mongodb.rds.aliyuncs.com:3717/langgraph-server?authSource=admin'
 *   node query-all-users.cjs              # 打印全量 + 落盘 all-users.csv
 *   FMT=csv node query-all-users.cjs      # 只输出 CSV 到 stdout（方便重定向）
 *   DEPT=软件研发中心 node query-all-users.cjs   # 按部门名模糊过滤
 *
 * 只读，不写数据库。
 */
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('缺少 MONGODB_URI 环境变量');
  process.exit(1);
}
const DB = (URI.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'langgraph-server';
const FMT = process.env.FMT || 'table';
const DEPT = process.env.DEPT || '';

const pad = (s, n) => {
  s = String(s == null ? '' : s);
  let w = 0;
  for (const ch of s) w += /[\u4e00-\u9fa5\uff00-\uffef]/.test(ch) ? 2 : 1;
  return s + ' '.repeat(Math.max(0, n - w));
};

(async () => {
  const cli = new MongoClient(URI, { serverSelectionTimeoutMS: 15000 });
  await cli.connect();
  const db = cli.db(DB);

  // 1) 全量用户
  const users = await db.collection('users').find({}).sort({ createdAt: -1 }).toArray();

  // 2) 已配置：user_ai_configs.userId 双形态（ObjectId / UID 字符串）
  const cfgRaw = await db.collection('user_ai_configs').distinct('userId');
  const cfgSet = new Set(cfgRaw.map((x) => String(x)));

  // 3) 已生成：components.creatorId 双形态
  const genRaw = await db
    .collection('components')
    .aggregate([{ $group: { _id: '$creatorId' } }])
    .toArray();
  const genSet = new Set(genRaw.map((d) => String(d._id)).filter(Boolean));

  const rows = [];
  for (const u of users) {
    const oid = String(u._id);
    const uid = u.uid || (u.portalInfo && u.portalInfo.uid) || '';
    const username = u.username || '';
    const name = u.name || (u.portalInfo && u.portalInfo.name) || '';
    const dept =
      u.deptName || (u.portalInfo && u.portalInfo.deptName) || '';
    const created = u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 19).replace('T', ' ') : '';

    // 双形态判定：ObjectId hex / uid / username 任一键命中即算
    const keys = [oid, uid, username].filter(Boolean);
    const cfg = keys.some((k) => cfgSet.has(k));
    const gen = keys.some((k) => genSet.has(k));

    if (DEPT && dept.indexOf(DEPT) === -1) continue;
    rows.push({ oid, uid, username, name, dept, created, cfg, gen });
  }

  // CSV 落盘
  const csv = ['_id,uid,username,name,dept,createdAt,configured,generated']
    .concat(
      rows.map((r) =>
        [r.oid, r.uid, r.username, r.name, r.dept, r.created, r.cfg ? 'Y' : 'N', r.gen ? 'Y' : 'N']
          .map((v) => '"' + String(v).replace(/"/g, '""') + '"')
          .join(','),
      ),
    )
    .join('\n');

  if (FMT === 'csv') {
    console.log(csv);
  } else {
    console.log('=== 全部注册用户 %d 人 ===', rows.length);
    console.log(
      pad('#', 4) + pad('_id(ObjectId)', 26) + pad('uid', 14) + pad('username', 16) +
      pad('姓名', 12) + pad('部门', 18) + pad('注册时间', 21) + '配置  生成',
    );
    rows.forEach((r, i) => {
      console.log(
        pad(i + 1, 4) + pad(r.oid, 26) + pad(r.uid, 14) + pad(r.username, 16) +
        pad(r.name, 12) + pad(r.dept, 18) + pad(r.created, 21) +
        (r.cfg ? 'Y' : 'N') + '     ' + (r.gen ? 'Y' : 'N'),
      );
    });
    const c = rows.filter((r) => r.cfg).length;
    const g = rows.filter((r) => r.gen).length;
    console.log('\n汇总: 注册 %d 人 | 已配置 %d 人 | 已生成 %d 人', rows.length, c, g);
    // 名单（便于直接抄进报表）
    console.log('\n已配置名单: ' + rows.filter((r) => r.cfg).map((r) => r.username).join(', '));
    console.log('已生成名单: ' + rows.filter((r) => r.gen).map((r) => r.username).join(', '));
    fs.writeFileSync('./all-users.csv', csv, 'utf8');
    console.log('\n已落盘: ./all-users.csv');
  }

  await cli.close();
})().catch((e) => {
  console.error('失败:', e.message);
  process.exit(1);
});
