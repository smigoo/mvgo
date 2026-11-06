"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QSPermissionAdapter = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const axios_1 = __importDefault(require("axios"));
const user_schema_1 = require("../schemas/user.schema");
const group_member_schema_1 = require("../schemas/group-member.schema");
const permission_adapter_interface_1 = require("./permission-adapter.interface");
const permission_constants_1 = require("./permission.constants");
const constants_1 = require("../common/constants");
let QSPermissionAdapter = class QSPermissionAdapter extends permission_adapter_interface_1.PermissionAdapter {
    userModel;
    groupMemberModel;
    cache = new Map();
    permissionUrl = (() => {
        const base = process.env.PORTAL_BASE_URL;
        if (base)
            return `${base.replace(/\/$/, '')}/getUserAuths`;
        return process.env.PORTAL_PERMISSION_URL || null;
    })();
    uidParam = process.env.PORTAL_PERMISSION_UID_PARAM || 'uid';
    adminCodes = (process.env.QS_ADMIN_CODES || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    mapping = this.parseMapping(process.env.QS_PERMISSION_MAPPING);
    defaultPerms = (process.env.QS_DEFAULT_PERMISSIONS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    ttl = (Number(process.env.QS_PERMISSION_CACHE_TTL) || 300) * 1000;
    constructor(userModel, groupMemberModel) {
        super();
        this.userModel = userModel;
        this.groupMemberModel = groupMemberModel;
    }
    async checkPermission(userId, permCode) {
        const { role, permissions } = await this.getUserPermissions(userId);
        if (role === constants_1.ROLES.ADMIN)
            return true;
        return permissions.includes(permCode);
    }
    async getUserPermissions(userId) {
        const cached = this.cache.get(userId);
        if (cached && cached.exp > Date.now())
            return cached.data;
        const user = await this.userModel.findById(userId).lean().exec();
        const uid = user?.portalInfo?.uid;
        if (!uid || !this.permissionUrl) {
            const fb = await this.localFallback(userId);
            this.setCache(userId, fb);
            return fb;
        }
        try {
            const resp = await axios_1.default.get(this.permissionUrl, {
                params: { [this.uidParam]: uid },
                timeout: 5000,
            });
            const portalCodes = this.extractPortalCodes(resp.data);
            const { permissions, isAdmin } = this.mapToSystemPermissions(portalCodes);
            const data = { role: isAdmin ? constants_1.ROLES.ADMIN : constants_1.ROLES.MEMBER, permissions };
            this.setCache(userId, data);
            return data;
        }
        catch (err) {
            const fb = await this.localFallback(userId);
            return fb;
        }
    }
    setCache(userId, data) {
        this.cache.set(userId, { exp: Date.now() + this.ttl, data });
    }
    async localFallback(userId) {
        const membership = await this.groupMemberModel
            .findOne({ userId: new mongoose_2.Types.ObjectId(userId) })
            .lean()
            .exec();
        if (!membership)
            return { role: constants_1.ROLES.MEMBER, permissions: [] };
        if (membership.role === constants_1.ROLES.ADMIN) {
            return { role: constants_1.ROLES.ADMIN, permissions: permission_constants_1.ALL_PERMISSIONS };
        }
        return {
            role: membership.role,
            permissions: membership.permissions || [],
        };
    }
    extractPortalCodes(data) {
        let raw = data;
        if (data && typeof data === 'object') {
            raw =
                data.data?.auths ||
                    data.data?.list ||
                    data.data?.permissions ||
                    data.data ||
                    data.auths ||
                    data.list ||
                    data.permissions ||
                    data;
        }
        if (!Array.isArray(raw))
            return [];
        return raw
            .map((item) => (typeof item === 'string' ? item : item?.code))
            .filter(Boolean);
    }
    mapToSystemPermissions(portalCodes) {
        const set = new Set();
        let isAdmin = false;
        for (const code of portalCodes) {
            if (this.adminCodes.includes(code)) {
                isAdmin = true;
                break;
            }
            const wildcard = this.mapping['*'];
            if (wildcard)
                wildcard.forEach((p) => set.add(p));
            const mapped = this.mapping[code];
            if (mapped)
                mapped.forEach((p) => set.add(p));
        }
        if (isAdmin) {
            return { permissions: permission_constants_1.ALL_PERMISSIONS, isAdmin: true };
        }
        this.defaultPerms.forEach((p) => set.add(p));
        return { permissions: Array.from(set), isAdmin: false };
    }
    parseMapping(raw) {
        const map = {};
        if (!raw)
            return map;
        try {
            const obj = JSON.parse(raw);
            for (const [k, v] of Object.entries(obj)) {
                if (typeof v === 'string') {
                    map[k] = v
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                }
                else if (Array.isArray(v)) {
                    map[k] = v.map((s) => String(s).trim()).filter(Boolean);
                }
            }
        }
        catch {
        }
        return map;
    }
};
exports.QSPermissionAdapter = QSPermissionAdapter;
exports.QSPermissionAdapter = QSPermissionAdapter = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(1, (0, mongoose_1.InjectModel)(group_member_schema_1.GroupMember.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model])
], QSPermissionAdapter);
//# sourceMappingURL=qs-permission-adapter.js.map