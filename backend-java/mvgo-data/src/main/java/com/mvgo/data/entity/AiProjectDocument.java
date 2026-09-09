package com.mvgo.data.entity;

import java.util.Date;
import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

/**
 * AI 项目文档（对应 ai_projects 集合）.
 *
 * @since 1.0.0
 */
@Document(collection = "ai_projects")
public class AiProjectDocument {

    @Id
    private String id;

    @Field("name")
    private String name;

    @Field("description")
    private String description;

    @Field("gitUrl")
    private String gitUrl;

    @Field("gitBranch")
    private String gitBranch;

    @Field("gitDefaultPath")
    private String gitDefaultPath;

    @Field("adminUserIds")
    private List<String> adminUserIds;

    @Field("authorizedGroupIds")
    private List<String> authorizedGroupIds;

    @Field("status")
    private String status;

    @Field("createdAt")
    private Date createdAt;

    @Field("updatedAt")
    private Date updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getGitUrl() { return gitUrl; }
    public void setGitUrl(String gitUrl) { this.gitUrl = gitUrl; }
    public String getGitBranch() { return gitBranch; }
    public void setGitBranch(String gitBranch) { this.gitBranch = gitBranch; }
    public String getGitDefaultPath() { return gitDefaultPath; }
    public void setGitDefaultPath(String gitDefaultPath) { this.gitDefaultPath = gitDefaultPath; }
    public List<String> getAdminUserIds() { return adminUserIds; }
    public void setAdminUserIds(List<String> adminUserIds) { this.adminUserIds = adminUserIds; }
    public List<String> getAuthorizedGroupIds() { return authorizedGroupIds; }
    public void setAuthorizedGroupIds(List<String> authorizedGroupIds) { this.authorizedGroupIds = authorizedGroupIds; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }
    public Date getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Date updatedAt) { this.updatedAt = updatedAt; }
}