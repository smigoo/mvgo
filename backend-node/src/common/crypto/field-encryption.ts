import * as crypto from 'node:crypto';

/**
 * 字段级对称加密工具(AES-256-GCM)。
 * 用于数据库敏感字段落库加密:UserAiConfig.config、AiGitCredential.token 等,
 * 避免 API Key / Git PAT 等明文进入 MongoDB。
 *
 * 密文格式: base64(iv) . base64(authTag) . base64(ciphertext)
 * 密钥来源: 环境变量 FIELD_ENCRYPTION_KEY(生产必填,32 字节 hex/base64)。
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_ENV = 'FIELD_ENCRYPTION_KEY';

function deriveKey(raw: string): Buffer {
  // 支持 32 字节 hex / 44 字节 base64,其余按 utf8 再 sha256 补齐到 32 字节
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  if (/^[A-Za-z0-9+/]{43}={0,2}$/.test(raw)) return Buffer.from(raw, 'base64');
  return crypto.createHash('sha256').update(raw).digest();
}

function loadKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `[启动失败] 生产环境必须设置 ${KEY_ENV}(32 字节 hex/base64),禁止明文存储敏感字段。`,
      );
    }
    console.warn(`[安全告警] 未设置 ${KEY_ENV},使用开发派生密钥,请勿用于生产环境。`);
    return crypto.createHash('sha256').update('dev-field-encryption-key').digest();
  }
  return deriveKey(raw);
}

// 模块加载即定密钥;生产缺密钥时启动即失败(与 session 密钥策略一致)
const KEY = loadKey();

export function encryptField(plaintext: string): string {
  if (plaintext == null) return null as unknown as string;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptField(payload: string): string {
  if (!payload) return '';
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('密文格式非法,无法解密');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}
