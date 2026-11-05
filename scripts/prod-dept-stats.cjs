/* 生产数据统计：按部门汇总 注册任务/生成任务/落地组件/删除组件（累计 + 本周） */
const fs = require('fs');
const { MongoClient } = require('/home/mvbt/mvgo/backend-node/node_modules/mongodb');

const MONGO = 'mongodb://root:Microvideo%402026@dds-bp13ae3414783164.mongodb.rds.aliyuncs.com:3717/langgraph-server?replicaSet=mgset-102332332&authSource=admin';
// 本周一 00:00 (+08:00)：2026-11-05 是周四 → 本周一 2026-11-02
const WEEK_START = new Date('2026-11-02T00:00:00+08:00').getTime();

(async () => {
  const c = new MongoClient(MONGO);
  await c.connect();
  const db = c.db('langgraph-server');

  // ── 用户 → 部门映射 ──
  const users = await db.collection('users').find({}).toArray();
  const deptOf = {};
  const nameOf = {};
  for (const u of users) {
    const uid = String(u._id);
    const p = u.portalInfo || {};
    deptOf[uid] = p.deptName || p.orgName || (u.username || '未知');
    nameOf[uid] = p.name || u.username || uid.slice(-6);
  }
  const deptList = [...new Set(Object.values(deptOf))].sort();

  // ── 任务（tasks.json）──
  const raw = JSON.parse(fs.readFileSync('/home/mvbt/mvgo/backend-node/data/tasks.json', 'utf8'));
  const tasks = Array.isArray(raw) ? raw : (raw.tasks || Object.values(raw));
  const mkDept = () => Object.fromEntries(deptList.map((d) => [d, { reg: 0, gen: 0 }]));
  const allTask = mkDept();
  const weekTask = mkDept();
  const typeCount = {};
  let unknownUserTasks = 0;
  for (const t of tasks) {
    const uid = String(t.userId || '');
    const d = deptOf[uid];
    const st = t.startTime || 0;
    if (!d) { if (t.userId) unknownUserTasks++; continue; }
    const kind = String(t.sessionId || '').split('-').slice(0, 2).join('-');
    typeCount[kind] = (typeCount[kind] || 0) + 1;
    allTask[d].reg++;
    if (t.status === 'completed') allTask[d].gen++;
    if (st >= WEEK_START) {
      weekTask[d].reg++;
      if (t.status === 'completed') weekTask[d].gen++;
    }
  }

  // ── 落地组件（components 集合，现存）──
  const comps = await db.collection('components').find({}, { projection: { creatorId: 1, createdAt: 1, 'metadata.generationTier': 1 } }).toArray();
  const mkC = () => Object.fromEntries(deptList.map((d) => [d, { total: 0, week: 0 }]));
  const allComp = mkC();
  const weekComp = mkC();
  let unknownUserComp = 0;
  let earliest = null;
  for (const comp of comps) {
    const uid = String(comp.creatorId || '');
    const d = deptOf[uid];
    const created = comp.createdAt ? new Date(comp.createdAt).getTime() : 0;
    if (!earliest || (created && created < earliest)) earliest = created || earliest;
    if (!d) { unknownUserComp++; continue; }
    allComp[d].total++;
    if (created >= WEEK_START) weekComp[d].week++;
  }

  // ── 删除组件（访问日志 POST /api/component/<id>/delete）──
  const dels = await db.collection('operation_logs').aggregate([
    { $match: { path: /^\/api\/component\/[^/]+\/delete$/, method: 'POST' } },
    { $group: { _id: { u: '$userId', p: '$path', t: '$createdAt' } } },
  ]).toArray();
  const mkD = () => Object.fromEntries(deptList.map((d) => [d, { all: 0, week: 0 }]));
  const allDel = mkD();
  const weekDel = mkD();
  const delKeys = new Set();
  for (const x of dels) {
    // 同一 path 可能多次调用（重试）——按 (path, createdAt秒) 去重近似幂等
    const key = x._id.p + '@' + String(x._id.t).slice(0, 19);
    if (delKeys.has(key)) continue;
    delKeys.add(key);
    const uid = String(x._id.u || '');
    const d = deptOf[uid];
    const t = x._id.t ? new Date(x._id.t).getTime() : 0;
    if (!d) continue;
    allDel[d].all++;
    if (t >= WEEK_START) weekDel[d].week++;
  }

  // ── 输出 ──
  console.log('== 部门统计（任务累计/完成 | 本周注册/本周完成 | 组件现存/本周新增 | 删除累计/本周） ==');
  console.log('部门\t注册任务\t生成完成\t本周注册\t本周完成\t落地组件(现存)\t本周新增组件\t删除组件(累计)\t本周删除');
  const rows = deptList.map((d) => ({
    d,
    a: allTask[d], w: weekTask[d], c: allComp[d], cw: weekComp[d], dl: allDel[d], dw: weekDel[d],
    sum: allTask[d].reg + allComp[d].total + allDel[d].all,
  })).sort((x, y) => y.sum - x.sum);
  for (const r of rows) {
    if (!r.sum && !r.w.reg && !r.cw.week) continue;
    console.log([r.d, r.a.reg, r.a.gen, r.w.reg, r.w.gen, r.c.total, r.cw.week, r.dl.all, r.dw.week].join('\t'));
  }
  const tot = (o, k) => Object.values(o).reduce((s, x) => s + x[k], 0);
  console.log('== 合计 ==');
  console.log(JSON.stringify({
    任务_累计注册: tot(allTask, 'reg'), 任务_累计完成: tot(allTask, 'gen'),
    任务_本周注册: tot(weekTask, 'reg'), 任务_本周完成: tot(weekTask, 'gen'),
    组件_现存: comps.length, 组件_本周新增: tot(weekComp, 'week'),
    删除_累计事件: tot(allDel, 'all'), 删除_本周: tot(weekDel, 'week'),
    任务类型分布: typeCount, 最早组件时间: earliest ? new Date(earliest).toISOString() : null,
    userId未匹配_任务: unknownUserTasks, userId未匹配_组件: unknownUserComp,
    用户数: users.length,
  }, null, 1));
  await c.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
