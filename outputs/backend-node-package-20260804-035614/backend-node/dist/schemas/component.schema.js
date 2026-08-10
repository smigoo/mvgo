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
exports.ComponentSchema = exports.Component = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let Component = class Component {
    componentId;
    taskId;
    target;
    name;
    description;
    creatorId;
    groupId;
    metadata;
    createdAt;
};
exports.Component = Component;
__decorate([
    (0, mongoose_1.Prop)({ index: true, sparse: true }),
    __metadata("design:type", String)
], Component.prototype, "componentId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ index: true, sparse: true }),
    __metadata("design:type", String)
], Component.prototype, "taskId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: ['microcode', 'vue3'] }),
    __metadata("design:type", String)
], Component.prototype, "target", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Component.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '' }),
    __metadata("design:type", String)
], Component.prototype, "description", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Component.prototype, "creatorId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Group', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Component.prototype, "groupId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object }),
    __metadata("design:type", Object)
], Component.prototype, "metadata", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", Date)
], Component.prototype, "createdAt", void 0);
exports.Component = Component = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], Component);
exports.ComponentSchema = mongoose_1.SchemaFactory.createForClass(Component);
//# sourceMappingURL=component.schema.js.map