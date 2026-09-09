import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { encryptField, decryptField } from '../common/crypto/field-encryption';

export type UserAiConfigDocument = UserAiConfig & Document;

/**
 * 按用户持久化的 AI/API 配置。
 *
 * 安全:config 明文通过虚拟字段 `config` 透明桥接,实际落库为 `configEnc`(AES-256-GCM 密文),
 * MongoDB 中不存在明文 API Key / Token。
 *
 * 迁移:旧文档含明文 `config` 字段,由 scripts/migrate-encrypt-secrets.ts 迁移至 configEnc 后删除。
 */
@Schema({ collection: 'user_ai_configs', timestamps: true })
export class UserAiConfig {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  userId: Types.ObjectId;

  // 密文存储;明文由虚拟字段 `config` 透明桥接,不落库
  @Prop({ type: String, default: null })
  configEnc?: string | null;
}

export const UserAiConfigSchema = SchemaFactory.createForClass(UserAiConfig);

// 虚拟字段:明文视图(读取时解密,赋值时加密写入 configEnc),不持久化明文
UserAiConfigSchema.virtual('config')
  .get(function (this: UserAiConfigDocument) {
    if (this.configEnc == null) return {};
    try {
      return JSON.parse(decryptField(this.configEnc));
    } catch (e) {
      console.error(
        `[UserAiConfig] configEnc 解密失败(userId=${this.userId}): ${e instanceof Error ? e.message : e}. 请检查 FIELD_ENCRYPTION_KEY 是否与写入时一致。`,
      );
      return {};
    }
  })
  .set(function (this: UserAiConfigDocument, val: Record<string, any>) {
    this.configEnc =
      val && Object.keys(val ?? {}).length ? encryptField(JSON.stringify(val)) : null;
  });

UserAiConfigSchema.set('toJSON', { virtuals: true });
UserAiConfigSchema.set('toObject', { virtuals: true });
