import mongoose from 'mongoose';

/**
 * 软删除插件(对齐公司框架3.0: 每个集合需有逻辑删除标记)。
 *
 * 全局注册后,所有 schema 自动获得:
 *   - deleted: Boolean 字段(默认 false,已建索引)
 *   - find / findOne / countDocuments / count 类查询自动过滤 deleted !== true
 *   - doc.softDelete() 实例方法、Model.softDelete(filter) 静态方法(逻辑删除)
 *
 * 物理删除需改为调用上述方法,避免数据被真实删除。
 * 注:aggregate 管道不受此插件自动过滤,需在聚合阶段自行处理。
 */
function softDeletePlugin(schema: mongoose.Schema) {
  schema.add({ deleted: { type: Boolean, default: false, index: true } });

  const filterDeleted = function (this: any) {
    const query = this.getQuery ? this.getQuery() : {};
    if (query.deleted === undefined) {
      this.where({ deleted: { $ne: true } });
    }
  };

  schema.pre('find', filterDeleted);
  schema.pre('findOne', filterDeleted);
  schema.pre('countDocuments', filterDeleted);

  schema.methods.softDelete = function () {
    (this as any).deleted = true;
    return this.save();
  };

  (schema.statics as any).softDelete = function (filter: Record<string, any>) {
    return (this as any).updateMany(filter, { $set: { deleted: true } });
  };
}

// 副作用导入即全局注册(需早于各 schema 的 SchemaFactory.createForClass)
mongoose.plugin(softDeletePlugin);

export { softDeletePlugin };
