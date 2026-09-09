import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { encryptField, decryptField } from '../../common/crypto/field-encryption';

export type AiGitCredentialDocument = AiGitCredential & Document;

/**
 * 用户级 Git 凭证(PAT)。
 *
 * 安全:token 明文通过虚拟字段 `token` 透明桥接,实际落库为 `tokenEnc`(AES-256-GCM 密文),
 * MongoDB 中不存在明文 PAT。
 *
 * 迁移:旧文档含明文 `token` 字段,由 scripts/migrate-encrypt-secrets.ts 迁移至 tokenEnc 后删除。
 */
@Schema({ collection: 'ai_git_credentials', timestamps: true })
export class AiGitCredential {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ default: 'pat' })
  type: string;

  // 密文存储;明文由虚拟字段 `token` 透明桥接,不落库
  @Prop({ type: String, default: null })
  tokenEnc?: string | null;

  @Prop({ default: '' })
  description: string;
}

export const AiGitCredentialSchema = SchemaFactory.createForClass(AiGitCredential);

// 虚拟字段:明文视图(读取时解密,赋值时加密写入 tokenEnc),不持久化明文
AiGitCredentialSchema.virtual('token')
  .get(function (this: AiGitCredentialDocument) {
    if (this.tokenEnc == null) return '';
    try {
      return decryptField(this.tokenEnc);
    } catch {
      return '';
    }
  })
  .set(function (this: AiGitCredentialDocument, val: string) {
    this.tokenEnc = val ? encryptField(val) : null;
  });

AiGitCredentialSchema.set('toJSON', { virtuals: true });
AiGitCredentialSchema.set('toObject', { virtuals: true });
