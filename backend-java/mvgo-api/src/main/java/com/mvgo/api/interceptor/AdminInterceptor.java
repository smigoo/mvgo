package com.mvgo.api.interceptor;

import com.mvgo.api.auth.AuthContext;
import com.mvgo.common.BizException;
import com.mvgo.data.entity.UserDocument;

import org.springframework.core.env.Environment;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 管理后台鉴权拦截器：在 {@link SessionGuardInterceptor} 之后运行，校验当前登录用户是否为
 * 系统管理员（users.isAdmin=true）。非管理员访问 {@code /api/admin/**} 一律 403。
 *
 * <p>对齐 Node {@code AdminController} 每个端点调用的 {@code assertAdmin(userId)}：
 * Java 侧此前仅在 {@code AuthController.current()} 收口了「角色误判」（坑#13，C 方案），
 * 但 {@code /api/admin/**} 接口本身没有后端 admin 校验，任何登录用户均可直接调用
 * （列全量用户、读他人 AI 配置、增删改任意组件）。本拦截器补上接口层守门（fail-closed）。
 *
 * <p>dev 兜底：与 {@link com.mvgo.api.auth.SessionAuthService} 一致，仅当
 * {@code DEV_AUTO_LOGIN=true} 且非 prod profile 时放行（dev 环境 dev-local 不被当作管理员，
 * 但仍允许进入，避免破坏本地开发自测；prod 下强制校验 isAdmin，绝不接受开发/伪造身份）。
 *
 * @since 1.0.0
 */
@Component
public class AdminInterceptor implements HandlerInterceptor {

    private final MongoTemplate mongoTemplate;
    private final Environment environment;

    public AdminInterceptor(MongoTemplate mongoTemplate, Environment environment) {
        this.mongoTemplate = mongoTemplate;
        this.environment = environment;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // 0. raw=1 静态资源放行（与 SessionGuard 一致）
        if ("1".equals(request.getParameter("raw"))) {
            return true;
        }

        // 1. 开发态自动登录兜底：dev 环境整体放行，对齐 SessionGuard 的 dev fallback 语义
        String devAutoLogin = environment.getProperty("DEV_AUTO_LOGIN", "false");
        boolean isDevAutoLogin = "true".equalsIgnoreCase(devAutoLogin);
        if (isDevAutoLogin && !environment.acceptsProfiles(
                org.springframework.core.env.Profiles.of("prod"))) {
            return true;
        }

        // 2. 取 SessionGuard 写入的当前用户 uid（门户 uid，非 MongoDB _id）
        Object uidObj = request.getAttribute(AuthContext.ATTR_USER_ID);
        String uid = uidObj == null ? null : String.valueOf(uidObj);
        if (uid == null) {
            throw new BizException(401, "未登录或登录已过期");
        }

        // 3. 按 uid/username 查询用户，校验系统管理员标志（与 AuthController.current 同口径）
        UserDocument user = mongoTemplate.findOne(
                new Query(new Criteria().orOperator(
                        Criteria.where("uid").is(uid),
                        Criteria.where("username").is(uid))),
                UserDocument.class);
        if (user == null || !Boolean.TRUE.equals(user.getIsAdmin())) {
            throw new BizException(403, "需要管理员权限");
        }
        return true;
    }
}
