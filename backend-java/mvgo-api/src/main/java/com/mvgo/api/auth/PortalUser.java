package com.mvgo.api.auth;

/**
 * 门户 token 校验成功后解析出的用户身份.
 *
 * <p>字段对齐 Node SessionGuard 经门户 getTokenUser 解析出的 data（uid/account/name）.
 *
 * @param uid     门户用户唯一标识
 * @param account 门户账号（作为系统 username）
 * @param name    展示名
 * @since 1.0.0
 */
public record PortalUser(String uid, String account, String name) {
}
