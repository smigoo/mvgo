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
const dotenv = __importStar(require("dotenv"));
const mongodb_1 = require("mongodb");
dotenv.config();
const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error('[迁移失败] 未设置 MONGODB_URI');
    process.exit(1);
}
const RENAME_MAP = {
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
    const client = new mongodb_1.MongoClient(uri);
    await client.connect();
    const db = client.db();
    const cols = await db.listCollections().toArray();
    const existing = new Set(cols.map((c) => c.name));
    let renamed = 0;
    for (const [from, to] of Object.entries(RENAME_MAP)) {
        if (from === to)
            continue;
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
//# sourceMappingURL=migrate-rename-collections.js.map