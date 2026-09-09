import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Component, ComponentDocument } from '../schemas/component.schema';
import {
  GroupMember,
  GroupMemberDocument,
} from '../schemas/group-member.schema';
import { ListComponentsDto } from './dto/list-components.dto';
import { ROLES } from '../common/constants';
import { readdir, readFile, writeFile, stat, mkdir, unlink, rename, rm } from 'fs/promises';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, extname, relative, dirname, resolve, sep } from 'path';
import { resolveFrontendWorkspace } from '../config/workspace.config';
import {
  customComponentsDir,
  vue3ComponentsDir,
  tempComponentsDir,
} from '../config/backend-root';
import { TasksService } from '../tasks/tasks.service';
import { resolvePrivateGroupId } from '../common/group-resolver';

@Injectable()
export class ComponentService {
  constructor(
    @InjectModel(Component.name)
    private componentModel: Model<ComponentDocument>,
    @InjectModel(GroupMember.name)
    private groupMemberModel: Model<GroupMemberDocument>,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * 解析组件归属组（委托共享实现）：暂无分组概念时按用户 uid 落到私人组。
   * 供 page-generator / component-analysis 等已注入本服务的链路复用，避免各自接线 groupMemberModel。
   */
  async resolvePrivateGroupId(
    dtoGroupId: string | undefined,
    userId: string | undefined,
  ): Promise<string> {
    return resolvePrivateGroupId(dtoGroupId, userId, this.groupMemberModel);
  }

  // 创建组件
  async createComponent(
    name: string,
    description: string,
    groupId: string,
    creatorId: string,
    metadata: any,
  ): Promise<Component> {
    // 确保 groupId 和 creatorId 以 ObjectId 形式存入 MongoDB
    // Mongoose schema 定义了 type: Types.ObjectId，但 new Model() + save() 在某些版本中可能不自动转换字符串
    const component = new this.componentModel({
      componentId: metadata?.componentId || metadata?.sessionId,
      taskId: metadata?.taskId || metadata?.sessionId,
      target: metadata?.target || (metadata?.type === 'vue3' ? 'vue3' : 'microcode'),
      name,
      description,
      groupId: Types.ObjectId.isValid(groupId) ? new Types.ObjectId(groupId) : groupId,
      creatorId: Types.ObjectId.isValid(creatorId) ? new Types.ObjectId(creatorId) : creatorId,
      metadata,
    });

    await component.save();
    return component;
  }

  // 获取群组的所有组件（仅返回当前用户创建的组件）
  async getGroupComponents(
    groupId: string,
    userId?: string,
  ): Promise<Component[]> {
    const filter: any = { groupId };
    if (userId) {
      filter.creatorId = Types.ObjectId.isValid(userId)
        ? new Types.ObjectId(userId)
        : userId;
    }
    return this.componentModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  // 高级列表查询（支持搜索、筛选、排序、分页）
  async listComponents(query: ListComponentsDto, userId?: string) {
    const {
      groupId,
      search,
      creator = 'all',
      scope,
      sortBy = 'lastEdited',
      page = 1,
      pageSize = 12,
    } = query;

    // 构建查询条件
    const filter: any = {};

    // 可见范围：scope 缺省/'mine' 保持原行为（仅自己创建的）；
    // 'public' 查公共组件池；'all' 为自己的 + 公共池并集。
    const userObjectIdOrRaw = userId
      ? Types.ObjectId.isValid(userId)
        ? new Types.ObjectId(userId)
        : userId
      : undefined;

    if (scope === 'public') {
      filter.visibility = 'public';
    } else if (scope === 'all') {
      if (userObjectIdOrRaw) {
        filter.$or = [
          { creatorId: userObjectIdOrRaw },
          { visibility: 'public' },
        ];
      } else {
        filter.visibility = 'public';
      }
    } else if (userObjectIdOrRaw) {
      filter.creatorId = userObjectIdOrRaw;
    }

    // 群组筛选：仅「我的组件」保留 groupId 约束。
    // 公共池/全部是平台级范围（全平台所有登录用户可见可下载），
    // 若仍按调用方当前群组过滤会把公共组件错误地圈在群组内。
    if (groupId && scope !== 'public' && scope !== 'all') {
      filter.groupId = Types.ObjectId.isValid(groupId)
        ? new Types.ObjectId(groupId)
        : groupId;
    }

    // 创建者筛选（creator=me 已由上面的 userId 过滤覆盖，保留兼容）
    if (creator === 'me' && userId && !filter.creatorId) {
      filter.creatorId = userId;
    }

    // 搜索关键词
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    // 排序
    const sortOptions: any = {};
    if (sortBy === 'lastEdited') {
      sortOptions.updatedAt = -1;
    } else if (sortBy === 'created') {
      sortOptions.createdAt = -1;
    } else if (sortBy === 'shared') {
      // 上传公共池时间倒序（未发布组件 sharedAt 缺失排最后）
      sortOptions.sharedAt = -1;
      sortOptions.createdAt = -1;
    } else if (sortBy === 'name') {
      sortOptions.name = 1;
    }

    // 分页查询。组件库首屏只需要卡片字段，不读取源码、文件树或 workspace。
    const safePageSize = Math.min(Math.max(pageSize, 1), 60);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safePageSize;
    const [components, total] = await Promise.all([
      this.componentModel
        .find(filter)
        .select('_id componentId taskId target name groupId creatorId visibility sharedAt sharedBy metadata createdAt updatedAt')
        .populate('creatorId', 'username email')
        // groupId 只补 name 供前端展示（如公共池「所属群组」列）；groupId 本身以 string 输出，不破坏既有 string 消费者
        .populate('groupId', 'name')
        .sort(sortOptions)
        .skip(skip)
        .limit(safePageSize)
        .lean()
        .exec(),
      this.componentModel.countDocuments(filter).exec(),
    ]);

    return {
      components: components.map((component) => this.toLibraryListItem(component)),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize),
    };
  }

  private toLibraryListItem(component: any) {
    const metadata = component?.metadata || {};
    const componentId = component.componentId || metadata.componentId || metadata.sessionId || component._id?.toString();
    const target = component.target || metadata.target || (metadata.type === 'vue3' ? 'vue3' : 'microcode');
    const quality = this.extractComponentQuality(component, metadata);
    // groupId 兼容两种形态：populate 后为 { _id, name }，原始为 ObjectId/string
    const rawGroup = component.groupId;
    const groupId = rawGroup?._id?.toString?.() || rawGroup?.toString?.() || rawGroup || undefined;
    const groupName =
      (rawGroup && typeof rawGroup === 'object' && rawGroup.name) || undefined;

    return {
      _id: component._id?.toString?.() || component._id,
      componentId,
      taskId: component.taskId || metadata.taskId || metadata.sessionId,
      target,
      name: component.name,
      groupId,
      groupName,
      creatorId: component.creatorId,
      // 历史数据无 visibility 字段，视同 private
      visibility: component.visibility || 'private',
      sharedAt: component.sharedAt,
      sharedBy: component.sharedBy,
      qualityGate: quality.qualityGate,
      qualityScore: quality.qualityScore,
      runtimePass: quality.runtimePass,
      visualPass: quality.visualPass,
      previewUrl: this.buildStandardPreviewUrl(componentId),
      metadata: {
        componentId,
        sessionId: metadata.sessionId,
        target,
        type: metadata.type,
        ...(metadata.figmaWidth ? { figmaWidth: Number(metadata.figmaWidth) } : {}),
        ...(metadata.figmaHeight ? { figmaHeight: Number(metadata.figmaHeight) } : {}),
      },
      createdAt: component.createdAt,
      updatedAt: component.updatedAt,
    };
  }

  private extractComponentQuality(component: any, metadata: any) {
    const quality = metadata?.quality || {};
    const taskId = component.taskId || metadata?.taskId || metadata?.sessionId;
    const task = taskId ? this.tasksService.getTask(taskId) : undefined;
    const result = task?.result || metadata?.result || {};
    const checkResult = result?.checkResult || metadata?.checkResult || {};
    const runtimeGate = result?.runtimeGate || metadata?.runtimeGate;
    const visualReport = result?.visualComparisonReport || metadata?.visualComparisonReport;

    return {
      qualityGate: task?.qualityGate || metadata?.qualityGate || quality.qualityGate || 'warned',
      qualityScore: quality.qualityScore ?? metadata?.qualityScore ?? checkResult?.qualityScore ?? result?.finalQualityScore,
      runtimePass: quality.runtimePass ?? metadata?.runtimePass ?? (runtimeGate ? runtimeGate.status === 'PASS' : undefined),
      visualPass: quality.visualPass ?? metadata?.visualPass ?? (visualReport ? visualReport.pass === true : undefined),
    };
  }

  private buildStandardPreviewUrl(componentId?: string) {
    if (!componentId) return undefined;
    return '/api/component/' + encodeURIComponent(componentId) + '/file?path=resources/images/mc-preview.png&raw=1';
  }

  // 获取组件详情（验证所有权：仅创建者或管理员可查看）
  async getComponentById(
    componentId: string,
    userId?: string,
  ): Promise<Component> {
    if (!Types.ObjectId.isValid(componentId)) {
      throw new NotFoundException('组件不存在');
    }
    const component = await this.componentModel.findById(componentId);
    if (!component) {
      throw new NotFoundException('组件不存在');
    }

    // 如果提供了 userId，验证访问权限
    if (userId) {
      await this.checkComponentAccess(component, userId);
    }

    return component;
  }

  // 按业务组件号查找组件（兼容历史 metadata.sessionId）
  async getComponentBySessionId(sessionId: string, userId?: string): Promise<Component> {
    const filter: any = {
      $or: [
        { componentId: sessionId },
        { taskId: sessionId },
        { 'metadata.componentId': sessionId },
        { 'metadata.sessionId': sessionId },
      ],
    };
    if (userId) {
      filter.creatorId = Types.ObjectId.isValid(userId)
        ? new Types.ObjectId(userId)
        : userId;
    }
    const component = await this.componentModel.findOne(filter);
    if (component) {
      return component;
    }

    // 组件生成后的 Mongo 登记是异步后处理，数据库写入失败时 workspace 仍可能可用。
    // 任务本人可以继续访问这类“有任务、无组件记录”的产物，避免详情页无意义地报 404。
    const task = this.tasksService.getTask(sessionId);
    if (task && (!task.userId || task.userId === userId)) {
      return {
        componentId: task.componentId || task.sessionId,
        taskId: task.sessionId,
        target: task.target === 'vue3' ? 'vue3' : 'microcode',
        name: task.componentName || task.componentId || task.sessionId,
        description: '',
        groupId: task.groupId as any,
        creatorId: task.userId as any,
        metadata: {
          componentId: task.componentId || task.sessionId,
          sessionId: task.sessionId,
          taskId: task.sessionId,
          target: task.target === 'vue3' ? 'vue3' : 'microcode',
          fallback: true,
        },
      } as unknown as Component;
    }

    throw new NotFoundException('未找到该 sessionId 对应的组件记录');
  }

  /**
   * 将接口参数统一解析为 MongoDB 组件记录 + workspace 业务组件号。
   * 已登记组件走数据库权限；生成中组件走任务所有权；无任何归属记录时拒绝访问。
   */
  private async resolveAuthorizedComponent(
    identifier: string,
    userId: string,
    mode: 'read' | 'write',
  ): Promise<{
    component?: ComponentDocument;
    componentId: string;
    groupId?: string;
    target?: string;
    figmaFileKey?: string;
    figmaNodeId?: string;
    componentName?: string;
  }> {
    let component: ComponentDocument | null = null;
    if (Types.ObjectId.isValid(identifier)) {
      component = await this.componentModel.findById(identifier);
    }
    if (!component) {
      component = await this.componentModel.findOne({
        $or: [
          { componentId: identifier },
          { taskId: identifier },
          { 'metadata.componentId': identifier },
          { 'metadata.sessionId': identifier },
        ],
      });
    }

    if (component) {
      if (mode === 'write') {
        await this.checkComponentPermission(component, userId);
      } else {
        await this.checkComponentAccess(component, userId);
      }
      return {
        component,
        componentId:
          component.componentId || component.metadata?.componentId ||
          component.metadata?.sessionId || identifier,
        groupId: component.groupId?.toString(),
        target: component.target || component.metadata?.target ||
          (component.metadata?.type === 'vue3' ? 'vue3' : 'microcode'),
      };
    }

    const task = this.tasksService.getTaskByComponentId(identifier);
    if (task && task.userId === userId) {
      return {
        componentId: task.componentId,
        groupId: task.groupId,
        target: task.target,
        figmaFileKey: task.fileKey,
        figmaNodeId: task.nodeId,
        componentName: task.componentName,
      };
    }

    throw new ForbiddenException('无权访问此组件或组件尚未登记归属');
  }

  async authorizeWorkspaceComponent(
    identifier: string,
    userId: string,
    mode: 'read' | 'write' = 'read',
  ) {
    return this.resolveAuthorizedComponent(identifier, userId, mode);
  }

  // 更新组件
  async updateComponent(
    componentId: string,
    name: string,
    description: string,
    metadata: any,
    userId: string,
  ): Promise<Component> {
    if (!Types.ObjectId.isValid(componentId)) {
      throw new NotFoundException('组件不存在');
    }
    const component = await this.componentModel.findById(componentId);
    if (!component) {
      throw new NotFoundException('组件不存在');
    }

    // 验证用户是否是创建者或管理员
    await this.checkComponentPermission(component, userId);

    component.name = name;
    component.description = description;
    component.metadata = metadata;

    await component.save();
    return component;
  }

  /**
   * 发布组件到公共组件池：visibility → public。
   * 严格仅提供者（创建者）可发布，管理员无权代发。
   */
  async publishComponent(componentId: string, userId: string): Promise<Component> {
    const component = await this.findComponentOrFail(componentId);
    this.assertComponentCreator(component, userId, '只有组件提供者可以发布该组件');
    if (!component.componentId) {
      throw new BadRequestException('组件尚未生成产物，无法发布到公共组件池');
    }

    component.visibility = 'public';
    component.sharedAt = new Date();
    component.sharedBy = Types.ObjectId.isValid(userId)
      ? new Types.ObjectId(userId)
      : (userId as any);
    await component.save();
    return component;
  }

  /**
   * 从公共组件池下架：visibility → private，个人副本保留。
   * sharedAt/sharedBy 保留（重新发布时刷新 sharedAt）。
   */
  async unpublishComponent(componentId: string, userId: string): Promise<Component> {
    const component = await this.findComponentOrFail(componentId);
    this.assertComponentCreator(component, userId, '只有组件提供者可以操作该组件');

    component.visibility = 'private';
    await component.save();
    return component;
  }

  private async findComponentOrFail(componentId: string): Promise<ComponentDocument> {
    if (!Types.ObjectId.isValid(componentId)) {
      throw new NotFoundException('组件不存在');
    }
    const component = await this.componentModel.findById(componentId);
    if (!component) {
      throw new NotFoundException('组件不存在');
    }
    return component;
  }

  /** 严格创建者校验（发布/下架/删除公共组件用），管理员不豁免 */
  private assertComponentCreator(
    component: ComponentDocument,
    userId: string,
    message: string,
  ): void {
    if (component.creatorId?.toString() !== userId) {
      throw new ForbiddenException(message);
    }
  }

  // 删除组件
  async deleteComponent(componentId: string, userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(componentId)) {
      throw new NotFoundException('组件不存在');
    }
    const component = await this.componentModel.findById(componentId);
    if (!component) {
      throw new NotFoundException('组件不存在');
    }

    // 删除权限：public 组件严格仅提供者，private 组件创建者或管理员
    await this.checkComponentDeletePermission(component, userId);

    await this.tasksService.removeComponentCascade(componentId, userId);
    await this.componentModel.findByIdAndDelete(componentId);
  }

