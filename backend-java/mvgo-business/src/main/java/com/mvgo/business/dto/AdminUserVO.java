package com.mvgo.business.dto;

import java.util.Date;
import java.util.Map;

/**
 * 管理后台用户列表项.
 *
 * <p>字段对齐 Node {@code AdminService.listUsers()} 输出，供前端 UsersView 渲染。
 *
 * @since 1.0.0
 */
public class AdminUserVO {

    private String id;
    private String uid;
    private String username;
    private String name;
    private String fullName;
    private String deptName;
    private String orgName;
    private String source;
    private boolean isAdmin;
    private boolean hasConfig;
    private Map<String, Object> config;
    /** 组件库中该用户创建的组件数（来自 Node user-stats） */
    private int componentCount;
    /** 组件生成任务数（taskType=component，来自 Node user-stats） */
    private int taskCount;
    /** Apifox 接口生成批数（来自 Node user-stats） */
    private int apiTaskCount;
    /** Apifox 接口生成接口总数（来自 Node user-stats） */
    private int apiCount;
    private Date createdAt;
    private Date updatedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUid() {
        return uid;
    }

    public void setUid(String uid) {
        this.uid = uid;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getDeptName() {
        return deptName;
    }

    public void setDeptName(String deptName) {
        this.deptName = deptName;
    }

    public String getOrgName() {
        return orgName;
    }

    public void setOrgName(String orgName) {
        this.orgName = orgName;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public boolean getIsAdmin() {
        return isAdmin;
    }

    public void setIsAdmin(boolean isAdmin) {
        this.isAdmin = isAdmin;
    }

    public boolean isHasConfig() {
        return hasConfig;
    }

    public void setHasConfig(boolean hasConfig) {
        this.hasConfig = hasConfig;
    }

    public Map<String, Object> getConfig() {
        return config;
    }

    public void setConfig(Map<String, Object> config) {
        this.config = config;
    }

    public int getComponentCount() {
        return componentCount;
    }

    public void setComponentCount(int componentCount) {
        this.componentCount = componentCount;
    }

    public int getTaskCount() {
        return taskCount;
    }

    public void setTaskCount(int taskCount) {
        this.taskCount = taskCount;
    }

    public int getApiTaskCount() {
        return apiTaskCount;
    }

    public void setApiTaskCount(int apiTaskCount) {
        this.apiTaskCount = apiTaskCount;
    }

    public int getApiCount() {
        return apiCount;
    }

    public void setApiCount(int apiCount) {
        this.apiCount = apiCount;
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
