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
exports.DocumentSchema = exports.Document = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let Document = class Document extends mongoose_2.Document {
    title;
    content;
    type;
    ownerId;
    groupId;
    visibility;
    tags;
    status;
    lastEditedBy;
};
exports.Document = Document;
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Document.prototype, "title", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, type: String }),
    __metadata("design:type", String)
], Document.prototype, "content", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'other' }),
    __metadata("design:type", String)
], Document.prototype, "type", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Document.prototype, "ownerId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Group', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Document.prototype, "groupId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'private' }),
    __metadata("design:type", String)
], Document.prototype, "visibility", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], Document.prototype, "tags", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'draft' }),
    __metadata("design:type", String)
], Document.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Document.prototype, "lastEditedBy", void 0);
exports.Document = Document = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], Document);
exports.DocumentSchema = mongoose_1.SchemaFactory.createForClass(Document);
//# sourceMappingURL=document.schema.js.map