  // 批量删除��件
  async batchDeleteComponents(componentIds: string[], userId: string): Promise<{ deleted: number; failed: number }> {
    let deleted = 0;
    let failed = 0;

    for (const componentId of componentIds) {
      try {
        if (!Types.ObjectId.isValid(componentId)) {
          failed++;
          continue;
        }
        const component = await this.componentModel.findById(componentId);
        if (!component) {
          failed++;
          continue;
        }
        await this.checkComponentDeletePermission(component, userId);
        await this.tasksService.removeComponentCascade(componentId, userId);
        await this.componentModel.findByIdAndDelete(componentId);
        deleted++;
      } catch {
        failed++;
      }
    }

    return { deleted, failed };
  }

  // 检查群组成员身份
  private async checkGroupMembership(
    groupId: string,
    userId: string,
  ): Promise<void> {
    const membership = await this.groupMemberModel.findOne({ groupId, userId });
    if (!membership) {
      throw new ForbiddenException('您不是该群组成员');
    }
  }

  /**
   * 删除权限：
   * - public 组件禁止直接删除（必须先下架变为 private，再删除）
   * - private 组件：创建者或群组管理员可删
   */
  private async checkComponentDeletePermission(
    component: ComponentDocument,
    userId: string,
  ): Promise<void> {
    if (component.visibility === 'public') {
      throw new ForbiddenException('公开组件不允许直接删除，请先下架后再删除');
    }
    return this.checkComponentPermission(component, userId);
  }

