package com.mvgo.business.service;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import com.mvgo.business.dto.ListComponentsQuery;
import com.mvgo.common.BizException;
import com.mvgo.data.entity.ComponentDocument;
import com.mvgo.data.entity.UserDocument;
import com.mvgo.data.repository.ComponentRepository;
import com.mvgo.data.repository.UserRepository;

import org.bson.types.ObjectId;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

/**
 * 组件 CRUD 服务（对齐 Node component.service 逻辑）.
 *
 * <p>仅实现 MongoDB CRUD；文件类端点（files/file/declare/analyze-visual/download）
 * 由 Node 负责，本地代理按路径前缀转发。
 *
 * @since 1.0.0
 */
@Service
public class ComponentService {

    private final ComponentRepository componentRepository;
    private final UserRepository userRepository;
    private final MongoTemplate mongoTemplate;

    public ComponentService(ComponentRepository componentRepository,
                            UserRepository userRepository,
                            MongoTemplate mongoTemplate) {
        this.componentRepository = componentRepository;
        this.userRepository = userRepository;
        this.mongoTemplate = mongoTemplate;
    }

    /**
     * 获取群组的所有组件（仅返回当前用户创建的组件，与 Node 行为一致）.
     *
     * @param groupId 群组 ID
     * @param userId  当前用户 ID（可选）
     * @return 组件列表
     */
    public List<ComponentDocument> getGroupComponents(String groupId, String userId) {
        if (userId != null) {
            return componentRepository.findByGroupIdAndCreatorIdOrderByCreatedAtDesc(groupId, userId);
        }
        return componentRepository.findByGroupIdOrderByCreatedAtDesc(groupId);
    }

    /**
     * 高级列表查询（支持搜索、筛选、排序、分页）.
     *
     * @param query  查询参数
     * @param userId 当前用户 ID（可选）
     * @return 分页结果 + 总数
     */
    public Map<String, Object> listComponents(ListComponentsQuery query, String userId) {
        String groupId = query.getGroupId();
        String search = query.getSearch();
        String creator = query.getCreator();
        String sortBy = query.getSortBy() != null ? query.getSortBy() : "lastEdited";
        int page = query.getPage() != null ? query.getPage() : 1;
        int pageSize = query.getPageSize() != null ? query.getPageSize() : 12;

        // 构建查询条件
        Query mongoQuery = new Query();

        // 按用户过滤：只返回当前用户创建的组件
        if (userId != null) {
            mongoQuery.addCriteria(Criteria.where("creatorId").is(userId));
        }

        // 群组筛选
        if (groupId != null) {
            mongoQuery.addCriteria(Criteria.where("groupId").is(groupId));
        }

        // 创建者筛选（仅 all 时不过滤；me 已由上面的 userId 覆盖）

        // 搜索关键词（不区分大小写）
        if (search != null && !search.isEmpty()) {
            mongoQuery.addCriteria(Criteria.where("name").regex(Pattern.compile(search, Pattern.CASE_INSENSITIVE)));
        }

        // 排序
        Sort sort = switch (sortBy) {
            case "created" -> Sort.by(Sort.Direction.DESC, "createdAt");
            case "name" -> Sort.by(Sort.Direction.ASC, "name");
            default -> Sort.by(Sort.Direction.DESC, "updatedAt"); // lastEdited
        };
        mongoQuery.with(sort);

        // 分页
        int safePageSize = Math.min(Math.max(pageSize, 1), 60);
        int safePage = Math.max(page, 1);
        int skip = (safePage - 1) * safePageSize;
        mongoQuery.skip(skip).limit(safePageSize);

        // 查询
        List<ComponentDocument> components = mongoTemplate.find(mongoQuery, ComponentDocument.class);
        long total = mongoTemplate.count(mongoQuery, ComponentDocument.class);

        // 转换为 VO
        List<Map<String, Object>> voList = components.stream()
                .map(this::toLibraryListItem)
                .collect(Collectors.toList());

        return Map.of(
                "components", voList,
                "total", total,
                "page", safePage,
                "pageSize", safePageSize,
                "totalPages", (int) Math.ceil((double) total / safePageSize)
        );
    }

