package com.mvgo.api.auth;

/**
 * 当前登录用户在请求属性（request attribute）中的键名.
 *
 * <p>SessionGuard 校验通过后写入，Controller 可通过 {@code request.getAttribute(...)} 读取，
 * 作为 Node 侧 {@code request.session.userId} 的等价物（Java 不共享 Node 的 express-session 存储）.
 *
 * @since 1.0.0
 */
public final class AuthContext {

    /** 当前用户 uid */
    public static final String ATTR_USER_ID = "userId";

    /** 当前用户账号 */
    public static final String ATTR_USERNAME = "username";

    /** 当前用户完整门户身份 */
    public static final String ATTR_PORTAL_USER = "portalUser";

    private AuthContext() {
    }
}
