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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("node:path"));
const mongoose_1 = __importDefault(require("mongoose"));
const user_ai_config_schema_1 = require("../src/schemas/user-ai-config.schema");
const ai_git_credential_schema_1 = require("../src/ai-workspace/schemas/ai-git-credential.schema");
const field_encryption_1 = require("../src/common/crypto/field-encryption");
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`), override: true });
async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('[迁移失败] 未设置 MONGODB_URI');
        process.exit(1);
    }
    await mongoose_1.default.connect(uri);
    console.log('[迁移] 已连接 MongoDB');
    const UserAiConfigModel = mongoose_1.default.model('UserAiConfig', user_ai_config_schema_1.UserAiConfigSchema);
    const AiGitCredModel = mongoose_1.default.model('AiGitCredential', ai_git_credential_schema_1.AiGitCredentialSchema);
    const cfgDocs = await UserAiConfigModel.find({
        configEnc: null,
        config: { $exists: true, $ne: null },
    }).lean({ virtuals: false });
    let cfgMigrated = 0;
    for (const d of cfgDocs) {
        const plain = d.config;
        if (!plain)
            continue;
        await UserAiConfigModel.updateOne({ _id: d._id }, { $set: { configEnc: (0, field_encryption_1.encryptField)(JSON.stringify(plain)) }, $unset: { config: '' } });
        cfgMigrated++;
    }
    console.log(`[迁移] UserAiConfig: ${cfgMigrated}/${cfgDocs.length} 条已加密`);
    const gitDocs = await AiGitCredModel.find({
        tokenEnc: null,
        token: { $exists: true, $ne: null },
    }).lean({ virtuals: false });
    let gitMigrated = 0;
    for (const d of gitDocs) {
        const plain = d.token;
        if (!plain)
            continue;
        await AiGitCredModel.updateOne({ _id: d._id }, { $set: { tokenEnc: (0, field_encryption_1.encryptField)(plain) }, $unset: { token: '' } });
        gitMigrated++;
    }
    console.log(`[迁移] AiGitCredential: ${gitMigrated}/${gitDocs.length} 条已加密`);
    await mongoose_1.default.disconnect();
    console.log('[迁移] 完成');
}
main().catch((e) => {
    console.error('[迁移] 异常:', e);
    process.exit(1);
});
//# sourceMappingURL=migrate-encrypt-secrets.js.map