package com.mvgo.data.entity;

import java.util.Date;
import java.util.Map;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

/**
 * 用户文档（与管理后台 users 集合共用同一 MongoDB 库）.
 *
 * <p>仅映射审计日志富化所需的只读字段；密码等敏感字段不在此实体暴露。
 * {@code _id} 在 MongoDB 中为 ObjectId，Spring Data 自动以 hex 字符串映射到 {@link #id}。
 *
 * @since 1.0.0
 */
@Document(collection = "users")
public class UserDocument {

    @Id
    private String id;

    /** 登录用户名（门户同号） */
    private String username;

    /** 邮箱（user 字段缺失时作为兜底展示） */
    private String email;

    /** 密码（PBKDF2 哈希，{java-pbkdf2} 前缀区分 Node bcrypt） */
    @Field("password")
    private String password;

    /** 门户用户唯一标识（uid），关联门户用户 */
    private String uid;

    /** 系统管理员标志 */
    @Field("isAdmin")
    private Boolean isAdmin;

    /** 门户用户信息快照（姓名、部门、组织等） */
    @Field("portalInfo")
    private Map<String, Object> portalInfo;

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

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getUid() {
        return uid;
    }

    public void setUid(String uid) {
        this.uid = uid;
    }

    public Boolean getIsAdmin() {
        return isAdmin;
    }

    public void setIsAdmin(Boolean isAdmin) {
        this.isAdmin = isAdmin;
    }

    public Map<String, Object> getPortalInfo() {
        return portalInfo;
    }

    public void setPortalInfo(Map<String, Object> portalInfo) {
        this.portalInfo = portalInfo;
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
