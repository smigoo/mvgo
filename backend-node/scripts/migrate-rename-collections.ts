/**
 * 集合名规范化迁移脚本(对齐框架3.0: snake_case 集合名)。
 *
 * 现状: Mongoose 自动集合名为连写驼峰(如 userai_configs / groupmembers),
 * 不符合 snake_case 规范。本脚本将旧集合重命名为 snake_case。
 *
 * ⚠️ 破坏性 + 需停机:
 *   1) 先停止后端(避免写入旧集合)
 *   2) 给后端 schema 加 `collection: '<snake_case>'` 选项(见各 schema 注释的目标名)
 *   3) 运行本脚本 renameCollection
 *   4) 再启动改名后的后端
 *
 * 使用: NODE_ENV=production npx ts-node scripts/migrate-rename-collections.ts
 */
import * as dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('[迁移失败] 未设置 MONGODB_URI');
  process.exit(1);
}

// 旧集合名(Mongoose 默认 pluralize) -> 目标 snake_case 名
const RENAME_MAP: Record<string, string> = {
  users: 'users',
  groups: 'groups',
  groupmembers: 'group_members',
  joinrequests: 'join_requests',
  components: 'components',
  tokenusages: 'token_usages',
  userai_configs: 'user_ai_configs',
  operationlogs: 'operation_logs',
  documents: 'documents',
  aigitcredentials: 'ai_git_credentials',
  aiprojects: 'ai_projects',
  aisessions: 'ai_sessions',
  aidocuments: 'ai_documents',
  aiskills: 'ai_skills',
};

async function main() {
  const client = new MongoClient(uri as string);
  await client.connect();
  const db = client.db();

  const cols = await db.listCollections().toArray();
  const existing = new Set(cols.map((c) => c.name));

  let renamed = 0;
  for (const [from, to] of Object.entries(RENAME_MAP)) {
    if (from === to) continue;
    if (!existing.has(from)) {
      console.log(`[跳过] 源集合不存在: ${from}`);
      continue;
    }
    if (existing.has(to)) {
      console.warn(`[跳过] 目标已存在: ${to}（请人工核对）`);
      continue;
    }
    await db.renameCollection(from, to);
    renamed++;
    console.log(`[完成] ${from} -> ${to}`);
  }

  await client.close();
  console.log(`[迁移] 共重命名 ${renamed} 个集合`);
}

main().catch((e) => {
  console.error('[迁移] 异常:', e);
  process.exit(1);
});
