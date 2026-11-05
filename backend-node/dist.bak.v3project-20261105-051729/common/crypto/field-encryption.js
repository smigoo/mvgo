"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptField = encryptField;
exports.decryptField = decryptField;
const crypto = __importStar(require("node:crypto"));
const ALGORITHM = 'aes-256-gcm';
const KEY_ENV = 'FIELD_ENCRYPTION_KEY';
function deriveKey(raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw))
        return Buffer.from(raw, 'hex');
    if (/^[A-Za-z0-9+/]{43}={0,2}$/.test(raw))
        return Buffer.from(raw, 'base64');
    return crypto.createHash('sha256').update(raw).digest();
}
function loadKey() {
    const raw = process.env[KEY_ENV];
    if (!raw) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error(`[启动失败] 生产环境必须设置 ${KEY_ENV}(32 字节 hex/base64),禁止明文存储敏感字段。`);
        }
        console.warn(`[安全告警] 未设置 ${KEY_ENV},使用开发派生密钥,请勿用于生产环境。`);
        return crypto.createHash('sha256').update('dev-field-encryption-key').digest();
    }
    return deriveKey(raw);
}
const KEY = loadKey();
function encryptField(plaintext) {
    if (plaintext == null)
        return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}
function decryptField(payload) {
    if (!payload)
        return '';
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
//# sourceMappingURL=field-encryption.js.map