    /**
     * 获取组件详情（验证所有权：仅创建者或管理员可查看）.
     *
     * @param componentId MongoDB _id
     * @param userId      当前用户 ID（可选）
     * @return 组件文档
     */
    public ComponentDocument getComponentById(String componentId, String userId) {
        if (!ObjectId.isValid(componentId)) {
            throw new BizException(400, "无效的组件 ID");
        }
        ComponentDocument component = componentRepository.findById(componentId).orElse(null);
        if (component == null) {
            throw new BizException(404, "组件不存在");
        }

        // 如果提供了 userId，验证访问权限
        if (userId != null) {
            checkComponentAccess(component, userId);
        }

        return component;
    }

    /**
     * 创建组件.
     *
     * @param name        名称
     * @param description 描述
     * @param groupId     群组 ID
     * @param creatorId   创建者 ID
     * @param metadata    元数据（componentId、taskId、target 等）
     * @return 创建的组件
     */
    public ComponentDocument createComponent(String name, String description, String groupId,
                                             String creatorId, Map<String, Object> metadata) {
        ComponentDocument component = new ComponentDocument();
        component.setName(name);
        component.setDescription(description != null ? description : "");
        component.setGroupId(groupId);
        component.setCreatorId(creatorId);
        component.setCreatedAt(new Date());
        component.setUpdatedAt(new Date());

        if (metadata != null) {
            component.setComponentId((String) metadata.get("componentId"));
            component.setTaskId((String) metadata.get("taskId"));
            String target = (String) metadata.get("target");
            if (target == null && metadata.get("type") != null) {
                target = "vue3".equals(metadata.get("type")) ? "vue3" : "microcode";
            }
            component.setTarget(target);
            component.setMetadata(metadata);
        }

        return componentRepository.save(component);
    }

    /**
     * 更新组件（部分更新）.
     *
     * @param componentId MongoDB _id
     * @param updates     更新字段
     * @param userId      当前用户 ID
     * @return 更新后的组件
     */
    public ComponentDocument updateComponent(String componentId, Map<String, Object> updates, String userId) {
        if (!ObjectId.isValid(componentId)) {
            throw new BizException(400, "无效的组件 ID");
        }
        ComponentDocument component = componentRepository.findById(componentId).orElse(null);
        if (component == null) {
            throw new BizException(404, "组件不存在");
        }

        // 验证所有权
        checkComponentAccess(component, userId);

        // 构建更新
        Query query = new Query(Criteria.where("_id").is(componentId));
        Update update = new Update().set("updatedAt", new Date());
        if (updates.containsKey("name")) {
            update.set("name", updates.get("name"));
        }
        if (updates.containsKey("description")) {
            update.set("description", updates.get("description"));
        }
        if (updates.containsKey("metadata")) {
            update.set("metadata", updates.get("metadata"));
        }

        mongoTemplate.updateFirst(query, update, ComponentDocument.class);
        return componentRepository.findById(componentId).orElse(null);
    }

    /**
     * 删除组件.
     *
     * @param componentId MongoDB _id
     * @param userId      当前用户 ID
     */
    public void deleteComponent(String componentId, String userId) {
        if (!ObjectId.isValid(componentId)) {
            throw new BizException(400, "无效的组件 ID");
        }
        ComponentDocument component = componentRepository.findById(componentId).orElse(null);
        if (component == null) {
            throw new BizException(404, "组件不存在");
        }

        // 验证所有权
        checkComponentAccess(component, userId);

        componentRepository.deleteById(componentId);
    }

