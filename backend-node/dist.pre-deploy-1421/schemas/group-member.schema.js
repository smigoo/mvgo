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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupMemberSchema = exports.GroupMember = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let GroupMember = class GroupMember {
    groupId;
    userId;
    role;
    permissions;
    joinedAt;
};
exports.GroupMember = GroupMember;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Group', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], GroupMember.prototype, "groupId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], GroupMember.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: ['admin', 'member'], default: 'member' }),
    __metadata("design:type", String)
], GroupMember.prototype, "role", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], GroupMember.prototype, "permissions", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", Date)
], GroupMember.prototype, "joinedAt", void 0);
exports.GroupMember = GroupMember = __decorate([
    (0, mongoose_1.Schema)({ collection: 'group_members', timestamps: true })
], GroupMember);
exports.GroupMemberSchema = mongoose_1.SchemaFactory.createForClass(GroupMember);
exports.GroupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });
//# sourceMappingURL=group-member.schema.js.map