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
exports.WorkbenchGroupSchema = exports.WorkbenchGroup = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let WorkbenchGroup = class WorkbenchGroup {
    userId;
    name;
    order;
};
exports.WorkbenchGroup = WorkbenchGroup;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], WorkbenchGroup.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true }),
    __metadata("design:type", String)
], WorkbenchGroup.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0 }),
    __metadata("design:type", Number)
], WorkbenchGroup.prototype, "order", void 0);
exports.WorkbenchGroup = WorkbenchGroup = __decorate([
    (0, mongoose_1.Schema)({ collection: 'workbench_groups', timestamps: true })
], WorkbenchGroup);
exports.WorkbenchGroupSchema = mongoose_1.SchemaFactory.createForClass(WorkbenchGroup);
exports.WorkbenchGroupSchema.index({ userId: 1, name: 1 }, { unique: true });
//# sourceMappingURL=group.schema.js.map