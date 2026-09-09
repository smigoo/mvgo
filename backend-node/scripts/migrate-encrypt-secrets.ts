/**
 * 存量敏感字段加密迁移脚本。
 *
 * 背景:UserAiConfig.config / AiGitCredential.token 原先明文落库。
 * 现 schema 改为虚拟字段 + configEnc/tokenEnc 密文存储(见 field-encryption.ts)。
 * 本脚本将旧文档中的明文 config/token 加密写入 configEnc/tokenEnc,并删除明文副本。
 *
 * 使用:
 *   1) 在执行环境设置 MONGODB_URI 与 FIELD_ENCRYPTION_KEY(与后端一致)
 *   2) 建议先对集合备份
 *   3) NODE_ENV=production npx ts-node scripts/migrate-encrypt-secrets.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import mongoose from 'mongoose';
import { UserAiConfig, UserAiConfigSchema } from '../src/schemas/user-ai-config.schema';
import { AiGitCredential, AiGitCredentialSchema } from '../src/ai-workspace/schemas/ai-git-credential.schema';
import { encryptField } from '../src/common/crypto/field-encryption';

const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`), override: true });

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[迁移失败] 未设置 MONGODB_URI');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('[迁移] 已连接 MongoDB');

  const UserAiConfigModel = mongoose.model('UserAiConfig', UserAiConfigSchema);
  const AiGitCredModel = mongoose.model('AiGitCredential', AiGitCredentialSchema);

  // 1) UserAiConfig.config(明文) -> configEnc(密文)
  const cfgDocs = await UserAiConfigModel.find({
    configEnc: null,
    config: { $exists: true, $ne: null },
  }).lean({ virtuals: false });
  let cfgMigrated = 0;
  for (const d of cfgDocs) {
    const plain = (d as any).config;
    if (!plain) continue;
    await UserAiConfigModel.updateOne(
      { _id: (d as any)._id },
      { $set: { configEnc: encryptField(JSON.stringify(plain)) }, $unset: { config: '' } },
    );
    cfgMigrated++;
  }
  console.log(`[迁移] UserAiConfig: ${cfgMigrated}/${cfgDocs.length} 条已加密`);

  // 2) AiGitCredential.token(明文) -> tokenEnc(密文)
  const gitDocs = await AiGitCredModel.find({
    tokenEnc: null,
    token: { $exists: true, $ne: null },
  }).lean({ virtuals: false });
  let gitMigrated = 0;
  for (const d of gitDocs) {
    const plain = (d as any).token;
    if (!plain) continue;
    await AiGitCredModel.updateOne(
      { _id: (d as any)._id },
      { $set: { tokenEnc: encryptField(plain) }, $unset: { token: '' } },
    );
    gitMigrated++;
  }
  console.log(`[迁移] AiGitCredential: ${gitMigrated}/${gitDocs.length} 条已加密`);

  await mongoose.disconnect();
  console.log('[迁移] 完成');
}

main().catch((e) => {
  console.error('[迁移] 异常:', e);
  process.exit(1);
});