  // 检查组件操作权限（创建者或管理员）
  private async checkComponentPermission(
    component: ComponentDocument,
    userId: string,
  ): Promise<void> {
    const groupId = component.groupId.toString();
    const creatorId = component.creatorId.toString();

    // 如果是创建者，直接允许
    if (creatorId === userId) {
      return;
    }

    // 检查是否是管理员
    const membership = await this.groupMemberModel.findOne({ groupId, userId });
    if (!membership || membership.role !== ROLES.ADMIN) {
      throw new ForbiddenException('只有创建者或管理员可以修改组件');
    }
  }

  // 检查组件读取权限（public 组件全员可读；private 组件创建者或管理员可查看）
  private async checkComponentAccess(
    component: ComponentDocument,
    userId: string,
  ): Promise<void> {
    // 公共组件池：所有登录用户可读（详情/文件/下载链路统一走这里）
    if (component.visibility === 'public') {
      return;
    }

    const creatorId = component.creatorId?.toString();
    if (creatorId === userId) {
      return;
    }

    const groupId = component.groupId?.toString();
    if (groupId) {
      const membership = await this.groupMemberModel.findOne({ groupId, userId });
      if (membership && membership.role === ROLES.ADMIN) {
        return;
      }
    }

    throw new ForbiddenException('无权访问此组件');
  }

