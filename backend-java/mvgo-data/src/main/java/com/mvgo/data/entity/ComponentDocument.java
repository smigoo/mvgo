package com.mvgo.data.entity;

import java.util.Date;
import java.util.Map;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

/**
 * 生成组件文档（对应 components 集合，与 Node 端同一 MongoDB 库）.
 *
 * <p>映射完整字段供 CRUD 使用，文件类端点仍由 Node 处理。
 *
 * @since 1.0.0
 */
@Document(collection = "components")
public class ComponentDocument {

    @Id
    private String id;

    /** workspace 业务组件号，不等同于 MongoDB _id */
    @Field("componentId")
    private String componentId;

    /** 生成任务号 */
    @Field("taskId")
    private String taskId;

    /** 组件目标类型：microcode / vue3 */
    @Field("target")
    private String target;

    @Field("name")
    private String name;

    @Field("description")
    private String description;

    /** 创建者 ID（ObjectId 字符串） */
    @Field("creatorId")
    private String creatorId;

    /** 所属群组 ID（ObjectId 字符串） */
    @Field("groupId")
    private String groupId;

    /** 元数据（figmaWidth、figmaHeight、quality 等） */
    @Field("metadata")
    private Map<String, Object> metadata;

    @Field("createdAt")
    private Date createdAt;

    @Field("updatedAt")
    private Date updatedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getComponentId() {
        return componentId;
    }

    public void setComponentId(String componentId) {
        this.componentId = componentId;
    }

    public String getTaskId() {
        return taskId;
    }

    public void setTaskId(String taskId) {
        this.taskId = taskId;
    }

    public String getTarget() {
        return target;
    }

    public void setTarget(String target) {
        this.target = target;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getCreatorId() {
        return creatorId;
    }

    public void setCreatorId(String creatorId) {
        this.creatorId = creatorId;
    }

    public String getGroupId() {
        return groupId;
    }

    public void setGroupId(String groupId) {
        this.groupId = groupId;
    }

    public Map<String, Object> getMetadata() {
        return metadata;
    }

    public void setMetadata(Map<String, Object> metadata) {
        this.metadata = metadata;
    }

    public Date getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Date createdAt) {
        this.createdAt = createdAt;
    }

    public Date getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Date updatedAt) {
        this.updatedAt = updatedAt;
    }
}
