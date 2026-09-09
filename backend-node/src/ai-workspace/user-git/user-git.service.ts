import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiGitCredential, AiGitCredentialDocument } from '../schemas/ai-git-credential.schema';
import { SaveGitCredentialDto } from './dto/user-git.dto';
import { encryptField, decryptField } from '../../common/crypto/field-encryption';

@Injectable()
export class AiUserGitService {
  private readonly logger = new Logger(AiUserGitService.name);

  constructor(
    @InjectModel(AiGitCredential.name)
    private credentialModel: Model<AiGitCredentialDocument>,
  ) {}

  async getStatus(userId: string) {
    const cred = await this.credentialModel.findOne({
      userId: new Types.ObjectId(userId),
    }).exec();
    if (!cred) return { configured: false };
    return {
      configured: true,
      type: cred.type,
      description: cred.description,
      updatedAt: (cred as any).updatedAt,
    };
  }

  /**
   * 获取解密后的明文 PAT（仅用于本系统内部 GitLab 推送等场景）
   */
  async getToken(userId: string) {
    const cred = await this.credentialModel.findOne({
      userId: new Types.ObjectId(userId),
    }).exec();
    if (!cred || !cred.tokenEnc) return { configured: false, token: '' };
    return {
      configured: true,
      token: decryptField(cred.tokenEnc),
    };
  }

  async save(userId: string, dto: SaveGitCredentialDto) {
    const tokenEnc = dto.token ? encryptField(dto.token) : null;
    const cred = await this.credentialModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          type: dto.type,
          tokenEnc,
          description: dto.description || '',
        },
      },
      { upsert: true, returnDocument: 'after' },
    ).exec();
    return { configured: true, type: cred.type };
  }

  async delete(userId: string) {
    await this.credentialModel.deleteOne({ userId: new Types.ObjectId(userId) }).exec();
    return { configured: false };
  }
}