    /**
     * 批量删除组件.
     *
     * @param componentIds MongoDB _id 列表
     * @param userId       当前用户 ID
     * @return 删除结果统计
     */
    public Map<String, Integer> batchDeleteComponents(List<String> componentIds, String userId) {
        int deleted = 0;
        int failed = 0;
        List<String> errors = new ArrayList<>();

        for (String id : componentIds) {
            try {
                deleteComponent(id, userId);
                deleted++;
            } catch (Exception e) {
                failed++;
                errors.add(id + ": " + e.getMessage());
            }
        }

        return Map.of("deleted", deleted, "failed", failed, "errors", errors.size());
    }

    /**
     * 转换为列表项 VO（对齐 Node toLibraryListItem）.
     */
    private Map<String, Object> toLibraryListItem(ComponentDocument component) {
        Map<String, Object> metadata = component.getMetadata();
        String componentId = component.getComponentId();
        if (componentId == null && metadata != null) {
            componentId = (String) metadata.get("sessionId");
        }
        if (componentId == null) {
            componentId = component.getId();
        }

        String target = component.getTarget();
        if (target == null && metadata != null) {
            target = (String) metadata.get("target");
            if (target == null && metadata.get("type") != null) {
                target = "vue3".equals(metadata.get("type")) ? "vue3" : "microcode";
            }
        }

        // 提取质量信息
        Map<String, Object> quality = extractComponentQuality(component, metadata);

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("_id", component.getId());
        result.put("componentId", componentId);
        result.put("taskId", component.getTaskId());
        result.put("target", target);
        result.put("name", component.getName());
        result.put("groupId", component.getGroupId());
        result.put("creatorId", component.getCreatorId());
        result.put("qualityGate", quality.get("qualityGate"));
        result.put("qualityScore", quality.get("qualityScore"));
        result.put("runtimePass", quality.get("runtimePass"));
        result.put("visualPass", quality.get("visualPass"));
        result.put("previewUrl", buildStandardPreviewUrl(componentId));

        Map<String, Object> meta = new java.util.HashMap<>();
        meta.put("componentId", componentId);
        if (metadata != null) {
            meta.put("sessionId", metadata.get("sessionId"));
            meta.put("target", target);
            meta.put("type", metadata.get("type"));
            if (metadata.containsKey("figmaWidth")) {
                meta.put("figmaWidth", metadata.get("figmaWidth"));
            }
            if (metadata.containsKey("figmaHeight")) {
                meta.put("figmaHeight", metadata.get("figmaHeight"));
            }
        }
        result.put("metadata", meta);
        result.put("createdAt", component.getCreatedAt());
        result.put("updatedAt", component.getUpdatedAt());

        return result;
    }

    /**
     * 提取组件质量信息.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> extractComponentQuality(ComponentDocument component, Map<String, Object> metadata) {
        Map<String, Object> quality = new java.util.HashMap<>();

        Map<String, Object> metaQuality = metadata != null ? (Map<String, Object>) metadata.get("quality") : null;

        if (metaQuality != null) {
            quality.put("qualityGate", metaQuality.get("qualityGate"));
            quality.put("qualityScore", metaQuality.get("qualityScore"));
            quality.put("runtimePass", metaQuality.get("runtimePass"));
            quality.put("visualPass", metaQuality.get("visualPass"));
        } else {
            quality.put("qualityGate", "warned");
        }

        return quality;
    }

    /**
     * 构建标准预览 URL.
     */
    private String buildStandardPreviewUrl(String componentId) {
        if (componentId == null) return null;
        return "/api/component/" + componentId + "/file?path=resources/images/mc-preview.png&raw=1";
    }

    /**
     * 验证组件访问权限（仅创建者或管理员可访问）.
     * userId 为 null 时跳过（鉴权已由 SessionGuard 完成）.
     */
    private void checkComponentAccess(ComponentDocument component, String userId) {
        if (userId == null) return; // 鉴权已完成
        if (component.getCreatorId() != null && component.getCreatorId().equals(userId)) return;
        // 检查是否管理员
        if (userId != null) {
            UserDocument user = userRepository.findById(userId).orElse(null);
            if (user != null && Boolean.TRUE.equals(user.getIsAdmin())) return;
        }
        throw new BizException(403, "无权访问此组件");
    }
}