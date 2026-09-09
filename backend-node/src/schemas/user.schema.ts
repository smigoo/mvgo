import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import * as bcrypt from 'bcrypt';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  _id: string;

  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true })
  password: string;

  @Prop({ default: '' })
  email: string;

  // 门户用户唯一标识（uid），用于关联门户用户
  @Prop({ sparse: true, index: true })
  uid: string;

  // 门户用户信息快照（姓名、部门等）
  @Prop({ type: Object })
  portalInfo: Record<string, any>;

  /**
   * 系统管理员标志（由现有管理员在「用户管理」界面动态设置）。
   * - 主判定依据：命中即视为 admin，优先级高于私人组 role。
   * - 与 DEFAULT_ADMIN_UIDS 环境变量白名单、QS 权限码共同决定管理员身份。
   */
  @Prop({ default: false, index: true })
  isAdmin: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// 密码加密中间件
UserSchema.pre('save', async function() {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.set('password', await bcrypt.hash(this.get('password'), salt));
});

// 密码比对方法
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.get('password'));
};