  /**
   * 解析组件目录的所有可能基础路径（按优先级）
   * 覆盖：前端 workspace、后端 workspace、temp-components（LangGraph 管线）、vue3-components
   */
  private async resolveComponentBaseDirs(
    componentId: string,
    location?: { groupId?: string; target?: string },
  ): Promise<string[]> {
    const dirs: string[] = [];

    if (location?.target === 'vue3' && location.groupId) {
      dirs.push(
        join(vue3ComponentsDir, location.groupId, componentId),
        join(resolveFrontendWorkspace(), 'vue3-components', location.groupId, componentId),
      );
    }
    if (location?.target === 'microcode') {
      dirs.push(
        join(customComponentsDir, componentId),
        join(resolveFrontendWorkspace(), 'custom-components', componentId),
      );
    }

    const task = this.tasksService.getTaskByComponentId(componentId);
    if (task?.outputPath) {
      const allowedTempRoots = [
        tempComponentsDir,
      ].map((root) => `${resolve(root)}${sep}`);
      const normalizedOutputPath = `${resolve(task.outputPath)}${sep}`;
      if (allowedTempRoots.some((root) => normalizedOutputPath.startsWith(root))) {
        dirs.push(task.outputPath);
      }
    }

    // 1. 后端 workspace（mc-* 微码生成组件）
    dirs.push(join(customComponentsDir, componentId));

    // 3. temp-components（LangGraph 管线生成的临时组件，结构: temp-components/{groupId}/{sessionId}/）
    try {
      const tempBase = tempComponentsDir;
      const groups = await readdir(tempBase, { withFileTypes: true });
      for (const group of groups) {
        if (group.isDirectory()) {
          const componentDir = join(tempBase, group.name, componentId);
          try {
            await stat(componentDir);
            dirs.push(componentDir);
          } catch {
            // 该 groupId 下不存在此 sessionId，继续
          }
        }
      }
    } catch {
      // temp-components 目录不存在
    }

    // 4. 后端 vue3-components（Vue3 管线生成的组件，结构: workspace/vue3-components/{groupId}/{sessionId}/）
    try {
      const vue3Base = vue3ComponentsDir;
      const groups = await readdir(vue3Base, { withFileTypes: true });
      for (const group of groups) {
        if (group.isDirectory()) {
          const componentDir = join(vue3Base, group.name, componentId);
          try {
            await stat(componentDir);
            dirs.push(componentDir);
          } catch {
            // 该 groupId 下不存在此 sessionId，继续
          }
        }
      }
    } catch {
      // vue3-components 目录不存在
    }

    // 5. 前端 workspace（Playground 可能需要打开前端直接生成的非管线组件）
    const frontendBase = resolveFrontendWorkspace();
    try {
      // 5a. custom-components
      const fwCustomDir = join(frontendBase, 'custom-components', componentId);
      try {
        await stat(fwCustomDir);
        dirs.push(fwCustomDir);
      } catch {
        // 不存在
      }

      // 5b. vue3-components（遍历 groupId）
      const fwVue3Base = join(frontendBase, 'vue3-components');
      try {
        const groups = await readdir(fwVue3Base, { withFileTypes: true });
        for (const group of groups) {
          if (group.isDirectory()) {
            const componentDir = join(fwVue3Base, group.name, componentId);
            try {
              await stat(componentDir);
              dirs.push(componentDir);
            } catch {
              // 该 groupId 下不存在此 sessionId，继续
            }
          }
        }
      } catch {
        // frontend workspace/vue3-components 目录不存在
      }
    } catch {
      // frontend/workspace 目录不存在
    }

    return dirs;
  }

