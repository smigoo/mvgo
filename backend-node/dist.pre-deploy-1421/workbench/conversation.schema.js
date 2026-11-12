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
exports.ConversationSchema = exports.Conversation = exports.ConversationGroupSchema = exports.ConversationGroup = exports.MessageSchema = exports.Message = exports.MessageCardSchema = exports.MessageCard = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let MessageCard = class MessageCard {
    type;
    data;
};
exports.MessageCard = MessageCard;
__decorate([
    (0, mongoose_1.Prop)({ type: String, enum: ['progress', 'preview', 'confirm', 'diff', 'stats', 'list', 'action'], required: true }),
    __metadata("design:type", String)
], MessageCard.prototype, "type", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, required: true }),
    __metadata("design:type", Object)
], MessageCard.prototype, "data", void 0);
exports.MessageCard = MessageCard = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], MessageCard);
exports.MessageCardSchema = mongoose_1.SchemaFactory.createForClass(MessageCard);
let Message = class Message {
    id;
    role;
    content;
    cards;
    createdAt;
    toolCallId;
    metadata;
};
exports.Message = Message;
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true }),
    __metadata("design:type", String)
], Message.prototype, "id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, enum: ['user', 'assistant', 'system'], required: true }),
    __metadata("design:type", String)
], Message.prototype, "role", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String }),
    __metadata("design:type", String)
], Message.prototype, "content", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [exports.MessageCardSchema], default: [] }),
    __metadata("design:type", Array)
], Message.prototype, "cards", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, default: Date.now }),
    __metadata("design:type", Date)
], Message.prototype, "createdAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String }),
    __metadata("design:type", String)
], Message.prototype, "toolCallId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object }),
    __metadata("design:type", Object)
], Message.prototype, "metadata", void 0);
exports.Message = Message = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], Message);
exports.MessageSchema = mongoose_1.SchemaFactory.createForClass(Message);
let ConversationGroup = class ConversationGroup {
    name;
    color;
    order;
};
exports.ConversationGroup = ConversationGroup;
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true }),
    __metadata("design:type", String)
], ConversationGroup.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String }),
    __metadata("design:type", String)
], ConversationGroup.prototype, "color", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0 }),
    __metadata("design:type", Number)
], ConversationGroup.prototype, "order", void 0);
exports.ConversationGroup = ConversationGroup = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], ConversationGroup);
exports.ConversationGroupSchema = mongoose_1.SchemaFactory.createForClass(ConversationGroup);
let Conversation = class Conversation {
    conversationId;
    userId;
    title;
    messages;
    currentComponentId;
    context;
    lastActiveAt;
    messageCount;
    group;
    pinned;
    toolCredentials;
    shared;
    sharedWith;
};
exports.Conversation = Conversation;
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true, index: true }),
    __metadata("design:type", String)
], Conversation.prototype, "conversationId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Conversation.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true }),
    __metadata("design:type", String)
], Conversation.prototype, "title", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [exports.MessageSchema], default: [] }),
    __metadata("design:type", Array)
], Conversation.prototype, "messages", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, index: true }),
    __metadata("design:type", String)
], Conversation.prototype, "currentComponentId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: {} }),
    __metadata("design:type", Object)
], Conversation.prototype, "context", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], Conversation.prototype, "lastActiveAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0 }),
    __metadata("design:type", Number)
], Conversation.prototype, "messageCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, index: true }),
    __metadata("design:type", String)
], Conversation.prototype, "group", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Boolean, default: false }),
    __metadata("design:type", Boolean)
], Conversation.prototype, "pinned", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: {
            figmaToken: { type: String },
            apifoxToken: { type: String },
            gitlabToken: { type: String },
            gitlabProjectUrl: { type: String },
        },
        default: {},
    }),
    __metadata("design:type", Object)
], Conversation.prototype, "toolCredentials", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Boolean, default: false }),
    __metadata("design:type", Boolean)
], Conversation.prototype, "shared", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [{ type: mongoose_2.Types.ObjectId, ref: 'User' }], default: [] }),
    __metadata("design:type", Array)
], Conversation.prototype, "sharedWith", void 0);
exports.Conversation = Conversation = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], Conversation);
exports.ConversationSchema = mongoose_1.SchemaFactory.createForClass(Conversation);
exports.ConversationSchema.index({ userId: 1, lastActiveAt: -1 });
exports.ConversationSchema.index({ 'context.currentComponentId': 1 });
//# sourceMappingURL=conversation.schema.js.map