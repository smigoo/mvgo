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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const bcrypt = __importStar(require("bcrypt"));
const user_schema_1 = require("../schemas/user.schema");
const group_schema_1 = require("../schemas/group.schema");
const group_member_schema_1 = require("../schemas/group-member.schema");
const permission_constants_1 = require("./permission.constants");
const constants_1 = require("../common/constants");
const axios_1 = __importDefault(require("axios"));
let AuthService = class AuthService {
    static { AuthService_1 = this; }
    userModel;
    groupModel;
    groupMemberModel;
    logger = new common_1.Logger(AuthService_1.name);
    privateGroupCache = new Map();
    static PRIVATE_GROUP_CACHE_TTL_MS = 5 * 60 * 1000;
    constructor(userModel, groupModel, groupMemberModel) {
        this.userModel = userModel;
        this.groupModel = groupModel;
        this.groupMemberModel = groupMemberModel;
    }
    async register(registerDto) {
        const { username, password } = registerDto;
        const existingUser = await this.userModel.findOne({ username });
        if (existingUser) {
            throw new common_1.ConflictException('用户名已存在');
        }
        const user = new this.userModel({
            username,
            password,
        });
        await user.save();
        return user;
    }
    async validateUser(loginDto) {
        const { username, password } = loginDto;
        const user = await this.userModel.findOne({ username });
        if (!user) {
            throw new common_1.UnauthorizedException('用户名或密码错误');
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new common_1.UnauthorizedException('用户名或密码错误');
        }
        return user;
    }
    async findById(userId) {
        return this.userModel.findById(userId);
    }
    async getUserGroup(userId) {
        const membership = await this.groupMemberModel
            .findOne({ userId: new mongoose_2.Types.ObjectId(userId) })
            .lean()
            .exec();
        if (!membership)
            return null;
        const group = await this.groupModel.findById(membership.groupId).lean().exec();
        return group;
    }
    async ensureUserPrivateGroup(userId, uid, displayName) {
        const cacheKey = String(userId);
        const cached = this.privateGroupCache.get(cacheKey);
        if (cached &&
            Date.now() - cached.at < AuthService_1.PRIVATE_GROUP_CACHE_TTL_MS) {
            return cached.group;
        }
        const name = `私人空间:${uid}`;
        let group = await this.groupModel.findOne({ name }).exec();
        if (!group) {
            group = await this.groupModel.create({
                name,
                description: '系统自动创建的私人工作空间',
                adminId: new mongoose_2.Types.ObjectId(userId),
            });
            this.logger.log(`✅ 已为用户 ${displayName} (uid=${uid}) 创建私人工作空间`);
        }
        await this.groupMemberModel
            .findOneAndUpdate({ groupId: group._id, userId: new mongoose_2.Types.ObjectId(userId) }, {
            $setOnInsert: {
                role: constants_1.ROLES.ADMIN,
                permissions: permission_constants_1.ALL_PERMISSIONS,
                joinedAt: new Date(),
            },
        }, { upsert: true, returnDocument: 'after' })
            .exec();
        this.privateGroupCache.set(cacheKey, { group, at: Date.now() });
        return group;
    }
    async changePassword(username, oldPassword, newPassword) {
        const user = await this.userModel.findOne({ username });
        if (!user) {
            throw new common_1.UnauthorizedException('用户不存在');
        }
        const isOldValid = await bcrypt.compare(oldPassword, user.password);
        if (!isOldValid) {
            throw new common_1.UnauthorizedException('原密码不正确');
        }
        user.password = newPassword;
        await user.save();
    }
    async findOrCreateByPortalToken(token) {
        const portalBaseUrl = process.env.PORTAL_BASE_URL;
        const verifyUrl = (portalBaseUrl ? `${portalBaseUrl.replace(/\/$/, '')}/getTokenUser` : null) ||
            process.env.PORTAL_TOKEN_VERIFY_URL ||
            null;
        if (!verifyUrl) {
            this.logger.warn('⚠️ PORTAL_BASE_URL/PORTAL_TOKEN_VERIFY_URL 未配置，门户 token 自动登录不可用（fail-closed）');
            return null;
        }
        try {
            const resp = await axios_1.default.get(verifyUrl, {
                params: { token },
                timeout: 5000,
                proxy: false,
            });
            if (resp.data?.code !== 200 || !resp.data?.data) {
                this.logger.warn(`门户 token 校验失败: code=${resp.data?.code}, message=${resp.data?.message || '未知'}`);
                return null;
            }
            const data = resp.data.data;
            const uid = data?.uid;
            const username = data?.account || data?.uid;
            const displayName = data?.name || username;
            const expiresInSeconds = typeof data?.expirise === 'number' ? data.expirise : undefined;
            if (!uid || !username) {
                this.logger.warn('门户 token 校验响应缺少 uid/account，拒绝建号', {
                    sample: JSON.stringify(data).slice(0, 200),
                });
                return null;
            }
            let user = await this.userModel
                .findOneAndUpdate({ $or: [{ uid }, { username }] }, {
                $set: { uid, portalInfo: data, deleted: false },
                $setOnInsert: {
                    username,
                    password: Math.random().toString(36).slice(2),
                },
            }, { upsert: true, returnDocument: 'after' })
                .exec();
            if (!user) {
                this.logger.warn(`门户用户 upsert 失败: uid=${uid}, username=${username}`);
                return null;
            }
            await this.ensureUserPrivateGroup(user._id, uid, displayName);
            return { user, expiresInSeconds };
        }
        catch (err) {
            this.logger.warn(`门户 token 校验失败（fail-closed）: ${err.message}`);
            return null;
        }
    }
    async findOrCreateDevUser(token) {
        if (process.env.NODE_ENV === 'production')
            return null;
        if (process.env.DEV_AUTO_LOGIN !== 'true')
            return null;
        if (!token)
            return null;
        const uid = 'dev-local';
        const username = 'dev-local';
        try {
            let user = await this.userModel.findOne({ uid }).exec();
            if (!user) {
                user = await this.userModel.create({
                    username,
                    password: Math.random().toString(36).slice(2),
                    uid,
                    portalInfo: { dev: true, token },
                });
                this.logger.log(`✅ 开发态自动建号: 本地开发 (uid=${uid})`);
            }
            await this.ensureUserPrivateGroup(user._id, uid, username);
            return { user, expiresInSeconds: 28800 };
        }
        catch (err) {
            this.logger.warn(`开发态自动建号失败（fail-closed）: ${err.message}`);
            return null;
        }
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(1, (0, mongoose_1.InjectModel)(group_schema_1.Group.name)),
    __param(2, (0, mongoose_1.InjectModel)(group_member_schema_1.GroupMember.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], AuthService);
//# sourceMappingURL=auth.service.js.map