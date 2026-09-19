const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://root:Microvideo%402026@dds-bp13ae3414783164.mongodb.rds.aliyuncs.com:3717/langgraph-server';
const DB_NAME = 'langgraph-server';

// 部门映射：二级部门 → 一级部门
const deptMap = {
  // 软件研发中心
  '高速调度组': '软件研发中心',
  '数智营运组': '软件研发中心',
  '公路云控组': '软件研发中心',
  '出行服务线': '软件研发中心',
  '高速安管组': '软件研发中心',
  '高速服务组': '软件研发中心',
  '数智业务线': '软件研发中心',
  '政务业务线': '软件研发中心',
  '高速业务线': '软件研发中心',
  '主动管控组': '软件研发中心',
  '项目二组': '软件研发中心',
  '交通重货组': '软件研发中心',
  '出行渠道组': '软件研发中心',
  '数智服务组': '软件研发中心',
  '执法交警组': '软件研发中心',
  '项目一组': '软件研发中心',
  '出行客服组': '软件研发中心',
  '数智运营部': '软件研发中心',
  
  // 综管事业部
  '综管研发一组': '综管事业部',
  '综管研发二组': '综管事业部',
  '综管研发三组': '综管事业部',
  '综管研发四组': '综管事业部',
  
  // 视频事业部
  '平台研发部(视频)': '视频事业部',
  '基础研发部(视频)': '视频事业部',
  
  // 桥隧事业部
  '桥隧研发部': '桥隧事业部',
  
  // 基础研发部
  '基础研发部': '基础研发部',
  '技术研发部': '基础研发部',
  '产品部': '基础研发部',
  'OA部': '基础研发部',
  '前端部': '基础研发部',
  
  // 收费事业部
  '收费系统研发部': '收费事业部',
  '结算系统研发部': '收费事业部',
  
  // 养护运维事业部
  '养护运维技术研发部': '养护运维事业部'
};

// 排除用户
const excludeUids = ['luguanyua'];

async function main() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    
    // 查询所有用户
    const users = await db.collection('users').find({}).toArray();
    
    // 查询所有组件
    const components = await db.collection('components').find({}).toArray();
    
    // 计算近7天时间戳
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // 统计每个用户的组件数（总数 + 近7天新增）
    const userStats = {};
    components.forEach(c => {
      const uid = c.userId || c.createdBy;
      if (!userStats[uid]) {
        userStats[uid] = { total: 0, recent: 0 };
      }
      userStats[uid].total++;
      
      // 判断是否近7天创建
      const createdAt = c.createdAt || c.createdTime;
      if (createdAt && new Date(createdAt) >= sevenDaysAgo) {
        userStats[uid].recent++;
      }
    });
    
    // 按一级部门分组
    const deptStats = {};
    let unmapped = [];
    
    users.forEach(u => {
      const uid = u.uid || u.username;
      if (excludeUids.includes(uid)) return;
      
      const pi = u.profileInfo || {};
      const deptName = (pi.deptName || '').trim() || '(未分组)';
      const level1Dept = deptMap[deptName] || null;
      
      if (!level1Dept) {
        unmapped.push({ uid, name: pi.name || uid, dept: deptName });
        return;
      }
      
      if (!deptStats[level1Dept]) {
        deptStats[level1Dept] = { registered: 0, generated: 0, components: 0, recent: 0 };
      }
      
      deptStats[level1Dept].registered++;
      const stats = userStats[uid] || { total: 0, recent: 0 };
      if (stats.total > 0) {
        deptStats[level1Dept].generated++;
      }
      deptStats[level1Dept].components += stats.total;
      deptStats[level1Dept].recent += stats.recent;
    });
    
    // 输出表格
    console.log('\n=== 统计结果 ===');
    console.log('一级部门                    注册人数    使用人数     组件总数   近7天新增');
    console.log('------------------------------------------------------------------------');
    
    let totalReg = 0, totalGen = 0, totalComp = 0, totalRecent = 0;
    Object.keys(deptStats).sort().forEach(dept => {
      const s = deptStats[dept];
      console.log(`${dept.padEnd(20)} ${String(s.registered).padStart(8)} ${String(s.generated).padStart(10)} ${String(s.components).padStart(10)} ${String(s.recent).padStart(10)}`);
      totalReg += s.registered;
      totalGen += s.generated;
      totalComp += s.components;
      totalRecent += s.recent;
    });
    
    console.log('------------------------------------------------------------------------');
    console.log(`${'合计'.padEnd(20)} ${String(totalReg).padStart(8)} ${String(totalGen).padStart(10)} ${String(totalComp).padStart(10)} ${String(totalRecent).padStart(10)}`);
    
    if (unmapped.length > 0) {
      console.log('\n=== 未映射用户 ===');
      unmapped.forEach(u => console.log(`${u.name} uid=${u.uid} dept=[${u.dept}]`));
    }
    
    // 输出 JSON
    console.log('\n=== JSON DATA START ===');
    console.log(JSON.stringify({ 
      deptStats, 
      totalReg, 
      totalGen, 
      totalComp, 
      totalRecent,
      unmapped,
      queryTime: now.toISOString(),
      sevenDaysAgo: sevenDaysAgo.toISOString()
    }, null, 2));
    console.log('=== JSON DATA END ===');
    
  } finally {
    await client.close();
  }
}

main().catch(console.error);