  private resolveSafeFilePath(baseDir: string, filePath: string): string {
    const resolvedBase = resolve(baseDir);
    const resolvedPath = resolve(resolvedBase, filePath);
    if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${sep}`)) {
      throw new ForbiddenException('非法文件路径');
    }
    return resolvedPath;
  }

  /**
   * 获取组件文件列表（递归遍历所有候选目录，合并去重）
   *
   * 注意：一个组件可能分散在多个物理目录（custom-components / vue3-components / temp-components），
   *       每个目录只持有部分文件。必须遍历全部候选目录并按 relativePath 合并，
   *       否则命中第一个只有 index.vue 的目录就会漏掉 resources/images/ 等子目录文件。
   */
  async getComponentFiles(componentId: string, userId?: string): Promise<any[]> {
    const authorized = userId
      ? await this.resolveAuthorizedComponent(componentId, userId, 'read')
      : { componentId };

    const baseDirs = await this.resolveComponentBaseDirs(authorized.componentId, authorized);

    // 从所有候选目录收集文件，按 path 去重（后面的覆盖前面的）
    const merged = new Map<string, any>();
    for (const baseDir of baseDirs) {
      try {
        const files: any[] = [];
        await this.traverseDirectory(baseDir, '', files);
        for (const f of files) {
          merged.set(f.path, f);
        }
      } catch {
        // 目录不存在或不可读，跳过
      }
    }

    return Array.from(merged.values());
  }

  /**
   * 递归遍历目录，收集文件列表
   */
  private async traverseDirectory(
    dirPath: string,
    basePath: string,
    files: any[],
  ): Promise<void> {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const relativePath = basePath
        ? `${basePath}/${entry.name}`
        : entry.name;

      // 跳过隐藏文件和 node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }

      if (entry.isDirectory()) {
        await this.traverseDirectory(fullPath, relativePath, files);
      } else {
        // 确定文件类型
        const ext = extname(entry.name).toLowerCase();
        let fileType = 'text';

        if (ext === '.vue') fileType = 'vue';
        else if (ext === '.js' || ext === '.ts') fileType = 'javascript';
        else if (ext === '.json') fileType = 'json';
        else if (ext === '.md') fileType = 'markdown';
        else if (ext === '.less' || ext === '.css') fileType = 'css';
        else if (['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(ext))
          fileType = 'image';

        files.push({
          name: entry.name,
          path: relativePath,
          type: fileType,
        });
      }
    }
  }

  /**
   * 解析组件文件的真实磁盘路径
   */
  private normalizeVue3Entry(baseDirs: string[], filePath: string): string {
    if (filePath !== 'index.vue') return filePath;
    for (const dir of baseDirs) {
      if (existsSync(join(dir, 'package', 'index.vue'))) return 'package/index.vue';
    }
    return filePath;
  }

  async resolveComponentFilePath(componentId: string, filePath: string, userId?: string): Promise<string> {
    const authorized = userId
      ? await this.resolveAuthorizedComponent(componentId, userId, 'read')
      : { componentId };

    const baseDirs = await this.resolveComponentBaseDirs(authorized.componentId, authorized);
    const normalizedPath = this.normalizeVue3Entry(baseDirs, filePath);
    const candidates = baseDirs.map((dir) => this.resolveSafeFilePath(dir, normalizedPath));

    for (const fullPath of candidates) {
      try {
        const fileStat = await stat(fullPath);
        if (fileStat.isFile()) return fullPath;
      } catch {
        // 当前候选目录没有该文件，继续尝试下一个 workspace。
      }
    }
    throw new NotFoundException(`文件不存在: ${filePath}`);
  }

  /**
   * 获取文件内容
   */
  async getFileContent(componentId: string, filePath: string, userId?: string): Promise<string> {
    const fullPath = await this.resolveComponentFilePath(componentId, filePath, userId);
    return readFile(fullPath, 'utf-8');
  }

  /**
   * 保存文件内容
   */
  async saveFileContent(
    componentId: string,
    filePath: string,
    content: string,
    userId?: string,
  ): Promise<void> {
    const authorized = userId
      ? await this.resolveAuthorizedComponent(componentId, userId, 'write')
      : { componentId };

    const baseDirs = await this.resolveComponentBaseDirs(authorized.componentId, authorized);
    const normalizedPath = this.normalizeVue3Entry(baseDirs, filePath);

    // 同时写入所有「已存在的 workspace 候选目录」（含 frontend/workspace 副本）：
    // dev 预览 iframe 直接 fetch frontend/workspace 静态文件，若只写 backend-node/workspace，
    // 保存后预览永远读到旧的 frontend 副本 → 预览不刷新。
    // 注意：跳过扫描发现的 temp-components 子目录（管线中间产物，断点恢复靠其存在与否判断）。
    // 但任务自身的 outputPath（同样在 temp-components 下）必须放行——Playground 用户编辑的文件就在这里。
    const task = this.tasksService.getTaskByComponentId(componentId);
    const taskOutputPath = task?.outputPath ? resolve(task.outputPath) : null;
    // 🛡️ B 方案：生成进行中禁止保存「主组件 index.vue」（生成末端会重写，保存会被无声覆盖）
    // 子组件（package/components/*.vue）生成早期一次性落盘后不再碰 → 放行。
    if (task?.status === 'running') {
      const isMainEntry = /(^|\/)package\/index\.vue$/.test(normalizedPath) || normalizedPath === 'index.vue';
      if (isMainEntry) {
        throw new ConflictException(
          '组件正在生成中，主组件(index.vue)仍由生成管线写入，此时保存会被生成覆盖。请等待生成完成（或先暂停生成）后再编辑主组件；子组件可正常编辑。'
        );
      }
    }
    let saved = false;
    let lastError: Error | null = null;
    for (const baseDir of baseDirs) {
      if (baseDir.includes('temp-components') && resolve(baseDir) !== taskOutputPath) continue;
      try {
        // 仅写已存在的目录，避免为不存在的前端副本创建垃圾目录
        await stat(baseDir);
        const fullPath = this.resolveSafeFilePath(baseDir, normalizedPath);
        // 确保父目录存在
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, content, 'utf-8');
        saved = true;
      } catch (error) {
        lastError = error as Error;
      }
    }
    // 🛡️ C 方案：记录用户在 Playground 编辑过的文件，供生成完成时保留用户版本（不覆盖）
    if (saved && taskOutputPath) {
      this.recordUserPatch(taskOutputPath, normalizedPath);
    }
    if (!saved) {
      throw new NotFoundException(`文件保存失败: ${normalizedPath}`);
    }
  }

  /**
   * 🛡️ C 方案：记录用户在 Playground 编辑过的文件（相对路径）到 outputPath/.user-patch/manifest.json。
   * 生成侧 microcode-engineer.writeFiles 读取该清单，对「用户已编辑的文件」跳过覆盖，保留用户版本。
   */
  private recordUserPatch(outputPath: string, relativePath: string): void {
    try {
      const manifestPath = join(outputPath, '.user-patch', 'manifest.json');
      let files: string[] = [];
      try {
        const raw = readFileSync(manifestPath, 'utf-8');
        const parsed = JSON.parse(raw);
        files = Array.isArray(parsed?.files) ? parsed.files : [];
      } catch {
        // 清单不存在 → 新建
      }
      if (!files.includes(relativePath)) {
        files.push(relativePath);
        mkdirSync(dirname(manifestPath), { recursive: true });
        writeFileSync(manifestPath, JSON.stringify({ files, updatedAt: Date.now() }, null, 2), 'utf-8');
      }
    } catch (e) {
      console.warn('[ComponentService] 记录用户编辑清单失败（非致命）', { error: (e as Error).message, relativePath });
    }
  }

  /**
   * 删除组件文件或文件夹（在全部候选 workspace 中同步删除）
   * 用于 Playground 右键菜单「删除」。
   */
  async deleteComponentPath(
    componentId: string,
    targetPath: string,
    userId?: string,
  ): Promise<void> {
    const authorized = userId
      ? await this.resolveAuthorizedComponent(componentId, userId, 'write')
      : { componentId };

    const baseDirs = await this.resolveComponentBaseDirs(authorized.componentId, authorized);
    let deleted = false;
    let lastError: Error | null = null;
    for (const baseDir of baseDirs) {
      try {
        const fullPath = this.resolveSafeFilePath(baseDir, targetPath);
        const st = await stat(fullPath);
        if (st.isDirectory()) {
          await rm(fullPath, { recursive: true, force: true });
        } else {
          await unlink(fullPath);
        }
        deleted = true;
      } catch (error) {
        lastError = error as Error;
      }
    }
    if (!deleted) {
      throw new NotFoundException(`删除失败，目标不存在: ${targetPath}`);
    }
  }

  /**
   * 重命名组件文件或文件夹（在全部候选 workspace 中同步重命名）
   * 用于 Playground 右键菜单「重命名」。
   */
  async renameComponentPath(
    componentId: string,
    oldPath: string,
    newPath: string,
    userId?: string,
  ): Promise<void> {
    const authorized = userId
      ? await this.resolveAuthorizedComponent(componentId, userId, 'write')
      : { componentId };

    const baseDirs = await this.resolveComponentBaseDirs(authorized.componentId, authorized);
    let renamed = false;
    let lastError: Error | null = null;
    for (const baseDir of baseDirs) {
      try {
        const oldFull = this.resolveSafeFilePath(baseDir, oldPath);
        const newFull = this.resolveSafeFilePath(baseDir, newPath);
        await stat(oldFull); // 仅当旧目标存在时才重命名该 workspace
        await mkdir(dirname(newFull), { recursive: true });
        await rename(oldFull, newFull);
        renamed = true;
      } catch (error) {
        lastError = error as Error;
      }
    }
    if (!renamed) {
      throw new NotFoundException(`重命名失败，源不存在: ${oldPath}`);
    }
  }

  /**
   * 新建文件夹（在已存在的候选 workspace 中创建）
   * 用于 Playground 右键菜单「新建文件夹」。
   */
  async createComponentFolder(
    componentId: string,
    folderPath: string,
    userId?: string,
  ): Promise<void> {
    const authorized = userId
      ? await this.resolveAuthorizedComponent(componentId, userId, 'write')
      : { componentId };

    const baseDirs = await this.resolveComponentBaseDirs(authorized.componentId, authorized);
    const task = this.tasksService.getTaskByComponentId(componentId);
    const taskOutputPath = task?.outputPath ? resolve(task.outputPath) : null;
    let created = false;
    let lastError: Error | null = null;
    for (const baseDir of baseDirs) {
      if (baseDir.includes('temp-components') && resolve(baseDir) !== taskOutputPath) continue;
      try {
        await stat(baseDir);
        const fullPath = this.resolveSafeFilePath(baseDir, folderPath);
        await mkdir(fullPath, { recursive: true });
        created = true;
      } catch (error) {
        lastError = error as Error;
      }
    }
    if (!created) {
      throw new NotFoundException(`创建文件夹失败: ${folderPath}`);
    }
  }

  /**
   * 获取组件 declare.json 声明配置（供临时组件 Playground 使用）
   * 不依赖 MongoDB，直接从文件系统读取 declare.json
   */
  async getComponentDeclare(componentId: string, userId?: string): Promise<any> {
    const authorized = userId
      ? await this.resolveAuthorizedComponent(componentId, userId, 'read')
      : { componentId };

    const baseDirs = await this.resolveComponentBaseDirs(authorized.componentId, authorized);
    for (const baseDir of baseDirs) {
      try {
        const declarePath = join(baseDir, 'declare.json');
        const content = await readFile(declarePath, 'utf-8');
        return JSON.parse(content);
      } catch {
        // 继续尝试下一个目录
      }
    }
    throw new NotFoundException(`未找到 declare.json: ${componentId}`);
  }
}
