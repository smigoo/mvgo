"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.softDeletePlugin = softDeletePlugin;
const mongoose_1 = __importDefault(require("mongoose"));
function softDeletePlugin(schema) {
    schema.add({ deleted: { type: Boolean, default: false, index: true } });
    const filterDeleted = function () {
        const query = this.getQuery ? this.getQuery() : {};
        if (query.deleted === undefined) {
            this.where({ deleted: { $ne: true } });
        }
    };
    schema.pre('find', filterDeleted);
    schema.pre('findOne', filterDeleted);
    schema.pre('countDocuments', filterDeleted);
    schema.methods.softDelete = function () {
        this.deleted = true;
        return this.save();
    };
    schema.statics.softDelete = function (filter) {
        return this.updateMany(filter, { $set: { deleted: true } });
    };
}
mongoose_1.default.plugin(softDeletePlugin);
//# sourceMappingURL=soft-delete.plugin.js.map