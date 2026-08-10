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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const bcrypt = __importStar(require("bcrypt"));
const user_schema_1 = require("../schemas/user.schema");
const group_schema_1 = require("../schemas/group.schema");
const group_member_schema_1 = require("../schemas/group-member.schema");
let AuthService = class AuthService {
    userModel;
    groupModel;
    groupMemberModel;
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
        const { Types } = require('mongoose');
        const membership = await this.groupMemberModel
            .findOne({ userId: new Types.ObjectId(userId) })
            .lean()
            .exec();
        if (!membership)
            return null;
        const group = await this.groupModel.findById(membership.groupId).lean().exec();
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
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(1, (0, mongoose_1.InjectModel)(group_schema_1.Group.name)),
    __param(2, (0, mongoose_1.InjectModel)(group_member_schema_1.GroupMember.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], AuthService);
//# sourceMappingURL=auth.service.js.map