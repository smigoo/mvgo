package com.mvgo.api.dto.req;

import java.util.Map;

/**
 * 组件创建请求（对齐 Node createComponent 参数）.
 *
 * @since 1.0.0
 */
public class CreateComponentRequest {

    private String name;
    private String description;
    private String groupId;
    private String creatorId;
    private java.util.Map<String, Object> metadata;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getGroupId() { return groupId; }
    public void setGroupId(String groupId) { this.groupId = groupId; }

    public String getCreatorId() { return creatorId; }
    public void setCreatorId(String creatorId) { this.creatorId = creatorId; }

    public java.util.Map<String, Object> getMetadata() { return metadata; }
    public void setMetadata(java.util.Map<String, Object> metadata) { this.metadata = metadata; }
}
