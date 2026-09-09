const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/workbuddy_code_ai';
  console.log('连接:', uri);
  
  await mongoose.connect(uri);
  console.log('已连接');

  const collections = ['ai-workspace-sessions', 'ai_sessions', 'ai_git_credentials', 'ai-git-credentials'];
  
  for (const name of collections) {
    try {
      const db = mongoose.connection.db;
      const indexes = await db.collection(name).indexes();
      console.log(`\n[${name}] 索引:`);
      console.log(JSON.stringify(indexes, null, 2));
      
      // 删除所有非 _id 索引
      const toDrop = indexes.filter(i => i.name !== '_id_');
      for (const idx of toDrop) {
        await db.collection(name).dropIndex(idx.name);
        console.log(`  已删除: ${idx.name}`);
      }
    } catch (e) {
      console.log(`[${name}] ${e.message}`);
    }
  }

  await mongoose.disconnect();
  console.log('\n完成');
}

main().catch(e => { console.error(e); process.exit(1); });
